"""
LangGraph ReAct agent for natural language querying of the O2C dataset.
Uses GPT-5.4 with tool-calling for structured MongoDB queries.
"""
import asyncio
import json
import re
import time
import uuid
import logging

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage
from langchain.agents import create_agent

from app.config import settings
from app.agent.prompts import SYSTEM_PROMPT, GUARDRAIL_PROMPT
from app.agent.tools import ALL_TOOLS
from app.agent.guardrails import fast_filter, REJECTION_MESSAGE

logger = logging.getLogger(__name__)

# In-memory conversation store with timestamps for cleanup
_conversations: dict[str, dict] = {}
MAX_CONVERSATIONS = 100
CONVERSATION_TTL = 3600  # 1 hour


def _cleanup_old_conversations():
    """Remove conversations older than TTL."""
    now = time.time()
    expired = [
        cid for cid, data in _conversations.items()
        if now - data["last_access"] > CONVERSATION_TTL
    ]
    for cid in expired:
        del _conversations[cid]
    if len(_conversations) > MAX_CONVERSATIONS:
        sorted_convs = sorted(_conversations.items(), key=lambda x: x[1]["last_access"])
        for cid, _ in sorted_convs[: len(_conversations) - MAX_CONVERSATIONS]:
            del _conversations[cid]


def _get_or_create_conversation(conversation_id: str) -> list:
    """Get or create conversation history with cleanup."""
    _cleanup_old_conversations()
    if conversation_id not in _conversations:
        _conversations[conversation_id] = {"messages": [], "last_access": time.time()}
    else:
        _conversations[conversation_id]["last_access"] = time.time()
    return _conversations[conversation_id]["messages"]


PRIMARY_MODEL = "gpt-5.4"
FALLBACK_MODEL = "gpt-5.4-mini"

# Track model state
_current_model = PRIMARY_MODEL
_fallback_until: float = 0  # timestamp when to try switching back to primary


def _get_llm(model: str | None = None):
    global _current_model, _fallback_until
    use_model = model or _current_model

    # Check if we should try switching back to primary
    if _current_model == FALLBACK_MODEL and _fallback_until > 0 and time.time() > _fallback_until:
        logger.info(f"Attempting to switch back to primary model {PRIMARY_MODEL}")
        _current_model = PRIMARY_MODEL
        use_model = PRIMARY_MODEL
        _fallback_until = 0  # Reset so we don't keep logging

    return ChatOpenAI(
        model=use_model,
        api_key=settings.openai_api_key,
        temperature=0,
        streaming=True,
        max_tokens=4096,
        timeout=120,
        model_kwargs={
            "frequency_penalty": 0.3,
            "presence_penalty": 0.2,
        },
    )


def _switch_to_fallback(retry_after_seconds: int = 60):
    """Switch to fallback model when primary is rate-limited."""
    global _current_model, _fallback_until
    _current_model = FALLBACK_MODEL
    _fallback_until = time.time() + retry_after_seconds
    logger.warning(f"Switched to fallback model {FALLBACK_MODEL}, will retry primary in {retry_after_seconds}s")


def _is_rate_limit_error(e: Exception) -> bool:
    return "429" in str(e) or "rate_limit" in str(e).lower()


def _get_agent():
    llm = _get_llm()
    return create_agent(
        llm,
        tools=ALL_TOOLS,
        system_prompt=SYSTEM_PROMPT,
    )


async def _check_guardrail_llm(query: str) -> bool:
    """Use LLM to classify ambiguous queries. Returns True if on-topic."""
    try:
        llm = _get_llm()
        response = await llm.ainvoke([
            HumanMessage(content=GUARDRAIL_PROMPT.format(query=query))
        ])
        return response.content.strip().upper().startswith("YES")
    except Exception as e:
        logger.error(f"Guardrail LLM check failed: {e}")
        return True


def _extract_tools_from_messages(messages: list) -> list[dict]:
    """Extract tool call details from agent message history."""
    tools_used = []
    for msg in messages:
        if isinstance(msg, AIMessage) and msg.tool_calls:
            for tc in msg.tool_calls:
                tools_used.append({
                    "tool_name": tc.get("name", "unknown"),
                    "tool_input": tc.get("args", {}),
                })
    return tools_used


