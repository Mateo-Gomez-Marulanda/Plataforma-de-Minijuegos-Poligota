// Cliente WebSocket del servicio Snake (contrato de la sección 4.2 del diseño).
// Una conexión equivale a una partida. Solo habla con el gateway, en /ws/snake.
import { API_URL } from './cliente.js';

// Convierte la dirección HTTP del gateway en la del WebSocket (http -> ws, https -> wss).
const urlWs = () => API_URL.replace(/^http/, 'ws') + '/ws/snake';

// Abre la conexión y traduce los mensajes del servidor a callbacks.
// Callbacks: onAbrir(), onEstado(msg), onFin(data), onError(msg), onCierre().
// Devuelve las acciones que puede hacer el jugador.
export function conectarSnake({ onAbrir, onEstado, onFin, onError, onCierre }) {
  const ws = new WebSocket(urlWs());

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
    girar: (tecla) => enviar({ type: 'input', key: tecla }), // up | down | left | right
    pausar: () => enviar({ type: 'pause' }),
    reanudar: () => enviar({ type: 'resume' }),
    cerrar: () => {
      ws.onclose = null; // un cierre voluntario no es un fallo
      ws.close();
    },
  };
}
