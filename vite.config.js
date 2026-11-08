import { defineConfig } from 'vite';

// base './' is required so the packaged app can load assets via file://
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
