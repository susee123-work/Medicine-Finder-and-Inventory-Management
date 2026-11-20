"""
MediPulse AI — Real-Time WebSocket Event Hub
Manages live browser connections and broadcasts real-time domain events
(inventory updates, FEFO sales, batch verifications, deliveries, confirmations,
ETL runs, model retraining, alerts, and presence counts).
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import WebSocket

logger = logging.getLogger("medipulse.ws")


class LiveEventManager:
    def __init__(self) -> None:
        self._connections: List[Dict[str, Any]] = []
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._recent_events: List[Dict[str, Any]] = []

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    @property
    def active_count(self) -> int:
        return len(self._connections)

    def get_recent_events(self, limit: int = 20) -> List[Dict[str, Any]]:
        return self._recent_events[-limit:]

    async def connect(
        self,
        websocket: WebSocket,
        role: str = "guest",
        pharmacy_id: Optional[str] = None,
    ) -> None:
        await websocket.accept()
        self._loop = asyncio.get_running_loop()
        self._connections.append({
            "ws": websocket,
            "role": role,
            "pharmacy_id": pharmacy_id,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("WebSocket connected (role=%s, active=%d)", role, len(self._connections))

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections = [c for c in self._connections if c["ws"] is not websocket]
        logger.info("WebSocket disconnected (active=%d)", len(self._connections))

    async def broadcast(
        self,
        event_type: str,
        payload: Optional[Dict[str, Any]] = None,
        summary: str = "",
    ) -> None:
        message = {
            "type": event_type,
            "summary": summary,
            "payload": payload or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "clients_count": len(self._connections),
        }

        if event_type not in ("HEARTBEAT", "PONG", "PRESENCE_UPDATE"):
            self._recent_events.append(message)
            if len(self._recent_events) > 50:
                self._recent_events = self._recent_events[-50:]

        dead: List[WebSocket] = []
        for conn in list(self._connections):
            try:
                await conn["ws"].send_json(message)
            except Exception:
                dead.append(conn["ws"])

        if dead:
            self._connections = [c for c in self._connections if c["ws"] not in dead]

    def broadcast_sync(
        self,
        event_type: str,
        payload: Optional[Dict[str, Any]] = None,
        summary: str = "",
    ) -> None:
        """Thread-safe broadcast callable from synchronous FastAPI route handlers."""
        if not self._connections and event_type in ("HEARTBEAT", "PONG", "PRESENCE_UPDATE"):
            return

        # Record in recent events even if no client is currently listening
        if not self._connections:
            if event_type not in ("HEARTBEAT", "PONG", "PRESENCE_UPDATE"):
                self._recent_events.append({
                    "type": event_type,
                    "summary": summary,
                    "payload": payload or {},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "clients_count": 0,
                })
                if len(self._recent_events) > 50:
                    self._recent_events = self._recent_events[-50:]
            return

        loop = self._loop
        if loop and loop.is_running():
            try:
                asyncio.run_coroutine_threadsafe(
                    self.broadcast(event_type, payload, summary),
                    loop,
                )
            except Exception as exc:
                logger.debug("Skipped WS broadcast (%s): %s", event_type, exc)


ws_manager = LiveEventManager()
