// Pruebas del gateway contra un servicio falso: reescritura de rutas, CORS,
// errores (502/404) y proxy de WebSocket.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { buildRoutes, createGateway } from '../src/app.js';

// Arranca un servidor en un puerto libre y devuelve ese puerto.
const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

let upstream, gw, gwPort, wss;

// Levanta un servicio falso y un gateway apuntando a él.
before(async () => {
  // Servicio falso: devuelve la ruta que recibió; WebSocket que hace eco con la ruta.
  upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ method: req.method, url: req.url, body }));
    });
  });
  wss = new WebSocketServer({ server: upstream });
  wss.on('connection', (ws, req) => {
    ws.send(JSON.stringify({ path: req.url }));
    ws.on('message', (m) => ws.send(`eco:${m}`));
  });
  const up = await listen(upstream);
  const t = `http://127.0.0.1:${up}`;

  const { app, attachUpgrade } = createGateway([
    { prefix: '/api/sudoku', target: t, rewrite: '' },
    { prefix: '/ws/snake', target: t, rewrite: '/ws', ws: true },
    { prefix: '/api/caido', target: 'http://127.0.0.1:1', rewrite: '' },
  ]);
  gw = http.createServer(app);
  attachUpgrade(gw);
  gwPort = await listen(gw);
});

// Cierra servidores y conexiones abiertas.
after(() => {
  wss.close();
  upstream.close();
  gw.close();
  gw.closeAllConnections();
  upstream.closeAllConnections();
});

// Construye la URL del gateway de prueba.
const url = (p) => `http://127.0.0.1:${gwPort}${p}`;

// GET /health responde ok.
test('health', async () => {
  assert.deepEqual(await (await fetch(url('/health'))).json(), { status: 'ok' });
});

// GET /api/config devuelve la configuración de endpoints directos.
test('api/config responde con objeto ws', async () => {
  const data = await (await fetch(url('/api/config'))).json();
  assert.ok(data.ws);
});

// El prefijo /api/... se elimina y se conservan método y cuerpo.
test('REST: quita el prefijo y reenvía método y cuerpo', async () => {
  const r = await fetch(url('/api/sudoku/games/abc/move'), { method: 'POST', body: '{"x":1}' });
  assert.deepEqual(await r.json(), { method: 'POST', url: '/games/abc/move', body: '{"x":1}' });
});

// El prefijo solo, con query string, llega al servicio como "/".
test('REST: ruta raíz del prefijo con query', async () => {
  const j = await (await fetch(url('/api/sudoku?a=1'))).json();
  assert.equal(j.url, '/?a=1');
});

// Las respuestas incluyen la cabecera CORS.
test('CORS habilitado', async () => {
  const r = await fetch(url('/health'), { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

// Si el servicio no responde, el gateway devuelve 502 en JSON.
test('servicio caído -> 502 JSON', async () => {
  const r = await fetch(url('/api/caido/x'));
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, 'BAD_GATEWAY');
});

// Una ruta sin proxy registrado responde 404.
test('ruta desconocida -> 404', async () => {
  assert.equal((await fetch(url('/nada'))).status, 404);
});

// El WebSocket se reenvía a /ws del servicio y los mensajes van y vienen.
test('WebSocket: /ws/snake llega a /ws y es bidireccional', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${gwPort}/ws/snake`);
  const msgs = [];
  ws.on('message', (m) => msgs.push(m.toString()));
  await new Promise((r) => ws.once('open', r));
  ws.send('hola');
  await new Promise((r) => setTimeout(r, 150));
  ws.close();
  assert.deepEqual(msgs, ['{"path":"/ws"}', 'eco:hola']);
});

// Un upgrade a una ruta desconocida se cierra con error.
test('WebSocket en ruta no registrada se rechaza', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${gwPort}/ws/otro`);
  const err = await new Promise((r) => ws.once('error', r));
  assert.ok(err);
});

// La tabla de rutas incluye Asteroids como WebSocket hacia /ws del servicio, y su destino se puede sobrescribir.
test('buildRoutes: /ws/asteroids apunta a asteroids-service:8005', () => {
  const ruta = (r) => r.find((x) => x.prefix === '/ws/asteroids');
  assert.deepEqual(ruta(buildRoutes({})), { prefix: '/ws/asteroids', target: 'http://asteroids-service:8005', rewrite: '/ws', ws: true });
  assert.equal(ruta(buildRoutes({ ASTEROIDS_URL: 'http://localhost:9' })).target, 'http://localhost:9');
});

// Blackjack es REST: /api/blackjack/* llega al servicio sin el prefijo, y su destino se puede sobrescribir.
test('buildRoutes: /api/blackjack apunta a blackjack-service:8006', () => {
  const ruta = (r) => r.find((x) => x.prefix === '/api/blackjack');
  assert.deepEqual(ruta(buildRoutes({})), { prefix: '/api/blackjack', target: 'http://blackjack-service:8006', rewrite: '' });
  assert.equal(ruta(buildRoutes({ BLACKJACK_URL: 'http://localhost:9' })).target, 'http://localhost:9');
});

// Los juegos WebSocket también exponen /api/<juego> para comprobar su salud y despertarlos por HTTP.
test('buildRoutes: /api/snake apunta a snake-service:8003', () => {
  const ruta = (r) => r.find((x) => x.prefix === '/api/snake');
  assert.deepEqual(ruta(buildRoutes({})), { prefix: '/api/snake', target: 'http://snake-service:8003', rewrite: '' });
  assert.equal(ruta(buildRoutes({ SNAKE_URL: 'http://localhost:9' })).target, 'http://localhost:9');
});
