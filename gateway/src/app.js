// Define el gateway: un servidor Express que reenvía cada ruta pública al servicio
// de juego correspondiente (HTTP y WebSocket). No contiene lógica de juego.
import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';

// Construye la tabla de rutas públicas -> servicios internos (sección 2.3 del diseño).
// Los destinos se pueden sobrescribir con variables de entorno.
export function buildRoutes(env = process.env) {
  const t = {
    sudoku: env.SUDOKU_URL ?? 'http://sudoku-service:8001',
    buscaminas: env.BUSCAMINAS_URL ?? 'http://buscaminas-service:8002',
    snake: env.SNAKE_URL ?? 'http://snake-service:8003',
    tetris: env.TETRIS_URL ?? 'http://tetris-service:8004',
    asteroids: env.ASTEROIDS_URL ?? 'http://asteroids-service:8005',
  };
  return [
    { prefix: '/api/sudoku', target: t.sudoku, rewrite: '' },
    { prefix: '/api/buscaminas', target: t.buscaminas, rewrite: '' },
    { prefix: '/ws/snake', target: t.snake, rewrite: '/ws', ws: true },
    { prefix: '/ws/tetris', target: t.tetris, rewrite: '/ws', ws: true },
    { prefix: '/ws/asteroids', target: t.asteroids, rewrite: '/ws', ws: true },
  ];
}

// Crea la app Express con CORS, /health y un proxy por cada ruta.
// Devuelve también attachUpgrade, necesario para los WebSockets.
export function createGateway(routes = buildRoutes()) {
  const app = express();
  app.use(cors());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  const wsProxies = [];
  for (const r of routes) {
    const proxy = createProxyMiddleware({
      target: r.target,
      changeOrigin: true,
      ws: !!r.ws,
      pathFilter: (path) => path === r.prefix || path.startsWith(r.prefix + '/') || path.startsWith(r.prefix + '?'),
      pathRewrite: { [`^${r.prefix}`]: r.rewrite },
      on: {
        // Si el servicio no responde, devuelve un 502 en JSON (o cierra el socket).
        error: (_err, _req, res) => {
          if (typeof res?.writeHead === 'function' && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'BAD_GATEWAY', message: 'Servicio no disponible' }));
          } else {
            res?.destroy?.();
          }
        },
      },
    });
    app.use(proxy);
    if (r.ws) wsProxies.push({ prefix: r.prefix, proxy });
  }

  // Los WebSockets llegan por el evento 'upgrade' del servidor HTTP, no por Express:
  // aquí se enruta cada upgrade al proxy cuyo prefijo coincida.
  function attachUpgrade(server) {
    server.on('upgrade', (req, socket, head) => {
      const match = wsProxies.find(
        ({ prefix }) => req.url === prefix || req.url.startsWith(prefix + '/') || req.url.startsWith(prefix + '?'),
      );
      if (match) match.proxy.upgrade(req, socket, head);
      else socket.destroy();
    });
  }

  return { app, attachUpgrade };
}