async def process_query(message: str, conversation_id: str | None = None) -> dict:
    """Process a user query through the guardrail + agent pipeline."""
    if not conversation_id:
        conversation_id = str(uuid.uuid4())

    has_history = (
        conversation_id in _conversations
        and len(_conversations[conversation_id].get("messages", [])) > 0
    )

    # Guardrail strategy:
    # - No history: full guardrail (fast filter + LLM classifier)
    # - Has history: skip fast filter (too aggressive for follow-ups like "yes do that")
    #               but still run LLM classifier for clearly off-topic messages (poems, jokes)
    filter_result = fast_filter(message)
    rejection = {
        "response": REJECTION_MESSAGE,
        "referenced_nodes": [],
        "conversation_id": conversation_id,
        "tools_used": [],
        "query_used": None,
    }

    # "hard_off_topic" = regex match (poem, recipe, joke) → ALWAYS block
    if filter_result == "hard_off_topic":
        return rejection

    if not has_history:
        # First message: block soft off-topic, check uncertain with LLM
        if filter_result == "soft_off_topic":
            return rejection
        if filter_result is None:
            if not await _check_guardrail_llm(message):
                return rejection
    else:
        # Has history: allow soft off-topic (could be "yes", "do that")
        # Only check uncertain cases with LLM
        if filter_result is None:
            pass  # Allow — could be a contextual follow-up

    history = _get_or_create_conversation(conversation_id)
    history.append(HumanMessage(content=message))

    tools_used = []
    response_text = ""
    model_notice = ""
    max_retries = 3

    # Check if we just switched back to primary
    if _current_model == PRIMARY_MODEL and _fallback_until > 0 and time.time() > _fallback_until:
        model_notice = f"\n\n---\n*Switched back to primary model ({PRIMARY_MODEL}) for best performance.*"

    for attempt in range(max_retries):
        try:
            agent = _get_agent()
            result = await agent.ainvoke({"messages": history})

            tools_used = _extract_tools_from_messages(result["messages"])
            ai_messages = [
                m for m in result["messages"]
                if isinstance(m, AIMessage) and m.content
            ]
            response_text = (
                ai_messages[-1].content if ai_messages
                else "I couldn't process that query. Please try rephrasing."
            )
            break  # Success
        except Exception as e:
            logger.error(f"Agent attempt {attempt + 1}/{max_retries} with {_current_model} failed: {e}")

            if _is_rate_limit_error(e):
                # Rate limit → switch to fallback immediately, no retries on primary
                if _current_model == PRIMARY_MODEL:
                    _switch_to_fallback(retry_after_seconds=120)
                    model_notice = (
                        f"\n\n---\n*The primary model ({PRIMARY_MODEL}) hit its rate limit. "
                        f"Switching to {FALLBACK_MODEL} temporarily. Performance may be slightly reduced. "
                        f"Will switch back to the primary model in ~2 minutes.*"
                    )
                    continue  # Retry immediately with fallback model
                else:
                    # Even fallback is rate-limited — wait and retry
                    if attempt < max_retries - 1:
                        await asyncio.sleep(5)
                        continue
            else:
                # Normal error → retry with exponential backoff, stay on same model
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    await asyncio.sleep(wait)
                    continue

            # All retries exhausted
            response_text = "Sorry, I wasn't able to process your query after multiple attempts. Please try again."

    response_text += model_notice

    referenced_nodes = _extract_node_references(response_text)

    history.append(AIMessage(content=response_text))
    if len(history) > 20:
        _conversations[conversation_id]["messages"] = history[-20:]

    # Build a summary of the query used
    query_summary = None
    if tools_used:
        summaries = []
        for t in tools_used:
            inp = t["tool_input"]
            if t["tool_name"] == "query_collection":
                coll = inp.get("collection", "?")
                if inp.get("aggregation"):
                    summaries.append(f"db.{coll}.aggregate({json.dumps(inp['aggregation'], default=str)[:200]})")
                else:
                    filt = inp.get("filter", {})
                    summaries.append(f"db.{coll}.find({json.dumps(filt, default=str)[:150]})")
            else:
                summaries.append(f"{t['tool_name']}({json.dumps(inp, default=str)[:100]})")
        query_summary = " → ".join(summaries)

    return {
        "response": response_text,
        "referenced_nodes": referenced_nodes,
        "conversation_id": conversation_id,
        "tools_used": tools_used,
        "query_used": query_summary,
    }


def _extract_node_references(response: str) -> list[str]:
    """Extract node IDs referenced in the response text."""
    node_ids = set()

    doc_patterns = {
        r"\b(7[0-9]{5})\b": "sales_order",
        r"\b(807[0-9]{5})\b": "delivery",
        r"\b(905[0-9]{5,})\b": "billing",
        r"\b(906[0-9]{5,})\b": "billing",
        r"\b(911[0-9]{5,})\b": "billing",
        r"\b(940[0-9]{7})\b": "journal",
        r"\b(3[12]0[0-9]{6})\b": "customer",
        r"\b([SB][0-9]{12,})\b": "product",
    }

    for pattern, node_type in doc_patterns.items():
        for match in re.finditer(pattern, response):
            node_ids.add(f"{node_type}::{match.group(1)}")

    return list(node_ids)


