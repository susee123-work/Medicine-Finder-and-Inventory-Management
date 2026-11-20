import asyncio
import time
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.app.config import settings
from backend.app.db.client import db, rows
from backend.app.core.websocket import ws_manager
from backend.app.api import (
    auth,
    inventory,
    predictions,
    finder,
    community,
    olap,
    mining,
    alerts,
    monitoring
)

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("medipulse.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    ws_manager.set_event_loop(asyncio.get_running_loop())
    logger.info("Initializing %s v%s in %s mode...", settings.PROJECT_NAME, settings.VERSION, settings.ENV)
    # Check if database has data; if empty, run automated seed
    try:
        pharms = rows(db.table("pharmacies").select("id").limit(1).execute())
        if not pharms:
            logger.info("Database is unpopulated. Triggering automatic initial seed...")
            from backend.app.seed.generate_seed import seed_database
            seed_database()
    except Exception as e:
        logger.warning("Could not auto-seed database: %s", e)
    yield
    logger.info("Shutting down %s...", settings.PROJECT_NAME)

app = FastAPI(
    title="MediPulse AI API",
    description="A Predictive Medicine Availability and Community Shortage Intelligence System Using Data Warehousing and Data Mining",
    version=settings.VERSION,
    lifespan=lifespan
)

# Strict CORS origin lock with automatic support for Render deployments (*.onrender.com)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS if settings.ALLOWED_ORIGINS else ["*"],
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"]
)

# Structured request latency logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start_time) * 1000, 2)
    logger.info(
        "HTTP %s %s [%d] (%.2f ms) client=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request.client.host if request.client else "unknown"
    )
    return response

# Register API Routers
app.include_router(auth.router)
app.include_router(inventory.router)
app.include_router(predictions.router)
app.include_router(finder.router)
app.include_router(community.router)
app.include_router(olap.router)
app.include_router(mining.router)
app.include_router(alerts.router)
app.include_router(monitoring.router)

_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

@app.get("/api/info")
def api_info():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs_url": "/docs",
        "health_check": "/health",
        "websocket_live": "/ws/live",
        "olap_cube": "/analytics/olap/cube",
        "shortage_predictions": "/predictions/shortages",
        "community_signals": "/analytics/community",
        "data_mining": "/analytics/mining/association-rules"
    }

@app.get("/")
def root():
    index_file = _FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return api_info()


def _live_snapshot() -> dict:
    try:
        return {
            "pharmacies": len(rows(db.table("pharmacies").select("id").execute())),
            "medicines": len(rows(db.table("medicines").select("id").execute())),
            "batches": len(rows(db.table("inventory").select("id").execute())),
            "sales": len(rows(db.table("sales").select("id").execute())),
            "deliveries": len(rows(db.table("deliveries").select("id").execute())),
            "clients_count": ws_manager.active_count,
        }
    except Exception:
        return {"clients_count": ws_manager.active_count}


@app.websocket("/ws/live")
async def websocket_live_endpoint(
    websocket: WebSocket,
    role: str = "guest",
    pharmacy_id: str = "",
):
    """Real-time bidirectional WebSocket channel for live dashboard, inventory & alert updates."""
    await ws_manager.connect(websocket, role=role, pharmacy_id=pharmacy_id or None)
    try:
        # Send immediate connected snapshot + recent event feed
        await websocket.send_json({
            "type": "CONNECTED",
            "summary": "Connected to MediPulse AI Live WebSocket",
            "payload": {
                "metrics": _live_snapshot(),
                "recent_events": ws_manager.get_recent_events(12),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "clients_count": ws_manager.active_count,
        })
        await ws_manager.broadcast(
            "PRESENCE_UPDATE",
            {"clients_count": ws_manager.active_count},
            f"{ws_manager.active_count} active session(s)",
        )

        while True:
            msg = await websocket.receive_json()
            action = (msg.get("action") or msg.get("type") or "").lower()
            if action == "ping":
                await websocket.send_json({
                    "type": "PONG",
                    "payload": {"metrics": _live_snapshot()},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "clients_count": ws_manager.active_count,
                })
            elif action == "snapshot":
                await websocket.send_json({
                    "type": "SNAPSHOT",
                    "payload": {"metrics": _live_snapshot()},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "clients_count": ws_manager.active_count,
                })
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        await ws_manager.broadcast(
            "PRESENCE_UPDATE",
            {"clients_count": ws_manager.active_count},
            f"{ws_manager.active_count} active session(s)",
        )
    except Exception:
        ws_manager.disconnect(websocket)


# Production SPA routing: serve Vite assets and fallback to index.html for client-side routing
if (_FRONTEND_DIST / "index.html").exists():
    _assets_dir = _FRONTEND_DIST / "assets"
    if _assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="frontend_assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa_frontend(full_path: str):
        if full_path.startswith(("api", "docs", "redoc", "openapi.json", "ws")):
            return None
        candidate = _FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(_FRONTEND_DIST / "index.html"))



