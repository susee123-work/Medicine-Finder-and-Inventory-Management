import { createContext } from 'react';

export const WebSocketContext = createContext({
  status: 'disconnected',
  clientsCount: 0,
  liveMetrics: null,
  eventFeed: [],
  lastEvent: null,
  subscribe: () => () => {},
  requestSnapshot: () => {},
});
