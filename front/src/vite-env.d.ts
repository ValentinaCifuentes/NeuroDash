/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base de la API FastAPI. Vacío = fixture de UI. Ej: http://localhost:8000 */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
