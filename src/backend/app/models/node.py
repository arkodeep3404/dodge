from pydantic import BaseModel


class NodeDocument(BaseModel):
    id: str
    type: str
    label: str
    properties: dict
    collection: str


class NodeResponse(BaseModel):
    id: str
    type: str
    label: str
    properties: dict
