from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


class ToolCall(BaseModel):
    tool_name: str
    tool_input: dict = {}


class ChatResponse(BaseModel):
    response: str
    referenced_nodes: list[str] = []
    conversation_id: str
    tools_used: list[ToolCall] = []
    query_used: str | None = None
