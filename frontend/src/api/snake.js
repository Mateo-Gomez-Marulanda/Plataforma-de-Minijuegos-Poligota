// Cliente WebSocket del servicio Snake: usa el cliente genérico con la ruta /ws/snake.
import { abrirJuego } from './websocket.js';

// Abre una partida de Snake. `girar` envía una dirección (up | down | left | right).
export function conectarSnake(callbacks) {
  const juego = abrirJuego('/ws/snake', callbacks);
  return { ...juego, girar: juego.tecla };
}
