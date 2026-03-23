import json
import logging
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.models.chat import ChatRequest, ChatResponse
from app.agent.graph_agent import process_query, process_query_stream

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Process a natural language query and return a data-backed answer."""
    result = await process_query(request.message, request.conversation_id)
    return ChatResponse(**result)


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """Process a query with SSE streaming response."""

    async def event_generator():
        try:
            async for chunk in process_query_stream(
                request.message, request.conversation_id
            ):
                data = json.dumps(chunk)
                yield f"data: {data}\n\n"
        except Exception as e:
            logger.error(f"SSE stream error: {e}")
            error_data = json.dumps({
                "type": "done",
                "content": "An error occurred. Please try again.",
                "referenced_nodes": [],
                "conversation_id": request.conversation_id or "",
            })
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
