"""
Tool definitions for the LangGraph ReAct agent.
Each tool queries MongoDB and returns structured results.
"""
import json
from langchain_core.tools import tool
from app.db.mongodb import get_db
from app.services.flow_tracer import (
    trace_order_flow,
    trace_billing_flow,
    find_broken_flows as _find_broken_flows,
)


def _serialize(obj) -> str:
    """Serialize MongoDB results to JSON string for the LLM."""
    if isinstance(obj, list):
        # Truncate very long lists
        if len(obj) > 20:
            return json.dumps(obj[:20], default=str) + f"\n... ({len(obj)} total results, showing first 20)"
        return json.dumps(obj, default=str)
    return json.dumps(obj, default=str)


@tool
async def query_collection(
    collection: str,
    filter: dict | None = None,
    projection: dict | None = None,
    sort: dict | None = None,
    limit: int = 20,
    aggregation: list | None = None,
) -> str:
    """Query a MongoDB collection with filters or aggregation pipeline.

    Args:
        collection: Collection name (e.g., 'sales_order_headers', 'billing_document_items')
        filter: MongoDB query filter (e.g., {"salesOrder": "740506"})
        projection: Fields to include/exclude (e.g., {"salesOrder": 1, "totalNetAmount": 1})
        sort: Sort order (e.g., {"totalNetAmount": -1})
        limit: Max results to return (default 20)
        aggregation: Full MongoDB aggregation pipeline (overrides filter/projection/sort)
    """
    db = get_db()

    try:
        if aggregation:
            results = []
            async for doc in db[collection].aggregate(aggregation):
                doc.pop("_id", None)
                results.append(doc)
            return _serialize(results)

        query = filter or {}
        cursor = db[collection].find(query, projection)
        if sort and isinstance(sort, dict):
            cursor = cursor.sort(list(sort.items()))
        cursor = cursor.limit(min(limit, 100))

        results = []
        async for doc in cursor:
            doc.pop("_id", None)
            results.append(doc)
    except Exception as e:
        return f"Query error: {str(e)}"

    if not results:
        return f"No results found in {collection} with filter {json.dumps(query, default=str)}"

    return _serialize(results)


@tool
async def trace_order(sales_order: str) -> str:
    """Trace the complete Order-to-Cash flow for a sales order number.
    Returns the full chain: Sales Order → Delivery → Billing → Journal Entry → Payment.

    Args:
        sales_order: The sales order number (e.g., "740506")
    """
    db = get_db()
    result = await trace_order_flow(db, sales_order)
    return _serialize(result)


@tool
async def trace_billing(billing_document: str) -> str:
    """Trace the full flow starting from a billing document, both backwards
    (to deliveries and sales orders) and forwards (to journal entries and payments).

    Args:
        billing_document: The billing document number (e.g., "90504248")
    """
    db = get_db()
    result = await trace_billing_flow(db, billing_document)
    return _serialize(result)


@tool
async def find_broken_flows(break_type: str = "all") -> str:
    """Find sales orders with incomplete or broken O2C flows.

    Args:
        break_type: Filter by break type. Options:
            - "all": All broken flows
            - "no_delivery": Orders with no delivery
            - "no_billing": Delivered but not billed
            - "no_journal_entry": Billed but no journal entry
            - "no_payment": Journal entry but no payment
    """
    db = get_db()
    results = await _find_broken_flows(db, break_type)
    return _serialize(results)


@tool
async def get_graph_neighbors(node_id: str) -> str:
    """Get all entities directly connected to a given entity in the graph.

    Args:
        node_id: The node ID (e.g., "sales_order::740506", "customer::310000108")
    """
    db = get_db()
    edges = []
    async for doc in db["edges"].find(
        {"$or": [{"source": node_id}, {"target": node_id}]}
    ):
        doc.pop("_id", None)
        edges.append(doc)

    if not edges:
        return f"No connections found for node {node_id}"

    # Get connected node details
    neighbor_ids = set()
    for e in edges:
        neighbor_ids.add(e["target"] if e["source"] == node_id else e["source"])

    neighbors = []
    async for doc in db["nodes"].find({"id": {"$in": list(neighbor_ids)}}):
        doc.pop("_id", None)
        neighbors.append({"id": doc["id"], "type": doc["type"], "label": doc["label"]})

    return _serialize({"node_id": node_id, "neighbors": neighbors, "edges": edges})


@tool
async def search_entities(
    entity_type: str,
    search_field: str,
    search_value: str,
) -> str:
    """Search for entities by a specific field value.

    Args:
        entity_type: Collection name (e.g., 'products', 'business_partners')
        search_field: Field name to search (e.g., 'product', 'businessPartnerFullName')
        search_value: Value to search for (exact match or substring)
    """
    db = get_db()

    # Try exact match first
    results = []
    async for doc in db[entity_type].find({search_field: search_value}).limit(10):
        doc.pop("_id", None)
        results.append(doc)

    # If no exact match, try regex
    if not results:
        async for doc in db[entity_type].find(
            {search_field: {"$regex": search_value, "$options": "i"}}
        ).limit(10):
            doc.pop("_id", None)
            results.append(doc)

    if not results:
        return f"No {entity_type} found with {search_field} = '{search_value}'"

    return _serialize(results)


# All tools available to the agent
ALL_TOOLS = [
    query_collection,
    trace_order,
    trace_billing,
    find_broken_flows,
    get_graph_neighbors,
    search_entities,
]
