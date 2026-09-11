import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/handwrite-search/',
  publicDir: 'public',
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
  },
});
