/**
 * Identificadores únicos (claves de reintento, ids de eventos planificados).
 *
 * `crypto.randomUUID` solo existe en contextos seguros (https o localhost). La
 * app también se abre por `http://` con la IP de la red local (por ejemplo, desde
 * un teléfono), y ahí no está. `getRandomValues`
 * sí está en todos: con él se arma el mismo formato (UUID v4).
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
