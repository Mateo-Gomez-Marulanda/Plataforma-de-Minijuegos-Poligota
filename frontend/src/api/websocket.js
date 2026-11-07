// Cliente WebSocket genérico para los juegos en tiempo real (contrato de la sección 4.2 del diseño).
// Una conexión equivale a una partida. Solo habla con el gateway; cada juego aporta su ruta (/ws/snake, /ws/tetris...).
import { API_URL } from './cliente.js';
import { despertarServicio } from './despertar.js';

// Dirección del WebSocket: la del gateway si se configuró, o la de la propia página (http -> ws, https -> wss).
const urlWs = (ruta) => (API_URL || window.location.origin).replace(/^http/, 'ws') + ruta;

// Abre la conexión y traduce los mensajes del servidor a callbacks.
// Callbacks: onAbrir(), onEstado(msg), onFin(data), onError(msg), onCierre().
// Devuelve las acciones comunes: empezar, tecla (un mensaje `input`), pausar, reanudar y cerrar.
export function abrirJuego(ruta, { onAbrir, onEstado, onFin, onError, onCierre }) {
  // Dispara el despertar HTTP del microservicio por si estaba dormido en Render
  const servicio = ruta.match(/^\/ws\/([a-z]+)/)?.[1];
  if (servicio) despertarServicio(servicio);

  const ws = new WebSocket(urlWs(ruta));

  // Envía un mensaje JSON si la conexión está abierta.
  const enviar = (mensaje) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(mensaje));
  };

  ws.onopen = () => onAbrir?.();
  ws.onclose = () => onCierre?.();
  ws.onmessage = (evento) => {
    const msg = JSON.parse(evento.data);
    if (msg.type === 'state') onEstado?.(msg);
    else if (msg.type === 'game_over') onFin?.(msg.data);
    else if (msg.type === 'error') onError?.(msg.message);
  };

  return {
    empezar: (opciones) => enviar({ type: 'start', ...(opciones && { options: opciones }) }),
    // `pressed` (true al pulsar, false al soltar) solo se envía en los juegos con teclas mantenidas (Asteroids).
    tecla: (key, pressed) => enviar({ type: 'input', key, ...(pressed !== undefined && { pressed }) }),
    pausar: () => enviar({ type: 'pause' }),
    reanudar: () => enviar({ type: 'resume' }),
    cerrar: () => {
      ws.onclose = null; // un cierre voluntario no es un fallo
      ws.close();
    },
  };
}
