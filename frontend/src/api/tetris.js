// Cliente WebSocket del servicio Tetris: usa el cliente genérico con la ruta /ws/tetris.
import { abrirJuego } from './websocket.js';

// Abre una partida de Tetris. `tecla` envía left | right | rotate | soft_drop | hard_drop.
export const conectarTetris = (callbacks) => abrirJuego('/ws/tetris', callbacks);
