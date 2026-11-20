import { useContext, useEffect, useRef } from 'react';
import { WebSocketContext } from '../context/wsContext';

export function useLiveSocket() {
  return useContext(WebSocketContext);
}

/**
 * Subscribe to specific live WebSocket event types and invoke callback automatically.
 * Keeps callback fresh via ref without re-subscribing on every render.
 */
export function useLiveEvents(eventTypes, callback) {
  const { subscribe } = useContext(WebSocketContext);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const key = Array.isArray(eventTypes) ? eventTypes.join(',') : String(eventTypes);

  useEffect(() => {
    const types = key.split(',').filter(Boolean);
    return subscribe(types, (event) => {
      cbRef.current(event);
    });
  }, [subscribe, key]);
}
