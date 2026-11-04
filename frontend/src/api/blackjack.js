// Cliente REST del servicio Blackjack (contrato de la sección 4.1 del diseño).
import { pedir } from './cliente.js';

const BASE = '/api/blackjack/games';

// Crea una sesión nueva (empieza en fase de apuesta con 1000 fichas).
export const crearPartida = () => pedir(BASE, { method: 'POST', cuerpo: {} });

// Envía una acción ({type: 'bet' | 'hit' | 'stand' | 'double' | 'split' | 'next_round', amount?}) y devuelve el estado nuevo.
export const jugar = (id, accion) => pedir(`${BASE}/${id}/move`, { method: 'POST', cuerpo: { action: accion } });

// Libera la sesión en el servidor; si falla no importa (se pierde al reiniciar el servicio).
export const borrarPartida = (id) => pedir(`${BASE}/${id}`, { method: 'DELETE' }).catch(() => {});
