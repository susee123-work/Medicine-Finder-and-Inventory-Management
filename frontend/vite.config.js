import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/pharmacies': 'http://127.0.0.1:8000',
      '/suppliers': 'http://127.0.0.1:8000',
      '/medicines': 'http://127.0.0.1:8000',
      '/inventory': 'http://127.0.0.1:8000',
      '/sales': 'http://127.0.0.1:8000',
      '/deliveries': 'http://127.0.0.1:8000',
      '/predictions': 'http://127.0.0.1:8000',
      '/finder': 'http://127.0.0.1:8000',
      '/analytics': 'http://127.0.0.1:8000',
      '/alerts': 'http://127.0.0.1:8000',
      '/email': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/metrics': 'http://127.0.0.1:8000',
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true
      }
    }
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: './src/test/setup.js'
  }
});
