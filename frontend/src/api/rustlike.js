// Cliente REST del servicio Rust Like (contrato de la sección 4.1 del diseño).
import { pedir } from './cliente.js';

const BASE = '/api/rustlike/games';

// Crea una partida nueva; con `seed` es reproducible, sin ella el servidor elige una.
export const crearPartida = (seed) => pedir(BASE, { method: 'POST', cuerpo: seed === undefined ? {} : { options: { seed } } });

// Envía una acción ({type: 'move', dir} | {type: 'wait'} | {type: 'descend'}) y devuelve el estado nuevo.
export const jugar = (id, accion) => pedir(`${BASE}/${id}/move`, { method: 'POST', cuerpo: { action: accion } });

// Libera la partida en el servidor; si falla no importa (se pierde al reiniciar el servicio).
export const borrarPartida = (id) => pedir(`${BASE}/${id}`, { method: 'DELETE' }).catch(() => {});
