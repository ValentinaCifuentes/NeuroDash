import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // `.env.pages` fija el base path del repositorio y deja VITE_API_BASE vacío
  // para que el build use el mock en el navegador.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.VITE_BASE || '/',
    plugins: [react()],
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
  };
});
