# Frontend (React) y gateway (Node.js)

Las dos piezas que conectan al jugador con los servicios. Ninguna contiene lógica de juego.

## 1. El gateway: `gateway/`

### Para qué sirve

Es la **única puerta de entrada**. El navegador solo habla con `localhost:3000`; el gateway reenvía cada petición al servicio correcto, y lo hace tanto con HTTP como con WebSocket.

| Ruta pública | Destino interno | Protocolo |
| :---- | :---- | :---- |
| `/api/sudoku/*` | `http://sudoku-service:8001/*` | HTTP |
| `/api/buscaminas/*` | `http://buscaminas-service:8002/*` | HTTP |
| `/ws/snake` | `ws://snake-service:8003/ws` | WebSocket |
| `/ws/tetris` | `ws://tetris-service:8004/ws` | WebSocket |

Los destinos se pueden cambiar con las variables de entorno `SUDOKU_URL`, `BUSCAMINAS_URL`, `SNAKE_URL` y `TETRIS_URL`. Por defecto usan los nombres de servicio de Docker Compose, que la red interna resuelve a la dirección de cada contenedor.

### Tecnologías

| Tecnología | Versión | Para qué se usa |
| :---- | :---- | :---- |
| **Node.js** | 22 | Entorno de ejecución |
| **Express** | 5.3 | Servidor HTTP y encadenamiento de *middleware* |
| **http-proxy-middleware** | 4.2 | Hace el reenvío (proxy). Debajo usa la librería `http-proxy` |
| **cors** | 2.8 | Permite que el navegador, desde `localhost:5173`, llame a `localhost:3000` |
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
│   └── tetris.js            WebSocket de Tetris (/ws/tetris)
├── games/                   un componente por juego (Sudoku, Buscaminas, Snake, Tetris)
├── pages/                   una pantalla por ruta (Inicio, Juegos, Créditos, un marco por juego)
├── components/              piezas reutilizables (Fichas, Pagina, Autor)
└── styles.css
```

### Las pantallas

| Ruta | Contenido |
| :---- | :---- |
| `/` | Bienvenida con los botones de minijuegos, GitHub y créditos |
| `/juegos` | Los cuatro juegos |
| `/juegos/sudoku`, `/juegos/buscaminas`, `/juegos/snake`, `/juegos/tetris` | Cada juego |
| `/creditos` | Autores y tecnologías |

La ruta de GitHub es la única que abre otra pestaña; el resto son cambios de escenario dentro de la misma web.

### Cómo habla con el backend

**REST (Sudoku y Buscaminas).** `api/cliente.js` envuelve `fetch`: añade la dirección del gateway (`VITE_API_URL`, por defecto `http://localhost:3000`), envía el cuerpo como JSON y convierte los fallos en un único tipo de error (`ErrorApi`) con el mensaje del contrato `{error, message}` o uno de "sin conexión".

La dirección es `localhost:3000` y no un nombre de servicio de Docker porque **la petición sale del navegador**, que corre en tu máquina, no dentro de la red de Docker.

**WebSocket (Snake y Tetris).** `api/websocket.js` abre `new WebSocket(...)` contra el gateway y traduce los mensajes del servidor a funciones: `onEstado` para cada `state`, `onFin` para `game_over`, `onError` y `onCierre`. Devuelve acciones (`empezar`, `tecla`, `pausar`, `reanudar`, `cerrar`).

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
