// Cliente WebSocket del servicio Asteroids: usa el cliente genérico con la ruta /ws/asteroids.
import { abrirJuego } from './websocket.js';

// Abre una partida de Asteroids. `tecla(key, pressed)` informa de cada pulsación y cada vez que se suelta:
// rotate_left | rotate_right | thrust | fire.
export const conectarAsteroids = (callbacks) => abrirJuego('/ws/asteroids', callbacks);
