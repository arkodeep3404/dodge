from pydantic import BaseModel
from app.models.node import NodeResponse
from app.models.edge import EdgeResponse


class GraphData(BaseModel):
    nodes: list[NodeResponse]
    edges: list[EdgeResponse]
    node_colors: dict[str, str] = {}
