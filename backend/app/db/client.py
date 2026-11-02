import logging
from typing import Any, List, Dict
from backend.app.config import settings

logger = logging.getLogger("medipulse.db")

_client = None
_memory_repo = None

def get_db():
    global _client, _memory_repo
    if _client is not None:
        return _client
        
    if settings.USE_LOCAL_DB or not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        logger.info("Initializing high-fidelity in-memory transactional database repository")
        if _memory_repo is None:
            from backend.app.db.memory_repo import MemoryRepository
            _memory_repo = MemoryRepository()
        _client = _memory_repo
        return _client
    
    try:
        from supabase import create_client
        logger.info("Connecting to Supabase at %s", settings.SUPABASE_URL)
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        return _client
    except Exception as e:
        logger.warning("Failed to connect to Supabase (%s). Falling back to MemoryRepository.", e)
        if _memory_repo is None:
            from backend.app.db.memory_repo import MemoryRepository
            _memory_repo = MemoryRepository()
        _client = _memory_repo
        return _client

def rows(result: Any) -> List[Dict[str, Any]]:
    """Safely extract list of rows from PostgrestResponse or raw data."""
    if result is None:
        return []
    if hasattr(result, "data"):
        return result.data or []
    if isinstance(result, list):
        return result
    return [result]

db = get_db()

