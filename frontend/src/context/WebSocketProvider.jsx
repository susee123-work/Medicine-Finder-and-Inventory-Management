import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WebSocketContext } from './wsContext';

export default function WebSocketProvider({ user, children }) {
  const [status, setStatus] = useState('connecting');
  const [clientsCount, setClientsCount] = useState(0);
  const [liveMetrics, setLiveMetrics] = useState(null);
  const [eventFeed, setEventFeed] = useState([]);
  const [lastEvent, setLastEvent] = useState(null);

  const wsRef = useRef(null);
  const listenersRef = useRef(new Set());
  const reconnectTimerRef = useRef(null);
  const pingTimerRef = useRef(null);
  const retryDelayRef = useRef(1500);

  const subscribe = useCallback((eventTypes, callback) => {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    const entry = { types, callback };
    listenersRef.current.add(entry);
    return () => {
      listenersRef.current.delete(entry);
    };
  }, []);

  const requestSnapshot = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'snapshot' }));
    }
  }, []);

  useEffect(() => {
    let unmounted = false;
    const role = user?.role || 'guest';
    const pharmacyId = user?.pharmacy_id || '';

    const connect = () => {
      if (unmounted) return;
      const qs = new URLSearchParams({ role });
      if (pharmacyId) qs.set('pharmacy_id', pharmacyId);

      const envWs = import.meta.env.VITE_WS_BASE_URL;
      const envApi = import.meta.env.VITE_API_BASE_URL;
      let url;

      if (envWs && envWs.trim()) {
        const clean = envWs.trim().replace(/^http:/, 'ws:').replace(/^https:/, 'wss:').replace(/\/$/, '');
        url = `${clean}/ws/live?${qs.toString()}`;
      } else if (envApi && envApi.trim()) {
        const clean = envApi.trim().replace(/^http:/, 'ws:').replace(/^https:/, 'wss:').replace(/\/$/, '');
        url = `${clean}/ws/live?${qs.toString()}`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        url = `${protocol}//${window.location.host}/ws/live?${qs.toString()}`;
      }

      setStatus((prev) => (prev === 'connected' ? 'connected' : 'connecting'));

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          retryDelayRef.current = 1500;
          setStatus('connected');

          if (pingTimerRef.current) clearInterval(pingTimerRef.current);
          pingTimerRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ action: 'ping' }));
            }
          }, 25000);
        };

        ws.onmessage = (evt) => {
          if (unmounted) return;
          try {
            const msg = JSON.parse(evt.data);
            if (typeof msg.clients_count === 'number') {
              setClientsCount(msg.clients_count);
            }

            if (msg.type === 'CONNECTED') {
              if (msg.payload?.metrics) setLiveMetrics(msg.payload.metrics);
              if (Array.isArray(msg.payload?.recent_events)) {
                setEventFeed(msg.payload.recent_events.slice().reverse());
              }
            } else if (msg.type === 'PONG' || msg.type === 'SNAPSHOT') {
              if (msg.payload?.metrics) setLiveMetrics(msg.payload.metrics);
            } else if (msg.type === 'PRESENCE_UPDATE') {
              if (typeof msg.payload?.clients_count === 'number') {
                setClientsCount(msg.payload.clients_count);
              }
            } else {
              // Domain event (SALE_RECORDED, INVENTORY_UPDATED, ETL_COMPLETED, etc.)
              setLastEvent(msg);
              setEventFeed((prev) => [msg, ...prev].slice(0, 25));

              // Notify all matching subscribers
              listenersRef.current.forEach(({ types, callback }) => {
                if (types.includes('*') || types.includes(msg.type)) {
                  try {
                    callback(msg);
                  } catch (err) {
                    console.warn('WebSocket subscriber error:', err);
                  }
                }
              });

              // Refresh live DB metrics counters after domain mutations
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: 'snapshot' }));
              }
            }
          } catch (err) {
            console.warn('Invalid WebSocket payload:', err);
          }
        };

        ws.onclose = () => {
          if (pingTimerRef.current) clearInterval(pingTimerRef.current);
          if (unmounted) return;
          setStatus('reconnecting');
          const delay = retryDelayRef.current;
          retryDelayRef.current = Math.min(delay * 1.8, 12000);
          reconnectTimerRef.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          // onclose handles reconnection cleanly
        };
      } catch {
        if (!unmounted) {
          setStatus('reconnecting');
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user?.role, user?.pharmacy_id]);

  return (
    <WebSocketContext.Provider
      value={{
        status,
        clientsCount,
        liveMetrics,
        eventFeed,
        lastEvent,
        subscribe,
        requestSnapshot,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
