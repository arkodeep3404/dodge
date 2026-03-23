"""
Graph Builder: constructs nodes and edges collections from raw data
using the schema registry as the blueprint.
"""
import logging
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.ingestion.schema_registry import ENTITY_REGISTRY, RELATIONSHIP_REGISTRY

logger = logging.getLogger(__name__)


def _render_template(template: str, doc: dict) -> str:
    """Render a node ID or label template using document fields."""
    try:
        return template.format(**doc)
    except KeyError:
        # Some fields may be missing; use what we have
        result = template
        for key, val in doc.items():
            result = result.replace(f"{{{key}}}", str(val))
        return result


def _build_node(collection_name: str, entity_def: dict, doc: dict) -> dict:
    """Build a node document from a raw entity document."""
    node_id = _render_template(entity_def["node_id_template"], doc)
    label = _render_template(entity_def["label_template"], doc)

    properties = {}
    for field in entity_def["display_fields"]:
        if field in doc:
            val = doc[field]
            # Flatten nested time objects
            if isinstance(val, dict):
                val = str(val)
            properties[field] = val

    return {
        "id": node_id,
        "type": entity_def["node_type"],
        "label": label,
        "properties": properties,
        "collection": collection_name,
    }


async def _build_nodes_for_collection(
    db: AsyncIOMotorDatabase,
    collection_name: str,
    entity_def: dict,
) -> int:
    """Build node documents for a single entity type."""
    raw_collection = db[collection_name]
    nodes_collection = db["nodes"]

    seen_ids = set()
    dedup_fields = entity_def.get("deduplicate_by")
    nodes_batch = []

    async for doc in raw_collection.find():
        node = _build_node(collection_name, entity_def, doc)

        # Deduplicate (e.g., journal entries have multiple items per document)
        if dedup_fields:
            dedup_key = tuple(str(doc.get(f, "")) for f in dedup_fields)
            if dedup_key in seen_ids:
                continue
            seen_ids.add(dedup_key)

        if node["id"] in seen_ids:
            continue
        seen_ids.add(node["id"])

        nodes_batch.append(node)

        if len(nodes_batch) >= 500:
            await nodes_collection.insert_many(nodes_batch)
            nodes_batch = []

    if nodes_batch:
        await nodes_collection.insert_many(nodes_batch)

    return len(seen_ids)


async def _build_edges_for_relationship(
    db: AsyncIOMotorDatabase,
    rel: dict,
) -> int:
    """Build edge documents for a single relationship type."""
    source_def = ENTITY_REGISTRY[rel["source_collection"]]
    target_def = ENTITY_REGISTRY[rel["target_collection"]]
    join = rel["join"]

    source_field = join["source_field"]
    target_field = join["target_field"]
    is_composite = isinstance(source_field, list)

    # Build a lookup index from target collection
    target_collection = db[rel["target_collection"]]
    target_dedup = target_def.get("deduplicate_by")
    target_index = {}
    seen_target_dedup = set()

    async for doc in target_collection.find():
        if target_dedup:
            dedup_key = tuple(str(doc.get(f, "")) for f in target_dedup)
            if dedup_key in seen_target_dedup:
                continue
            seen_target_dedup.add(dedup_key)

        if is_composite:
            key = tuple(str(doc.get(f, "")) for f in target_field)
        else:
            key = str(doc.get(target_field, ""))

        target_node_id = _render_template(target_def["node_id_template"], doc)
        target_index[key] = target_node_id

    # Iterate source collection and match
    source_collection = db[rel["source_collection"]]
    source_dedup = source_def.get("deduplicate_by")
    edges_batch = []
    seen_source_dedup = set()
    seen_edges = set()

    async for doc in source_collection.find():
        if source_dedup:
            dedup_key = tuple(str(doc.get(f, "")) for f in source_dedup)
            if dedup_key in seen_source_dedup:
                continue
            seen_source_dedup.add(dedup_key)

        if is_composite:
            lookup_key = tuple(str(doc.get(f, "")) for f in source_field)
        else:
            val = doc.get(source_field)
            if val is None or val == "":
                continue
            lookup_key = str(val)

        target_node_id = target_index.get(lookup_key)
        if not target_node_id:
            continue

        source_node_id = _render_template(source_def["node_id_template"], doc)
        edge_key = (source_node_id, target_node_id, rel["type"])

        if edge_key in seen_edges:
            continue
        seen_edges.add(edge_key)

        edges_batch.append({
            "source": source_node_id,
            "target": target_node_id,
            "type": rel["type"],
            "label": rel["type"].lower().replace("_", " "),
        })

        if len(edges_batch) >= 500:
            await db["edges"].insert_many(edges_batch)
            edges_batch = []

    if edges_batch:
        await db["edges"].insert_many(edges_batch)

    return len(seen_edges)


async def build_graph(db: AsyncIOMotorDatabase) -> dict:
    """Build the complete graph (nodes + edges) from raw collections."""
    # Clear existing graph
    await db["nodes"].drop()
    await db["edges"].drop()

    stats = {"nodes": {}, "edges": {}}

    # Build nodes for each entity type
    for collection_name, entity_def in ENTITY_REGISTRY.items():
        count = await _build_nodes_for_collection(db, collection_name, entity_def)
        stats["nodes"][entity_def["node_type"]] = count
        logger.info(f"Built {count} nodes for {entity_def['node_type']}")

    # Build edges for each relationship
    for rel in RELATIONSHIP_REGISTRY:
        count = await _build_edges_for_relationship(db, rel)
        stats["edges"][rel["type"]] = count
        logger.info(f"Built {count} edges for {rel['type']}")

    total_nodes = sum(stats["nodes"].values())
    total_edges = sum(stats["edges"].values())
    logger.info(f"Graph built: {total_nodes} nodes, {total_edges} edges")

    return stats
