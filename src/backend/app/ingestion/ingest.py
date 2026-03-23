"""
Data ingestion: reads JSONL files from dataset/ and loads them into MongoDB.
"""
import json
import logging
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def ingest_collection(
    db: AsyncIOMotorDatabase,
    collection_name: str,
    data_dir: Path,
) -> int:
    """Ingest all JSONL files from a directory into a MongoDB collection."""
    collection = db[collection_name]
    await collection.drop()

    documents = []
    for jsonl_file in sorted(data_dir.glob("*.jsonl")):
        with open(jsonl_file, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    documents.append(json.loads(line))

    if not documents:
        logger.warning(f"No documents found for {collection_name}")
        return 0

    # Batch insert
    batch_size = 500
    for i in range(0, len(documents), batch_size):
        batch = documents[i : i + batch_size]
        await collection.insert_many(batch)

    logger.info(f"Ingested {len(documents)} docs into {collection_name}")
    return len(documents)


async def ingest_all(db: AsyncIOMotorDatabase, dataset_path: str) -> dict:
    """Ingest all entity types from the dataset directory."""
    dataset_dir = Path(dataset_path)
    if not dataset_dir.exists():
        raise FileNotFoundError(f"Dataset not found at {dataset_dir}")

    results = {}
    for subdir in sorted(dataset_dir.iterdir()):
        if subdir.is_dir() and not subdir.name.startswith("."):
            count = await ingest_collection(db, subdir.name, subdir)
            results[subdir.name] = count

    logger.info(f"Ingestion complete: {sum(results.values())} total documents")
    return results
