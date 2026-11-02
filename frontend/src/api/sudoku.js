// Cliente REST del servicio Sudoku (contrato de la sección 4.1 del diseño).
import { pedir } from './cliente.js';

const BASE = '/api/sudoku/games';

// Crea una partida con la dificultad dada (easy | medium | hard).
export const crearPartida = (dificultad) => pedir(BASE, { method: 'POST', cuerpo: { options: { difficulty: dificultad } } });

// Envía una jugada ({type: 'place' | 'clear', row, col, value}) y devuelve el estado nuevo.
export const mover = (id, accion) => pedir(`${BASE}/${id}/move`, { method: 'POST', cuerpo: { action: accion } });

// Libera la partida en el servidor; si falla no importa (se pierde al reiniciar el servicio).
export const borrarPartida = (id) => pedir(`${BASE}/${id}`, { method: 'DELETE' }).catch(() => {});
