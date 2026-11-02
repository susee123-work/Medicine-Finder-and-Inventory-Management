import time
from collections import defaultdict
from typing import Dict, List
from fastapi import Request, HTTPException, status

class InMemoryRateLimiter:
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.window_seconds = 60
        self.records: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        
        # Clean older entries
        self.records[client_id] = [t for t in self.records[client_id] if t > cutoff]
        
        if len(self.records[client_id]) >= self.requests_per_minute:
            return False
            
        self.records[client_id].append(now)
        return True

limiter = InMemoryRateLimiter(requests_per_minute=60)

async def check_rate_limit(request: Request):
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not limiter.is_allowed(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please wait a moment before trying again."
        )
