# Cómo funciona el sistema por dentro

Este documento explica el recorrido completo de una jugada, desde el navegador hasta la lógica de cada juego, y compara las tecnologías de cada servicio. Los detalles de cada juego están en su propio documento (ver [el índice](#documentos-de-este-proyecto)).

## 1. Vista general

```
 Navegador                      Docker Compose (red "minijuegos-net")
┌──────────────┐        ┌───────────────┐        ┌───────────────────────────────┐
│ React (Vite) │  HTTP  │   Gateway     │  HTTP  │ sudoku-service      :8001     │
│ :5173        ├───────▶│ Node + Express├───────▶│   Python · FastAPI · Uvicorn  │
│              │  WS    │ :3000         │        ├───────────────────────────────┤
│ solo dibuja  ├───────▶│ reenvía por   ├───────▶│ buscaminas-service  :8002     │
│ y envía      │        │ prefijo       │        │   Java 21 · Spring Boot       │
│ jugadas      │        │               │   WS   ├───────────────────────────────┤
└──────────────┘        │               ├───────▶│ snake-service       :8003     │
                        │               │        │   Elixir · Bandit · Plug      │
                        │               │   WS   ├───────────────────────────────┤
                        │               ├───────▶│ tetris-service      :8004     │
                        └───────────────┘        │   C# · ASP.NET Core · Kestrel │
                                                 └───────────────────────────────┘
```

Tres ideas sostienen todo el proyecto:

1. **El navegador no sabe jugar.** React solo dibuja la matriz `board` que recibe y envía las acciones del jugador. Nunca valida una jugada ni calcula dónde cae una pieza.
2. **El servidor es la autoridad.** El estado real de cada partida vive en el servicio, en memoria. Así toda la lógica que se quiere estudiar está en el lenguaje del servicio.
3. **El gateway es la única puerta.** El navegador solo conoce `localhost:3000`. Cambiar el lenguaje o el puerto de un juego no obliga a tocar React.

## 2. Qué tecnología hace cada cosa

| Componente | Lenguaje | Framework / servidor | Protocolo | Estado de la partida |
| :---- | :---- | :---- | :---- | :---- |
| Sudoku | Python 3.12 | FastAPI sobre Uvicorn | REST | Diccionario en memoria |
| Buscaminas | Java 21 | Spring Boot 4 sobre Tomcat | REST | `ConcurrentHashMap` en memoria |
| Snake | Elixir 1.17 (BEAM) | Bandit + Plug + WebSockAdapter | WebSocket | Un proceso (`GenServer`) por partida |
| Tetris | C# 12 / .NET 8 | ASP.NET Core sobre Kestrel | WebSocket | Un bucle `async` por conexión |
| Gateway | JavaScript (Node 22) | Express 5 + http-proxy-middleware | HTTP y WS | No guarda estado |
| Frontend | JavaScript (React 19) | Vite 8 + React Router 7 | HTTP y WS | Solo lo que dibuja |

Ninguno usa motores de juego: las reglas están programadas a mano. Las librerías solo resuelven transporte, JSON y pruebas.

## 3. Recorrido de una petición REST (Sudoku y Buscaminas)

Los juegos por turnos solo cambian cuando el jugador actúa. Ejemplo: poner un 5 en el Sudoku.

```
1. React           fetch("http://localhost:3000/api/sudoku/games/ab12/move", POST, {action: {...}})
2. Gateway         recibe /api/sudoku/games/ab12/move
                   quita el prefijo  →  /games/ab12/move
                   reenvía a http://sudoku-service:8001/games/ab12/move
3. Servidor web    Uvicorn (Python) / Tomcat (Java) lee la petición HTTP
4. Framework       FastAPI / Spring Boot elige la función por método + ruta
5. Capa servidor   convierte el JSON en un objeto de la lógica (la "acción")
6. Lógica          aplica la acción al estado y devuelve el estado nuevo
7. Capa servidor   convierte el estado en JSON: {id, game, status, board, data, message}
8. Respuesta       vuelve por el mismo camino hasta React, que vuelve a dibujar
```

Si la jugada no es válida, el paso 6 lanza una excepción propia (`MovimientoInvalido`) y el framework la convierte en `422` con el cuerpo `{"error": "INVALID_MOVE", "message": "..."}`.

## 4. Recorrido de una conexión WebSocket (Snake y Tetris)

Aquí el juego avanza solo, así que no basta con preguntar y responder: el servidor tiene un reloj interno (el *tick*) y empuja el estado nuevo al cliente.

```
1. React           new WebSocket("ws://localhost:3000/ws/snake")
2. Gateway         recibe un "Upgrade: websocket" y lo reenvía a ws://snake-service:8003/ws
3. Servicio        acepta la conexión: una conexión = una partida
4. Cliente → Srv.  {"type":"start"}  → el servidor crea la partida y arranca el reloj
5. Servidor        cada tick: avanza el juego y envía {"type":"state", "board": ...}
6. Cliente → Srv.  {"type":"input","key":"left"} → se aplica en el siguiente tick
7. Servidor        al terminar: {"type":"game_over", ...} y detiene el reloj
8. Cierre          si el navegador cierra la conexión, el servicio libera la partida
```

Se usan **WebSockets nativos con mensajes JSON**, no las librerías propias de cada framework (Phoenix Channels, SignalR), porque exigirían un cliente especial y harían que React tuviera que saber en qué lenguaje está cada juego.

## 5. Separación entre lógica y servidor

Cada servicio tiene dos capas, y la comparación entre lenguajes se hace sobre la primera:

| Capa | Qué contiene | Sabe de HTTP/JSON |
| :---- | :---- | :---- |
| **Lógica** (`logic/`, `Logic/`) | Reglas, estado y algoritmos del juego. Funciones o clases que reciben un estado y una acción. | No |
| **Servidor** (`server/`, `Server/`) | Recibe peticiones, llama a la lógica y serializa el resultado. Es una capa delgada. | Sí |

| Juego | Carpeta de la lógica | Estilo de la lógica |
| :---- | :---- | :---- |
| Sudoku | `services/sudoku-python/logic/` | Funciones y `dataclass` inmutable |
| Buscaminas | `services/buscaminas-java/src/main/java/.../logic/` | Clases, records y una interfaz sellada |
| Snake | `services/snake-elixir/lib/logic/` | Funciones puras sobre un struct, con *pattern matching* |
| Tetris | `services/tetris-csharp/src/Tetris/Logic/` | Records inmutables, `with`, LINQ y funciones estáticas |

## 6. Estado y concurrencia

| Juego | Dónde vive el estado | Cómo se evitan los conflictos |
| :---- | :---- | :---- |
| Sudoku | `dict` global del módulo | Las peticiones se atienden en un hilo del pool; el estado es inmutable y cada jugada guarda uno nuevo. No hay bloqueos (ver [limitaciones](sudoku-python.md#limitaciones-conocidas)). |
| Buscaminas | `ConcurrentHashMap` + objeto `Partida` | Cada `Partida` tiene métodos `synchronized`. |
| Snake | Proceso `GenServer` de la partida | Un proceso procesa un mensaje a la vez; nadie más toca su estado. |
| Tetris | Variables locales de un bucle `async` | Un único bucle procesa en orden teclas y ticks; solo él escribe en el socket. |

En los cuatro casos, si el servicio se reinicia las partidas se pierden. Es una decisión aceptada del proyecto.

## 7. Cómo se empaqueta cada servicio

Cada servicio tiene un `Dockerfile` que **compila dentro de Docker**, de modo que quien lo use no necesita tener Python, JDK, Elixir ni .NET instalados. Casi todos usan *builds* de varias etapas: una pesada con el compilador y una final ligera con solo lo necesario para ejecutar.

| Imagen | Etapa de compilación | Imagen final | Tamaño |
| :---- | :---- | :---- | :---- |
| `sudoku-service` | (ninguna: instala dependencias con `pip`) | `python:3.12-slim` | 215 MB |
| `buscaminas-service` | `maven:3.9-eclipse-temurin-21` | `eclipse-temurin:21-jre-alpine` | 325 MB |
| `snake-service` | `elixir:1.17-alpine` (genera un *release*) | `alpine:3.22` | 48,7 MB |
| `tetris-service` | `mcr.microsoft.com/dotnet/sdk:8.0` | `dotnet/aspnet:8.0-alpine` | 160 MB |
| `gateway` | (ninguna: `npm ci`) | `node:22-alpine` | 252 MB |
| `frontend` | (ninguna) | `node:22-alpine` con el servidor de desarrollo de Vite | 401 MB |

El de Snake es el más pequeño porque un *release* de Elixir lleva su propio runtime de Erlang y no necesita nada más que unas bibliotecas del sistema.

## 8. Cómo se prueba cada uno

| Juego | Herramienta | Qué prueba |
| :---- | :---- | :---- |
| Sudoku | pytest + `TestClient` | Lógica (solver, generador, reglas) y contrato REST |
| Buscaminas | JUnit + MockMvc | Lógica (tablero, reglas) y contrato REST sin levantar Tomcat |
| Snake | ExUnit + WebSockex | Lógica pura y el contrato WebSocket contra el servicio real |
| Tetris | xUnit + `WebApplicationFactory` | Lógica, mensajes JSON y WebSocket contra el servidor en memoria |
| Gateway | `node:test` + `ws` | Reescritura de rutas, CORS, errores y proxy de WebSocket |
| Frontend | Vitest + Testing Library | Cada pantalla y juego, con `fetch` y `WebSocket` simulados |

## Documentos de este proyecto

| Documento | De qué trata |
| :---- | :---- |
| [arquitectura-minijuegos.md](arquitectura-minijuegos.md) | Diseño inicial: objetivos, contrato, reglas y criterios |
| [sudoku-python.md](sudoku-python.md) | Sudoku con Python, FastAPI y Uvicorn |
| [buscaminas-java.md](buscaminas-java.md) | Buscaminas con Java 21 y Spring Boot |
| [snake-elixir.md](snake-elixir.md) | Snake con Elixir, OTP, Bandit y Plug |
| [tetris-csharp.md](tetris-csharp.md) | Tetris con C#, ASP.NET Core y WebSockets |
| [frontend-y-gateway.md](frontend-y-gateway.md) | React, Vite, el cliente de API y el gateway de Node |
