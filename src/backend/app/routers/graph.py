from fastapi import APIRouter, HTTPException
from app.db.mongodb import get_db
from app.services import graph_service

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/initial")
async def get_initial_graph():
    """Get the core O2C graph for initial load."""
    db = get_db()
    return await graph_service.get_initial_graph(db)


@router.get("/neighbors/{node_id:path}")
async def get_neighbors(node_id: str):
    """Get 1-hop neighbors of a node."""
    db = get_db()
    return await graph_service.get_node_neighbors(db, node_id)


@router.get("/node/{node_id:path}")
async def get_node_detail(node_id: str):
    """Get full metadata for a node."""
    db = get_db()
    result = await graph_service.get_node_detail(db, node_id)
    if not result:
        raise HTTPException(status_code=404, detail="Node not found")
    return result


@router.get("/search")
async def search_nodes(q: str, type: str | None = None):
    """Search nodes by label or ID."""
    db = get_db()
    return await graph_service.search_nodes(db, q, type)


@router.get("/stats")
async def get_stats():
    """Get graph statistics."""
    db = get_db()
    return await graph_service.get_graph_stats(db)
