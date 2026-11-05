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
| `/api/blackjack/*` | `http://blackjack-service:8006/*` | HTTP |
| `/api/rustlike/*` | `http://rustlike-service:8007/*` | HTTP |

Los destinos se pueden cambiar con las variables de entorno `SUDOKU_URL`, `BUSCAMINAS_URL`, `SNAKE_URL`, `TETRIS_URL`, `ASTEROIDS_URL`, `BLACKJACK_URL` y `RUSTLIKE_URL`. Por defecto usan los nombres de servicio de Docker Compose, que la red interna resuelve a la dirección de cada contenedor.

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
│   ├── blackjack.js         llamadas REST de Blackjack
│   ├── rustlike.js          llamadas REST de Rust Like
│   ├── snake.js             WebSocket de Snake (/ws/snake)
│   ├── tetris.js            WebSocket de Tetris (/ws/tetris)
│   └── asteroids.js         WebSocket de Asteroids (/ws/asteroids)
├── games/                   un componente por juego (Sudoku, Buscaminas, Snake, Tetris, Asteroids, Blackjack, Rust Like)
├── pages/                   una pantalla por ruta (Inicio, Juegos, Créditos, un marco por juego)
├── components/              piezas reutilizables (Fichas, Pagina, Autor)
├── musica/                  catálogo de pistas, reproductor, estado global y botón de música
└── styles.css
```

### Música

Cada juego tiene su pista en `public/musica/` (`<id>.mp3`) y la estructura vive en `src/musica/`:

| Archivo | Qué hace |
| :---- | :---- |
| `pistas.js` | **El catálogo**: una entrada por juego con la ruta de su pista y, en `FUENTES`, el enlace de donde salió la canción (alimenta la sección «Soundtracks» de `/creditos`). Es lo único que hay que editar para añadir música. |
| `reproductor.js` | Envuelve un único elemento de audio en bucle infinito y a volumen moderado; `pausar()` conserva la posición y `detener()` suelta la pista. Si el navegador bloquea el sonido automático, reintenta en el siguiente clic o tecla. |
| `MusicaContext.jsx` | `MusicaProvider` guarda si la música está activada (se recuerda entre visitas en `localStorage`; por defecto está **desactivada**) y qué pista pide la pantalla actual. `usePista(idJuego)` es el hook que usa cada pantalla. |
| `BotonMusica.jsx` | Botón flotante «Música: activada / desactivada», visible en todas las pantallas. |

Cada pantalla de juego le dice a `Pagina` qué juego es con `musica="tetris"`; al entrar, esa es la pista actual y al salir se calla. La música solo suena si está activada **y** el juego tiene pista. Al desactivarla con el botón, la canción se **pausa** y al reactivarla continúa donde iba; al cambiar de juego empieza la del nuevo.

**Para añadir la música de un juego:** copia el archivo a `frontend/public/musica/` (por ejemplo `tetris.mp3`), escribe `tetris: '/musica/tetris.mp3'` en `PISTAS` y su enlace en `FUENTES` de `pistas.js`. Un juego nuevo necesita su entrada en `pistas.js` (una prueba lo comprueba) y `musica="<id>"` en su pantalla.

### Pausa y cronómetro compartidos

- **Pausa (`games/pausa.jsx`).** Snake, Tetris y Asteroids usan el mismo hook `useTeclasPausa` y el mismo botón `BotonPausa`: la partida se pausa y se reanuda **solo** con la tecla P, la tecla Esc o el botón visual. Ninguna otra tecla pausa (la barra espaciadora ya no pausa en Snake). El servidor sigue siendo quien detiene el reloj; el cliente solo envía `pause` y `resume`.
- **Cronómetro (`games/cronometro.jsx`).** Sudoku y Buscaminas muestran cuánto tiempo lleva el jugador en la partida. Cuenta desde que se crea la partida, se detiene con el tiempo final al ganar, **vuelve a cero al perder** (Buscaminas) y empieza de cero en cada partida nueva. Vive solo en el navegador: al cerrar o recargar la página se pierde.

### Las pantallas

| Ruta | Contenido |
| :---- | :---- |
| `/` | Bienvenida con los botones de minijuegos, GitHub y créditos |
| `/juegos` | Los siete juegos |
| `/juegos/sudoku`, `/juegos/buscaminas`, `/juegos/snake`, `/juegos/tetris`, `/juegos/asteroids`, `/juegos/blackjack`, `/juegos/rustlike` | Cada juego |
| `/creditos` | Autores, tecnologías y soundtracks (enlaces a las canciones) |

**Controles de Rust Like:** flechas o WASD mueven; Q, E, Z y C son las diagonales; espacio o `.` esperan; Enter o `>` bajan (también el botón «Bajar», visible solo sobre la escalera); G recoge un objeto del suelo (también el botón «Recoger», visible solo con `pick` permitido); 1, 2 y 3 usan el objeto de ese espacio (o el botón «Usar») y abren un selector de pieza (Piernas, Brazos, Sensores, Núcleo; Esc o «Cancelar» lo cierran y mientras está abierto no se mueve). Con la partida perdida aparece «Fin de la partida» y las teclas no envían nada. Mientras hay una petición en curso se ignoran las teclas. No tiene música todavía (`PISTAS.rustlike` es `null`).

La ruta de GitHub es la única que abre otra pestaña; el resto son cambios de escenario dentro de la misma web.

Todas las pantallas de juego llevan, junto a «Volver al inicio», el botón «Volver a minijuegos», que lleva a `/juegos`. Lo añade el marco `Pagina` cuando la pantalla le pasa `volverAJuegos`.

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

**REST (Sudoku, Buscaminas, Blackjack y Rust Like).** `api/cliente.js` envuelve `fetch`: usa la dirección de `VITE_API_URL` si se define (por defecto vacía, es decir, el mismo origen), envía el cuerpo como JSON y convierte los fallos en un único tipo de error (`ErrorApi`) con el mensaje del contrato `{error, message}` o uno de "sin conexión".

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
