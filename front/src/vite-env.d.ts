/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base de la API FastAPI. Vacío = fixture de UI. Ej: http://localhost:8000 */
  readonly VITE_API_BASE?: string;
  /** Actor fijo de las escrituras (cabecera X-Actor-Id). Por defecto `tutor-demo`. */
  readonly VITE_ACTOR_ID?: string;
  /** `tutor` (por defecto) o `system`. El backend rechaza cualquier otro rol. */
  readonly VITE_ACTOR_ROLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
