import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.db.mongodb import connect_db, close_db, get_db
from app.db.indexes import create_all_indexes
from app.ingestion.ingest import ingest_all
from app.ingestion.graph_builder import build_graph
from app.routers import graph, chat

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Static frontend path — look for the Next.js export
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend" / "out"
if not FRONTEND_DIR.exists():
    # Docker: frontend built into /app/static
    FRONTEND_DIR = Path("/app/static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_db()
    db = get_db()

    # Check if data is already ingested
    collections = await db.list_collection_names()
    if "nodes" not in collections or await db["nodes"].count_documents({}) == 0:
        logger.info("No graph data found. Running ingestion...")
        await ingest_all(db, settings.dataset_path)
        await build_graph(db)
        await create_all_indexes(db)
        logger.info("Ingestion and graph build complete.")
    else:
        logger.info(f"Graph data exists: {await db['nodes'].count_documents({})} nodes")

    yield

    # Shutdown
    await close_db()


app = FastAPI(
    title="SAP O2C Graph Query System",
    description="Graph-based data modeling and LLM-powered query system for SAP Order-to-Cash data",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes first
app.include_router(graph.router)
app.include_router(chat.router)


@app.get("/api/health")
async def health():
    db = get_db()
    node_count = await db["nodes"].count_documents({})
    edge_count = await db["edges"].count_documents({})
    return {
        "status": "healthy",
        "nodes": node_count,
        "edges": edge_count,
    }


@app.post("/api/ingest")
async def trigger_ingest():
    """Manually trigger data re-ingestion."""
    db = get_db()
    results = await ingest_all(db, settings.dataset_path)
    graph_stats = await build_graph(db)
    await create_all_indexes(db)
    return {"ingestion": results, "graph": graph_stats}


# Serve frontend static files — MUST be after API routes
if FRONTEND_DIR.exists():
    logger.info(f"Serving frontend from {FRONTEND_DIR}")

    # Serve Next.js static assets (_next/*)
    next_dir = FRONTEND_DIR / "_next"
    if next_dir.exists():
        app.mount("/_next", StaticFiles(directory=str(next_dir)), name="next-static")

    # Serve index.html for the root and any non-API routes (SPA fallback)
    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        # Try exact file first
        file_path = FRONTEND_DIR / path
        if file_path.is_file():
            return FileResponse(str(file_path))

        # Try path.html
        html_path = FRONTEND_DIR / f"{path}.html"
        if html_path.is_file():
            return FileResponse(str(html_path))

        # Fallback to index.html (SPA)
        index = FRONTEND_DIR / "index.html"
        if index.is_file():
            return FileResponse(str(index))

        return FileResponse(str(FRONTEND_DIR / "404.html"), status_code=404)
else:
    logger.warning(f"Frontend not found at {FRONTEND_DIR}. Run 'cd src/frontend && npm run build' first.")