async def process_query_stream(message: str, conversation_id: str | None = None):
    """Process query with streaming response. Yields chunks."""
    if not conversation_id:
        conversation_id = str(uuid.uuid4())

    has_history = (
        conversation_id in _conversations
        and len(_conversations[conversation_id].get("messages", [])) > 0
    )

    filter_result = fast_filter(message)

    if filter_result == "hard_off_topic":
        yield {"type": "response", "content": REJECTION_MESSAGE, "conversation_id": conversation_id}
        return

    if not has_history:
        if filter_result == "soft_off_topic":
            yield {"type": "response", "content": REJECTION_MESSAGE, "conversation_id": conversation_id}
            return
        if filter_result is None:
            if not await _check_guardrail_llm(message):
                yield {"type": "response", "content": REJECTION_MESSAGE, "conversation_id": conversation_id}
                return

    history = _get_or_create_conversation(conversation_id)
    history.append(HumanMessage(content=message))

    full_response = ""
    tools_used = []
    model_notice = ""
    max_retries = 3

    if _current_model == PRIMARY_MODEL and _fallback_until > 0 and time.time() > _fallback_until:
        model_notice = f"\n\n---\n*Switched back to primary model ({PRIMARY_MODEL}) for best performance.*"

    for attempt in range(max_retries):
        try:
            agent = _get_agent()
            full_response = ""
            tools_used = []

            async for event in agent.astream_events({"messages": history}, version="v2"):
                try:
                    kind = event.get("event", "")
                    if kind == "on_chat_model_stream":
                        chunk = event.get("data", {}).get("chunk")
                        if chunk and chunk.content:
                            full_response += chunk.content
                            yield {"type": "token", "content": chunk.content}
                    elif kind == "on_tool_start":
                        tool_name = event.get("name", "unknown")
                        tool_input = event.get("data", {}).get("input", {})
                        tools_used.append({"tool_name": tool_name, "tool_input": tool_input})
                        yield {"type": "tool_start", "content": tool_name, "tool_input": tool_input}
                    elif kind == "on_tool_end":
                        yield {"type": "tool_end", "content": "Tool completed"}
                except Exception as e:
                    logger.warning(f"Error processing stream event: {e}")
                    continue
            break  # Success
        except Exception as e:
            logger.error(f"Streaming attempt {attempt + 1}/{max_retries} with {_current_model} failed: {e}")

            if _is_rate_limit_error(e):
                if _current_model == PRIMARY_MODEL:
                    _switch_to_fallback(retry_after_seconds=120)
                    model_notice = (
                        f"\n\n---\n*The primary model ({PRIMARY_MODEL}) hit its rate limit. "
                        f"Switching to {FALLBACK_MODEL} temporarily. Performance may be slightly reduced. "
                        f"Will switch back to the primary model in ~2 minutes.*"
                    )
                    yield {"type": "status", "content": f"Primary model rate-limited. Switching to {FALLBACK_MODEL}..."}
                    continue
                else:
                    if attempt < max_retries - 1:
                        yield {"type": "status", "content": f"Rate-limited, retrying in 5s... (attempt {attempt + 2}/{max_retries})"}
                        await asyncio.sleep(5)
                        continue
            else:
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    yield {"type": "status", "content": f"Request failed, retrying in {wait}s... (attempt {attempt + 2}/{max_retries})"}
                    await asyncio.sleep(wait)
                    continue

            full_response = "Sorry, I wasn't able to process your query after multiple attempts. Please try again."
            yield {"type": "token", "content": full_response}

    if model_notice:
        full_response += model_notice
        yield {"type": "token", "content": model_notice}

    referenced_nodes = _extract_node_references(full_response)
    history.append(AIMessage(content=full_response))
    if len(history) > 20:
        _conversations[conversation_id]["messages"] = history[-20:]

    # Build query summary
    query_summary = None
    if tools_used:
        summaries = []
        for t in tools_used:
            inp = t.get("tool_input", {})
            if t["tool_name"] == "query_collection":
                coll = inp.get("collection", "?") if isinstance(inp, dict) else "?"
                summaries.append(f"db.{coll}.find(...)")
            else:
                summaries.append(t["tool_name"])
        query_summary = " → ".join(summaries)

    yield {
        "type": "done",
        "content": full_response,
        "referenced_nodes": referenced_nodes,
        "conversation_id": conversation_id,
        "tools_used": tools_used,
        "query_used": query_summary,
    }
