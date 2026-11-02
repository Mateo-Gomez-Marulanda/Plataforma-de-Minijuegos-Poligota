// Cliente REST del servicio Buscaminas (contrato de la sección 4.1 del diseño).
import { pedir } from './cliente.js';

const BASE = '/api/buscaminas/games';

// Crea una partida con el tamaño y las minas dados ({filas, columnas, minas}).
export const crearPartida = ({ filas, columnas, minas }) =>
  pedir(BASE, { method: 'POST', cuerpo: { options: { rows: filas, cols: columnas, mines: minas } } });

// Envía una jugada ({type: 'reveal' | 'flag', row, col}) y devuelve el estado nuevo.
export const jugar = (id, accion) => pedir(`${BASE}/${id}/move`, { method: 'POST', cuerpo: { action: accion } });

// Libera la partida en el servidor; si falla no importa (se pierde al reiniciar el servicio).
export const borrarPartida = (id) => pedir(`${BASE}/${id}`, { method: 'DELETE' }).catch(() => {});
