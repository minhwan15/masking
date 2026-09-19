import { defineConfig } from 'vite';
export default defineConfig({
  root: 'dist',
  publicDir: false,
  server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
  optimizeDeps: { noDiscovery: true }
});
