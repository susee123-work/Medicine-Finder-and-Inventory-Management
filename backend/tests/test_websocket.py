"""Tests for real-time WebSocket live telemetry and event broadcasting."""


def test_websocket_live_connection_and_ping(client):
    with client.websocket_connect("/ws/live?role=pharmacy_admin") as ws:
        # 1. Immediate CONNECTED snapshot
        welcome = ws.receive_json()
        assert welcome["type"] == "CONNECTED"
        assert welcome["clients_count"] >= 1
        assert "metrics" in welcome["payload"]
        assert welcome["payload"]["metrics"]["pharmacies"] > 0

        # 2. Presence broadcast
        presence = ws.receive_json()
        assert presence["type"] == "PRESENCE_UPDATE"
        assert presence["clients_count"] >= 1

        # 3. Ping / Pong roundtrip
        ws.send_json({"action": "ping"})
        pong = ws.receive_json()
        assert pong["type"] == "PONG"
        assert "metrics" in pong["payload"]

        # 4. Snapshot on demand
        ws.send_json({"action": "snapshot"})
        snap = ws.receive_json()
        assert snap["type"] == "SNAPSHOT"
        assert snap["payload"]["metrics"]["medicines"] > 0
