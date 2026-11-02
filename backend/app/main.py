import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from backend.app.config import settings
from backend.app.db.client import db, rows
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

# Strict CORS origin lock
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS if settings.ALLOWED_ORIGINS else ["*"],
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

@app.get("/")
def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs_url": "/docs",
        "health_check": "/health",
        "olap_cube": "/analytics/olap/cube",
        "shortage_predictions": "/predictions/shortages",
        "community_signals": "/analytics/community",
        "data_mining": "/analytics/mining/association-rules"
    }

