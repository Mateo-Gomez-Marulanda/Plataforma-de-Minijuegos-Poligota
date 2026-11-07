// Servicio de auto-despertador (pre-warming) para Render:
// En el plan gratuito los contenedores se suspenden tras 15 minutos sin uso.
// Enviar peticiones HTTP a sus rutas /health despierta los contenedores en segundo plano
// para que cuando el usuario empiece a jugar ya estén listos en memoria.
import { API_URL } from './cliente.js';

export const SERVICIOS = ['sudoku', 'buscaminas', 'snake', 'tetris', 'asteroids', 'blackjack'];

// Despierta un servicio específico enviando un GET a su endpoint de salud.
export function despertarServicio(nombre) {
  if (!nombre) return;
  fetch(`${API_URL}/api/${nombre}/health`).catch(() => {});
}

// Despierta el gateway y todos los microservicios en paralelo sin bloquear.
export function despertarTodos() {
  fetch(`${API_URL}/health`).catch(() => {});
  for (const s of SERVICIOS) {
    despertarServicio(s);
  }
}
