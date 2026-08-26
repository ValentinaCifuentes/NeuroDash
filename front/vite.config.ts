import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE_FILE=1 produce un único HTML autocontenido para la demo presencial
// (Arquitectura §14: "demo congelada", sin depender de red ni de npm).
const singleFile = process.env.SINGLE_FILE === '1';

export default defineConfig({
  plugins: [react(), ...(singleFile ? [viteSingleFile()] : [])],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  server: {
    port: 5173,
    proxy: {
      // Evita CORS en desarrollo contra FastAPI.
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
});
