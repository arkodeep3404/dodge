"""Graph query service — serves graph data to the frontend."""
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.ingestion.schema_registry import LAZY_COLLECTIONS, ENTITY_REGISTRY, NODE_COLORS


async def get_initial_graph(db: AsyncIOMotorDatabase) -> dict:
    """Get core O2C graph nodes + edges, excluding lazy-loaded collections."""
    lazy_types = set()
    for coll_name in LAZY_COLLECTIONS:
        if coll_name in ENTITY_REGISTRY:
            lazy_types.add(ENTITY_REGISTRY[coll_name]["node_type"])

    # Get non-lazy nodes
    nodes = []
    async for doc in db["nodes"].find({"type": {"$nin": list(lazy_types)}}):
        doc.pop("_id", None)
        nodes.append(doc)

    # Get all node IDs for filtering edges
    node_ids = {n["id"] for n in nodes}

    # Get edges where both source and target are in the loaded nodes
    edges = []
    async for doc in db["edges"].find():
        doc.pop("_id", None)
        if doc["source"] in node_ids and doc["target"] in node_ids:
            edges.append(doc)

    return {"nodes": nodes, "edges": edges, "node_colors": NODE_COLORS}


async def get_node_neighbors(db: AsyncIOMotorDatabase, node_id: str) -> dict:
    """Get all neighbors of a node (1-hop)."""
    # Find edges where this node is source or target
    edges = []
    neighbor_ids = set()

    async for doc in db["edges"].find({"$or": [{"source": node_id}, {"target": node_id}]}):
        doc.pop("_id", None)
        edges.append(doc)
        other = doc["target"] if doc["source"] == node_id else doc["source"]
        neighbor_ids.add(other)

    # Fetch neighbor nodes
    nodes = []
    if neighbor_ids:
        async for doc in db["nodes"].find({"id": {"$in": list(neighbor_ids)}}):
            doc.pop("_id", None)
            nodes.append(doc)

    # Also include the queried node itself
    queried = await db["nodes"].find_one({"id": node_id})
    if queried:
        queried.pop("_id", None)
        nodes.append(queried)

    return {"nodes": nodes, "edges": edges, "node_colors": NODE_COLORS}


async def get_node_detail(db: AsyncIOMotorDatabase, node_id: str) -> dict | None:
    """Get full metadata for a single node including raw document data."""
    node = await db["nodes"].find_one({"id": node_id})
    if not node:
        return None

    node.pop("_id", None)

    # Fetch full raw document from the source collection
    entity_def = None
    collection_name = None
    for coll_name, edef in ENTITY_REGISTRY.items():
        if edef["node_type"] == node["type"]:
            entity_def = edef
            collection_name = coll_name
            break

    raw_doc = None
    if entity_def:
        # Build a filter from the node properties (more reliable than parsing ID)
        pk_fields = entity_def["pk_fields"]
        props = node.get("properties", {})
        query = {f: props[f] for f in pk_fields if f in props}

        # Fallback: parse from node ID if properties don't have PK fields
        if len(query) < len(pk_fields):
            id_parts = node["id"].split("::", 1)
            if len(id_parts) == 2:
                pk_values = id_parts[1].split("-")
                if len(pk_fields) == 1:
                    query = {pk_fields[0]: id_parts[1]}
                else:
                    query = {}
                    for i, field in enumerate(pk_fields):
                        if i < len(pk_values):
                            query[field] = pk_values[i]

        if query and collection_name:
            raw_doc = await db[collection_name].find_one(query)
            if raw_doc:
                raw_doc.pop("_id", None)

    # Count connections
    edge_count = await db["edges"].count_documents(
        {"$or": [{"source": node_id}, {"target": node_id}]}
    )

    return {
        **node,
        "raw_properties": raw_doc or {},
        "connections": edge_count,
    }


async def search_nodes(db: AsyncIOMotorDatabase, query: str, node_type: str | None = None) -> list:
    """Search nodes by label or ID substring."""
    search_filter = {
        "$or": [
            {"label": {"$regex": query, "$options": "i"}},
            {"id": {"$regex": query, "$options": "i"}},
        ]
    }
    if node_type:
        search_filter["type"] = node_type

    results = []
    async for doc in db["nodes"].find(search_filter).limit(50):
        doc.pop("_id", None)
        results.append(doc)

    return results


async def get_graph_stats(db: AsyncIOMotorDatabase) -> dict:
    """Get summary statistics of the graph."""
    pipeline = [
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]

    node_stats = {}
    async for doc in db["nodes"].aggregate(pipeline):
        node_stats[doc["_id"]] = doc["count"]

    edge_stats = {}
    async for doc in db["edges"].aggregate(pipeline):
        edge_stats[doc["_id"]] = doc["count"]

    return {
        "total_nodes": sum(node_stats.values()),
        "total_edges": sum(edge_stats.values()),
        "nodes_by_type": node_stats,
        "edges_by_type": edge_stats,
    }
