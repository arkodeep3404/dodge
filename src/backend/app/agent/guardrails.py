"""
Two-layer guardrail system for filtering off-topic queries.
Layer 1: Fast keyword/regex filter (no LLM call)
Layer 2: LLM classifier for ambiguous cases
"""
import re

# Domain-relevant keywords
ON_TOPIC_KEYWORDS = {
    "sales", "order", "delivery", "billing", "invoice", "payment", "journal",
    "customer", "product", "plant", "material", "document", "flow", "trace",
    "amount", "quantity", "shipped", "billed", "delivered", "cancelled",
    "broken", "incomplete", "status", "revenue", "total", "count", "top",
    "highest", "lowest", "average", "partner", "business", "address",
    "schedule", "storage", "location", "clearing", "accounting", "fiscal",
    "company", "currency", "net", "gross", "weight", "unit", "type",
    "group", "division", "channel", "organization", "o2c", "sap",
    "so ", "so:", "bill", "del ", "pay ", "je ", "how many", "which",
    "find", "show", "list", "get", "what", "where", "when", "who",
    "analyze", "analysis", "summary", "report", "data", "dataset",
    "distribution", "receivable", "profit", "cost", "price",
}

# Patterns that indicate off-topic queries
OFF_TOPIC_PATTERNS = [
    r"(?i)(write|compose|create)\s+(me\s+)?(a\s+)?(poem|story|essay|song|joke|code|script)",
    r"(?i)(who|what)\s+(is|was|are|were)\s+(the\s+)?(president|capital|largest|tallest)",
    r"(?i)(translate|convert)\s+.+\s+(to|into)\s+(french|spanish|german|hindi|chinese)",
    r"(?i)(recipe|cook|bake|ingredients)\s+",
    r"(?i)(weather|forecast|temperature)\s+(in|at|for)",
    r"(?i)(play|recommend)\s+(a\s+)?(game|movie|music|song)",
    r"(?i)tell\s+me\s+(a\s+)?(joke|riddle|fact\s+about)",
    r"(?i)(who|what)\s+invented\s+",
    r"(?i)(explain|teach)\s+(me\s+)?(quantum|relativity|evolution|history\s+of)",
    r"(?i)(how\s+to|steps\s+to)\s+(lose\s+weight|make\s+money|learn\s+)",
    r"(?i)who\s+(won|is|was)\s+(the\s+)?(world\s+cup|super\s+bowl|election|oscar|grammy)",
    r"(?i)(meaning|purpose)\s+of\s+(life|existence|love)",
    r"(?i)what\s+is\s+(love|happiness|consciousness|the\s+meaning)",
    r"(?i)\b(sing|draw|paint|design)\b\s+(me\s+)?",
    r"(?i)(help|assist)\s+(me\s+)?(with\s+)?(my\s+)?(homework|assignment|essay|exam)",
]

REJECTION_MESSAGE = (
    "This system is designed to answer questions related to the provided "
    "SAP Order-to-Cash dataset only. I can help you with queries about "
    "sales orders, deliveries, billing documents, payments, products, "
    "customers, and their relationships. Please ask a question about the data."
)


def fast_filter(query: str) -> str | None:
    """
    Fast pre-filter. Returns:
    - "on_topic" if clearly on-topic
    - "off_topic" if clearly off-topic
    - None if uncertain (needs LLM classification)
    """
    query_lower = query.lower().strip()

    # Check off-topic regex patterns — these are strong signals
    for pattern in OFF_TOPIC_PATTERNS:
        if re.search(pattern, query):
            return "hard_off_topic"

    # Check for domain keywords
    matches = sum(1 for kw in ON_TOPIC_KEYWORDS if kw in query_lower)
    if matches >= 2:
        return "on_topic"

    # Very short queries with no domain keywords — weak signal
    if len(query_lower.split()) <= 3 and matches == 0:
        return "soft_off_topic"

    # One keyword match in a longer query — uncertain
    return None
