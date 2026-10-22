import { defineConfig } from 'vite';
import { officeBridge } from './server/bridge.ts';

export default defineConfig({
  plugins: [officeBridge()],
  server: { host: '127.0.0.1', port: 5173 },
});
