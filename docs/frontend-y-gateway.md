# Frontend (React) y gateway (Node.js)

Las dos piezas que conectan al jugador con los servicios. Ninguna contiene lógica de juego.

## 1. El gateway: `gateway/`

### Para qué sirve

Es la **puerta de entrada a los servicios**. Recibe las peticiones que le reenvía el servidor de Vite (ver [más abajo](#cómo-habla-con-el-backend)) y las manda al servicio correcto, tanto con HTTP como con WebSocket.

| Ruta pública | Destino interno | Protocolo |
| :---- | :---- | :---- |
| `/api/sudoku/*` | `http://sudoku-service:8001/*` | HTTP |
| `/api/buscaminas/*` | `http://buscaminas-service:8002/*` | HTTP |
| `/ws/snake` | `ws://snake-service:8003/ws` | WebSocket |
| `/ws/tetris` | `ws://tetris-service:8004/ws` | WebSocket |
| `/ws/asteroids` | `ws://asteroids-service:8005/ws` | WebSocket |

Los destinos se pueden cambiar con las variables de entorno `SUDOKU_URL`, `BUSCAMINAS_URL`, `SNAKE_URL`, `TETRIS_URL` y `ASTEROIDS_URL`. Por defecto usan los nombres de servicio de Docker Compose, que la red interna resuelve a la dirección de cada contenedor.

### Tecnologías

| Tecnología | Versión | Para qué se usa |
| :---- | :---- | :---- |
| **Node.js** | 22 | Entorno de ejecución |
| **Express** | 5.3 | Servidor HTTP y encadenamiento de *middleware* |
| **http-proxy-middleware** | 4.2 | Hace el reenvío (proxy). Debajo usa la librería `http-proxy` |
| **cors** | 2.8 | Permite llamadas desde otro origen. Ya no es imprescindible (el navegador llama a su propio origen), pero se conserva por si se accede al gateway directamente |
| **ws** (solo pruebas) | 8.22 | Cliente y servidor WebSocket para probar el proxy |
| **node:test** | (incluido en Node) | Ejecutor de pruebas |

### Archivos

```
gateway/
├── src/
│   ├── app.js       buildRoutes() y createGateway(): construye la app Express
│   └── server.js    crea el servidor HTTP, engancha los WebSockets y escucha
└── test/gateway.test.js
```

### Cómo funciona

`createGateway(rutas)` crea una app Express con CORS y `GET /health`, y registra **un proxy por cada ruta**:

```js
createProxyMiddleware({
  target: r.target,
  pathFilter: (path) => path === r.prefix || path.startsWith(r.prefix + '/') ...,
  pathRewrite: { [`^${r.prefix}`]: r.rewrite },   // quita /api/sudoku, o cambia /ws/snake por /ws
  ws: !!r.ws,
});
```

- **`pathFilter`** decide si una petición corresponde a esa ruta.
- **`pathRewrite`** adapta la ruta: `/api/sudoku/games` llega al servicio como `/games`, y `/ws/snake` llega como `/ws`.
- Si el servicio no responde, el gateway devuelve `502` con `{"error": "BAD_GATEWAY", ...}`.

**Los WebSockets son un caso aparte.** No pasan por las rutas de Express: el navegador envía una petición HTTP con `Upgrade: websocket` y Node la entrega por el evento `upgrade` del servidor, no por `app`. Por eso `attachUpgrade(server)` escucha ese evento, busca el proxy cuyo prefijo coincide y le pasa la conexión (`proxy.upgrade(...)`). Si el prefijo no existe, destruye el socket. Después de eso, el gateway solo copia mensajes en ambos sentidos.

## 2. El frontend: `frontend/`

### Para qué sirve

Dibuja la interfaz y envía las acciones del jugador. **No valida jugadas ni calcula nada**: si algo debe comprobarse, se lo pregunta al servicio.

### Tecnologías

| Tecnología | Versión | Para qué se usa |
| :---- | :---- | :---- |
| **React** | 19 | Construye la interfaz con componentes y *hooks* |
| **React Router** | 7 | Cambia de pantalla sin recargar la página ni abrir pestañas |
| **Vite** | 8 | Servidor de desarrollo con recarga instantánea (HMR) y empaquetador |
| **Vitest** + **Testing Library** + **jsdom** | 5 / 16 / 30 | Pruebas de componentes en un navegador simulado |
| **CSS** con variables | — | Estilos sin librerías; los colores y tipografías se definen una vez en `:root` |
| **Google Fonts** | — | Unbounded y Hanken Grotesk |

### Estructura

```
frontend/src/
├── main.jsx                 monta React con el enrutador
├── App.jsx                  tabla de rutas
├── config.js                enlace de GitHub, autores y la lista de juegos
├── api/
│   ├── cliente.js           fetch al gateway y tratamiento de errores
│   ├── websocket.js         cliente WebSocket genérico
│   ├── sudoku.js            llamadas REST de Sudoku
│   ├── buscaminas.js        llamadas REST de Buscaminas
│   ├── snake.js             WebSocket de Snake (/ws/snake)
│   ├── tetris.js            WebSocket de Tetris (/ws/tetris)
│   └── asteroids.js         WebSocket de Asteroids (/ws/asteroids)
├── games/                   un componente por juego (Sudoku, Buscaminas, Snake, Tetris, Asteroids)
├── pages/                   una pantalla por ruta (Inicio, Juegos, Créditos, un marco por juego)
├── components/              piezas reutilizables (Fichas, Pagina, Autor)
└── styles.css
```

### Las pantallas

| Ruta | Contenido |
| :---- | :---- |
| `/` | Bienvenida con los botones de minijuegos, GitHub y créditos |
| `/juegos` | Los cinco juegos |
| `/juegos/sudoku`, `/juegos/buscaminas`, `/juegos/snake`, `/juegos/tetris`, `/juegos/asteroids` | Cada juego |
| `/creditos` | Autores y tecnologías |

La ruta de GitHub es la única que abre otra pestaña; el resto son cambios de escenario dentro de la misma web.

### Cómo habla con el backend

**El navegador solo habla con su propio origen.** Las rutas son relativas (`/api/sudoku/...`, `/ws/snake`), sin ninguna dirección fija. El servidor de desarrollo de Vite las reenvía al gateway según `vite.config.js`:

```js
server: {
  allowedHosts: true,
  proxy: {
    '/api': { target: gateway, changeOrigin: true },
    '/ws':  { target: gateway, ws: true, changeOrigin: true },   // ws: true → también WebSockets
  },
}
```

`gateway` es `http://localhost:3000` en desarrollo local y `http://gateway:3000` en Docker Compose (variable de entorno `GATEWAY_URL`).

**Por qué así y no con `http://localhost:3000` directo en el navegador.** Las peticiones salen del **navegador**, no del servidor. Si el código llamara a `localhost:3000`, quien abriera la web desde otro ordenador (por ejemplo, con el reenvío de puertos de VS Code) estaría llamando a **su propio** `localhost`, donde no hay ningún gateway: la página cargaría, pero ningún juego conectaría. Con rutas relativas, la petición siempre va al mismo sitio del que vino la página, y el servidor de Vite (que sí está en tu máquina) la reenvía. Por eso basta con compartir un solo puerto, el 5173.

`allowedHosts: true` hace falta porque Vite rechaza por defecto los nombres de host que no conoce (como el de un túnel de VS Code), con un `403 Blocked request`.

**REST (Sudoku y Buscaminas).** `api/cliente.js` envuelve `fetch`: usa la dirección de `VITE_API_URL` si se define (por defecto vacía, es decir, el mismo origen), envía el cuerpo como JSON y convierte los fallos en un único tipo de error (`ErrorApi`) con el mensaje del contrato `{error, message}` o uno de "sin conexión".

**WebSocket (Snake, Tetris y Asteroids).** `api/websocket.js` abre `new WebSocket(...)` contra el mismo host que la página (`ws://` si es `http://`, `wss://` si es `https://`) y traduce los mensajes del servidor a funciones: `onEstado` para cada `state`, `onFin` para `game_over`, `onError` y `onCierre`. Devuelve acciones (`empezar`, `tecla`, `pausar`, `reanudar`, `cerrar`). `tecla(key, pressed)` acepta un segundo parámetro opcional que usa Asteroids para avisar al pulsar y al soltar una tecla.

### Cómo está hecho un componente de juego

Todos siguen el mismo patrón con *hooks* de React:

- **`useState`** guarda lo que viene del servidor (el último `state` o la partida) y los estados de la pantalla (cargando, jugando, error...).
- **`useEffect`** abre la partida o la conexión al entrar y la libera al salir (`DELETE` en REST, cerrar el socket en WebSocket).
- **`useRef`** guarda lo que no debe provocar un redibujado: el identificador de la partida, la conexión o contadores.
- **Respuestas tardías.** Un contador numera cada petición, y solo se aplica la respuesta más reciente. Así, si el jugador cambia de dificultad mientras se crea una partida, la respuesta vieja se descarta.
- **Teclado.** En los juegos en tiempo real se escucha `keydown` en `window` y se llama a `preventDefault()` para que las flechas y el espacio no desplacen la página.
- **El servidor manda.** El componente no cambia el tablero por su cuenta: espera la respuesta (REST) o el siguiente `state` (WebSocket) y dibuja lo que llegue.

### Pruebas

Los componentes se prueban con un `fetch` y un `WebSocket` **falsos** que registran lo que se envía y permiten simular lo que haría el servidor. Así se comprueba, por ejemplo, que pulsar la flecha izquierda envía `{type: "input", key: "left"}`, o que un `422` se muestra sin perder el tablero.

```sh
cd frontend
npm install
npm run dev     # http://localhost:5173
npm test
```
