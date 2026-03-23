from pydantic import BaseModel


class EdgeDocument(BaseModel):
    source: str
    target: str
    type: str
    label: str


class EdgeResponse(BaseModel):
    source: str
    target: str
    type: str
    label: str
