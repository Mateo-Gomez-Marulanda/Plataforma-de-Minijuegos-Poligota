// Cliente HTTP base: todas las llamadas al backend pasan por el gateway (nunca a un servicio directo).
// Traduce los fallos (sin conexión o error del contrato {error, message}) en un único tipo de error.

// Dirección del gateway; se puede cambiar con VITE_API_URL.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Error de la API con el código del contrato (por ejemplo INVALID_MOVE) y un mensaje legible.
export class ErrorApi extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// Hace una petición al gateway y devuelve el JSON (o null si la respuesta es 204).
export async function pedir(ruta, { cuerpo, ...opciones } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(API_URL + ruta, {
      ...opciones,
      ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo), headers: { 'Content-Type': 'application/json' } }),
    });
  } catch {
    throw new ErrorApi('SIN_CONEXION', 'No se pudo conectar con el servidor. Comprueba que el gateway y el servicio estén en marcha.');
  }
  if (respuesta.status === 204) return null;
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new ErrorApi(datos?.error ?? 'ERROR', datos?.message ?? `Error ${respuesta.status}`);
  return datos;
}
