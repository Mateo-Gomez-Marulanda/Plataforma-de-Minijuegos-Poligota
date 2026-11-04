# Plataforma de Minijuegos Políglota

Documento de diseño y arquitectura

| Campo | Valor |
| :---- | :---- |
| Versión | 1.0 |
| Fecha | Noviembre 2026 |
| Estado | Propuesta |
| Naturaleza | Proyecto experimental / de aprendizaje |

---

## 1\. Propósito del proyecto

Este proyecto es una aplicación web que permite jugar varios minijuegos clásicos desde una sola interfaz en React. Su particularidad es que **la lógica de cada juego está implementada en un lenguaje de programación distinto**, cada uno ejecutándose como un servicio independiente.

El proyecto persigue dos objetivos:

1. **Estudiar cómo se construye la lógica de un juego en un lenguaje puro**, sin motores de juego (Unity, Godot, Phaser, etc.). Toda la mecánica (estado, reglas, colisiones, temporizadores) se programa a mano.  
2. **Evaluar la capacidad de una IA para programar** en lenguajes y paradigmas diferentes a partir de una misma especificación común, observando si aprovecha las características propias de cada lenguaje.

No es un producto comercial ni un proyecto de portafolio. Por eso se prioriza la **claridad y la comparabilidad del código** por encima de la escalabilidad, la seguridad o el rendimiento.

### 1.1 Alcance

**Incluido:**

- Cinco minijuegos de un solo jugador: Sudoku, Buscaminas, Snake, Tetris y Asteroids.  
- Un frontend único en React.  
- Un gateway en Node.js que enruta las peticiones.  
- Orquestación de todos los servicios con Docker Compose.

**Excluido (deliberadamente):**

- Autenticación de usuarios.  
- Base de datos y rankings persistentes.  
- Modo multijugador.  
- Despliegue en producción.

---

## 2\. Arquitectura general

### 2.1 Diagrama

```
                         ┌──────────────────────────────┐
                         │        Navegador              │
                         │   Frontend React (Vite)       │
                         │   localhost:5173              │
                         └──────────────┬───────────────┘
                                        │
                     HTTP (REST)  +  WebSocket (ws://)
                                        │
                         ┌──────────────▼───────────────┐
                         │     API Gateway (Node.js)     │
                         │  Express + http-proxy-mw      │
                         │  localhost:3000               │
                         │  · Enruta por prefijo         │
                         │  · Proxy de WebSockets        │
                         │  · CORS centralizado          │
                         └──┬─────────┬─────────┬─────┬─────┬──┘
                            │         │         │     │     │
             ┌──────────────┘         │         │     │     └──────────────┐
             │ REST                   │ REST    │ WS  │ WS                 │ WS
             ▼                        ▼         ▼     ▼                    ▼
   ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
   │  sudoku-service  │ │buscaminas-service│ │  snake-service   │ │  tetris-service  │ │asteroids-service │
   │  Python          │ │  Java            │ │  Elixir          │ │  C#              │ │  Go              │
   │  FastAPI         │ │  Spring Boot     │ │  Phoenix         │ │  ASP.NET Core    │ │  net/http        │
   │  :8001           │ │  :8002           │ │  :8003           │ │  :8004           │ │  :8005           │
   └──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
        por turnos           por turnos          tiempo real          tiempo real          tiempo real

   ──────────────────── Red interna de Docker Compose: "minijuegos-net" ────────────────────
```

### 2.2 Componentes

| Componente | Tecnología | Puerto | Responsabilidad |
| :---- | :---- | :---- | :---- |
| `frontend` | React \+ Vite | 5173 | Renderizar los tableros, capturar teclado y ratón, mostrar el estado recibido. **No contiene lógica de juego.** |
| `gateway` | Node.js \+ Express | 3000 | Único punto de entrada. Reenvía cada ruta al servicio correspondiente, incluyendo conexiones WebSocket. |
| `sudoku-service` | Python \+ FastAPI | 8001 | Generar, validar y resolver sudokus. |
| `buscaminas-service` | Java \+ Spring Boot | 8002 | Generar tableros, destapar casillas, colocar banderas. |
| `snake-service` | Elixir \+ Phoenix | 8003 | Ejecutar el bucle de juego de Snake en el servidor. |
| `tetris-service` | C\# \+ ASP.NET Core | 8004 | Ejecutar el bucle de juego de Tetris en el servidor. |
| `asteroids-service` | Go \+ net/http | 8005 | Ejecutar el bucle de juego y la física de Asteroids en el servidor. |

### 2.3 Enrutamiento en el gateway

| Ruta pública | Destino interno | Protocolo |
| :---- | :---- | :---- |
| `/api/sudoku/*` | `http://sudoku-service:8001/*` | HTTP |
| `/api/buscaminas/*` | `http://buscaminas-service:8002/*` | HTTP |
| `/ws/snake` | `ws://snake-service:8003/ws` | WebSocket |
| `/ws/tetris` | `ws://tetris-service:8004/ws` | WebSocket |
| `/ws/asteroids` | `ws://asteroids-service:8005/ws` | WebSocket |

El frontend **solo conoce el gateway**, y llega a él sin direcciones fijas: el navegador llama a su propio origen (`/api/...` y `/ws/...`) y el servidor de desarrollo de Vite reenvía esas rutas al gateway (`localhost:3000`). Así la web funciona también para quien la abre desde otro equipo. Nunca llama directamente a un servicio de juego. Esto permite cambiar el lenguaje o el puerto de un juego sin tocar React.

### 2.4 Dos modelos de comunicación

Los juegos se dividen en dos categorías, y cada una usa un protocolo distinto:

**Juegos por turnos (Sudoku, Buscaminas) → REST**

El juego solo cambia cuando el usuario actúa. Cada acción es una petición HTTP independiente: el cliente envía la jugada y el servidor responde con el estado completo actualizado.

```
Cliente                         Servidor
   │── POST /games ──────────────▶│  crea partida
   │◀──────────── { id, estado } ─│
   │── POST /games/{id}/move ────▶│  aplica jugada
   │◀──────────── { estado } ─────│
```

**Juegos en tiempo real (Snake, Tetris, Asteroids) → WebSocket**

El juego avanza solo, aunque el usuario no haga nada (la serpiente se mueve, las piezas caen). El **servidor es la autoridad**: mantiene un reloj interno (*tick*) y en cada tick calcula el nuevo estado y lo envía al cliente. El cliente solo envía las teclas que presiona.

```
Cliente                         Servidor
   │══ conexión WebSocket ═══════▶│  crea partida e inicia el reloj
   │◀═════════ estado (tick 1) ═══│
   │◀═════════ estado (tick 2) ═══│
   │══ { input: "left" } ════════▶│  encola la acción
   │◀═════════ estado (tick 3) ═══│  la acción se aplica en este tick
   │◀═════════ { game_over } ═════│  el reloj se detiene
```

> **Decisión de diseño:** se usan **WebSockets nativos con mensajes JSON** en los tres servicios de tiempo real, y no las abstracciones propias de cada framework (Phoenix Channels, SignalR). Esas librerías exigen un cliente JavaScript específico y un protocolo propio, lo que rompería el contrato común y obligaría al frontend a saber en qué lenguaje está cada juego.

### 2.5 Docker Compose

Cada servicio tiene su propio `Dockerfile` y todos se levantan con un solo comando. Esto evita tener que instalar Python, JDK, Elixir/Erlang, .NET y Go en la máquina local.

```
services:
  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    depends_on: [gateway]

  gateway:
    build: ./gateway
    ports: ["3000:3000"]
    depends_on: [sudoku-service, buscaminas-service, snake-service, tetris-service, asteroids-service]

  sudoku-service:
    build: ./services/sudoku-python
    expose: ["8001"]

  buscaminas-service:
    build: ./services/buscaminas-java
    expose: ["8002"]

  snake-service:
    build: ./services/snake-elixir
    expose: ["8003"]

  tetris-service:
    build: ./services/tetris-csharp
    expose: ["8004"]

  asteroids-service:
    build: ./services/asteroids-go
    expose: ["8005"]

networks:
  default:
    name: minijuegos-net
```

Solo `frontend` y `gateway` publican puertos al exterior (`ports`). Los servicios de juego solo son accesibles dentro de la red de Docker (`expose`), y se resuelven por su nombre de servicio (por ejemplo, `http://sudoku-service:8001`).

**Comandos básicos:**

```sh
docker compose up --build        # construir y levantar todo
docker compose up snake-service  # levantar un solo servicio
docker compose logs -f gateway   # ver logs de un servicio
docker compose down              # detener todo
```

### 2.6 Estructura del repositorio

```
minijuegos/
├── docker-compose.yml
├── README.md
├── docs/
│   ├── arquitectura-minijuegos.md   ← este documento
│   └── contrato.md                  ← especificación detallada de mensajes
├── frontend/                        ← React + Vite
│   └── src/
│       ├── api/                     ← clientes REST y WebSocket
│       └── games/                   ← un componente por juego (solo renderizado)
├── gateway/                         ← Node.js + Express
└── services/
    ├── sudoku-python/
    │   ├── logic/                   ← lógica pura del juego
    │   ├── server/                  ← capa HTTP (FastAPI)
    │   └── tests/
    ├── buscaminas-java/
    ├── snake-elixir/
    ├── tetris-csharp/
    └── asteroids-go/
```

---

## 3\. Principios de diseño

Estos principios aplican a **todos** los servicios y son la base para que la comparación entre lenguajes sea justa.

### 3.1 Separación entre lógica y transporte

Cada servicio se divide en dos capas:

- **Lógica pura (`logic/`)**: funciones o clases que reciben un estado y una acción y devuelven un nuevo estado. No saben nada de HTTP, JSON, WebSockets ni temporizadores del sistema.  
- **Servidor (`server/`)**: capa delgada que recibe peticiones, llama a la lógica y serializa el resultado.

Esta separación es **el punto central del experimento**. La carpeta `logic/` es lo que se compara entre lenguajes; el resto es infraestructura.

La lógica de cada juego debe exponer, como mínimo, estas operaciones (con la convención de nombres propia de cada lenguaje):

| Operación | Descripción |
| :---- | :---- |
| `nuevo_juego(opciones)` | Crea el estado inicial. |
| `aplicar_accion(estado, accion)` | Devuelve el estado tras una acción del jugador. |
| `tick(estado)` | *(Solo tiempo real)* Avanza el juego un paso. |
| `terminado(estado)` | Indica si la partida acabó y por qué. |

### 3.2 Sin motores ni librerías de juego

Está prohibido usar motores o librerías que resuelvan la mecánica (Pygame, MonoGame, LibGDX, librerías de solvers de sudoku, etc.). Se permiten únicamente:

- La librería estándar del lenguaje.  
- El framework web indicado para cada servicio.  
- Librerías de testing.

### 3.3 Servidor como autoridad

El estado real de la partida vive en el servidor. El frontend nunca calcula si una jugada es válida ni dónde cae una pieza; solo dibuja lo que recibe. Esto garantiza que toda la lógica que se quiere estudiar esté efectivamente en el lenguaje del backend.

### 3.4 Estado en memoria

Las partidas activas se guardan en memoria del propio servicio (un diccionario, un mapa o un proceso, según el lenguaje). Si el servicio se reinicia, las partidas se pierden. Es aceptable para este proyecto.

### 3.5 Pruebas de la lógica

Cada servicio incluye pruebas unitarias sobre la capa `logic/`, ejecutables sin levantar el servidor. Como mínimo deben cubrir las reglas principales y las condiciones de victoria y derrota.

---

## 4\. Contrato común

Todos los servicios respetan el mismo formato de mensajes, de modo que el frontend trata a todos los juegos de forma homogénea.

### 4.1 Juegos por turnos (REST)

| Método | Ruta | Cuerpo | Respuesta |
| :---- | :---- | :---- | :---- |
| `POST` | `/games` | `{ "options": { ... } }` | `201` \+ estado |
| `GET` | `/games/{id}` | — | `200` \+ estado |
| `POST` | `/games/{id}/move` | `{ "action": { ... } }` | `200` \+ estado, o `422` si la jugada es inválida |
| `DELETE` | `/games/{id}` | — | `204` |

**Formato del estado:**

```json
{
  "id": "a1b2c3",
  "game": "sudoku",
  "status": "playing",
  "board": [[...]],
  "data": { },
  "message": null
}
```

- `status`: `"playing"`, `"won"` o `"lost"`.  
- `board`: matriz que el frontend dibuja directamente.  
- `data`: información adicional propia del juego (minas restantes, errores, etc.).  
- `message`: texto opcional para el usuario (por ejemplo, el motivo de un error).

**Formato de error:**

```json
{ "error": "INVALID_MOVE", "message": "La celda ya está revelada" }
```

### 4.2 Juegos en tiempo real (WebSocket)

**Cliente → servidor:**

```json
{ "type": "start", "options": { } }
{ "type": "input", "key": "left" }
{ "type": "input", "key": "thrust", "pressed": true }
{ "type": "pause" }
{ "type": "resume" }
```

**Servidor → cliente:**

```json
{ "type": "state", "tick": 42, "status": "playing", "board": [[...]], "data": { "score": 120 } }
{ "type": "state", "tick": 43, "status": "playing", "board": [[...]], "data": { }, "events": ["combo_up"] }
{ "type": "game_over", "data": { "score": 340, "reason": "collision" } }
{ "type": "error", "error": "UNKNOWN_KEY", "message": "Tecla no reconocida" }
```

Dos campos son opcionales y los servicios que no los usan (Snake, Tetris) los ignoran u omiten:

- `pressed` (en `input`): `true` al presionar la tecla y `false` al soltarla. Permite teclas mantenidas, como rotar o acelerar en Asteroids. Si se omite, el `input` es una pulsación única.
- `events` (en `state`): lista de lo ocurrido desde el último envío. El frontend la usa solo para efectos visuales y de sonido.
- Cuando el juego no tiene cuadrícula, `board` se envía como `null` y las entidades viajan en `data`.

Una conexión WebSocket corresponde a una partida. Al cerrarse la conexión, el servidor detiene el reloj y libera la partida.

---

## 5\. Juegos

### 5.1 Sudoku — Python

| Campo | Valor |
| :---- | :---- |
| Lenguaje | Python 3.12 |
| Framework web | FastAPI |
| Tipo | Por turnos |
| Comunicación | REST |
| Puerto interno | 8001 |

#### Cómo funciona el juego

Tablero de 9×9 dividido en nueve bloques de 3×3. Algunas celdas vienen rellenas. El jugador debe completar el resto de modo que cada fila, columna y bloque contenga los números del 1 al 9 sin repetirse.

#### Qué debe implementar la lógica

- **Generación**: crear un tablero resuelto válido, luego quitar números hasta dejar un puzzle con **solución única**. La dificultad depende de cuántas celdas se retiran.  
- **Resolución**: algoritmo de *backtracking* que se usa tanto para generar como para comprobar que la solución es única.  
- **Validación**: verificar si un número colocado viola las reglas de fila, columna o bloque.  
- **Victoria**: el tablero está completo y no hay conflictos.

**Acciones:** `{ "type": "place", "row": 0, "col": 3, "value": 7 }`, `{ "type": "clear", "row": 0, "col": 3 }`

#### Por qué Python

Sudoku es esencialmente un **problema de búsqueda con restricciones**. No tiene tiempo real ni concurrencia; su complejidad está en el algoritmo. Python permite expresar *backtracking* de forma muy breve y legible, con operaciones sobre listas, conjuntos y comprensiones que se parecen mucho al pseudocódigo.

#### Ventajas

- Código muy corto y legible; el algoritmo se entiende casi como pseudocódigo.  
- Los conjuntos (`set`) simplifican la comprobación de números repetidos.  
- FastAPI genera automáticamente la documentación OpenAPI del servicio.  
- Ideal para observar si la IA escribe código idiomático ("pythónico").

#### Desventajas

- Python es lento para búsquedas intensivas. En 9×9 no importa, pero generar puzzles muy difíciles (con muchas comprobaciones de unicidad) puede tardar notablemente más que en otros lenguajes.  
- El tipado dinámico permite errores en la estructura del tablero que solo aparecen en ejecución (mitigable con *type hints* y `mypy`).

---

### 5.2 Buscaminas — Java

| Campo | Valor |
| :---- | :---- |
| Lenguaje | Java 21 |
| Framework web | Spring Boot |
| Tipo | Por turnos |
| Comunicación | REST |
| Puerto interno | 8002 |

#### Cómo funciona el juego

Tablero rectangular con minas ocultas. El jugador destapa casillas: si es una mina, pierde; si no, la casilla muestra cuántas minas hay en sus ocho vecinas. Si ese número es cero, se destapan automáticamente todas las casillas adyacentes en cadena. El jugador puede marcar con bandera las casillas sospechosas. Gana al destapar todas las casillas sin mina.

#### Qué debe implementar la lógica

- **Generación**: colocar minas al azar **después del primer clic**, garantizando que la primera casilla destapada (y sus vecinas) no tenga minas.  
- **Conteo**: calcular para cada casilla cuántas minas tiene alrededor.  
- **Destape en cadena**: algoritmo de *flood fill* (recorrido BFS o DFS) para abrir las regiones vacías.  
- **Banderas**: marcar y desmarcar casillas.  
- **Victoria y derrota**.

**Acciones:** `{ "type": "reveal", "row": 4, "col": 7 }`, `{ "type": "flag", "row": 4, "col": 7 }`

**Opciones de partida:** `{ "rows": 16, "cols": 16, "mines": 40 }`

> **Importante:** mientras la partida está en curso, la respuesta al cliente **nunca** incluye la posición de las minas no destapadas. El `board` enviado solo contiene lo que el jugador puede ver (casilla oculta, bandera o número). Solo cuando la partida termina en derrota se muestran todas las minas.


**Códigos del `board`** (matriz de enteros, una por casilla):

| Valor | Significado |
| :---- | :---- |
| `-1` | Casilla oculta |
| `-2` | Casilla con bandera |
| `0` a `8` | Casilla destapada con ese número de minas vecinas |
| `9` | Mina *(solo al perder)* |
| `10` | Mina destapada, la que provocó la derrota *(solo al perder)* |
| `11` | Bandera sobre una casilla sin mina *(solo al perder)* |

`data` incluye `rows`, `cols`, `mines`, `flags` y `mines_remaining` (minas menos banderas; puede ser negativo). Al ganar, las minas restantes aparecen como banderas.

#### Por qué Java

Buscaminas tiene un modelo de datos claro (tablero, casilla, estado de casilla) que encaja naturalmente con la **programación orientada a objetos**. Java obliga a definir tipos explícitos, lo que hace visible el diseño del modelo. Además, Java 21 incorpora *records*, *enums* con comportamiento y *pattern matching* en `switch`, que modernizan bastante el estilo clásico del lenguaje.

#### Ventajas

- Modelo orientado a objetos muy claro: `Board`, `Cell`, `CellState`.  
- El tipado estático detecta errores en tiempo de compilación.  
- Las estructuras estándar (`ArrayDeque`, `HashSet`) bastan para implementar el *flood fill*.  
- Permite observar si la IA usa Java moderno (records, sealed interfaces) o un estilo antiguo y verboso.

#### Desventajas

- Es el lenguaje más verboso del proyecto: más líneas para la misma lógica.  
- Spring Boot es pesado para un servicio tan pequeño: arranque lento y una imagen Docker grande. (Javalin o Spark serían alternativas más ligeras.)  
- Mayor consumo de memoria que el resto de servicios.

---

### 5.3 Snake — Elixir

| Campo | Valor |
| :---- | :---- |
| Lenguaje | Elixir 1.17 (sobre la máquina virtual de Erlang, BEAM) |
| Framework web | Phoenix (WebSocket nativo mediante `WebSock`) |
| Tipo | Tiempo real |
| Comunicación | WebSocket |
| Puerto interno | 8003 |
| Velocidad inicial | 1 tick cada 150 ms |

#### Cómo funciona el juego

Una serpiente avanza continuamente por una cuadrícula. El jugador cambia su dirección con las flechas. Al comer una fruta, la serpiente crece y aparece una nueva fruta en una posición libre. La partida termina si la serpiente choca contra un borde o contra sí misma.

#### Qué debe implementar la lógica

- **Movimiento**: en cada tick, añadir una nueva cabeza en la dirección actual y quitar la cola (salvo si acaba de comer).  
- **Cambio de dirección**: ignorar el giro de 180° (no se puede ir directamente hacia atrás). Si llegan varias teclas en el mismo tick, solo se aplica la primera válida.  
- **Colisiones**: con los bordes y con el propio cuerpo.  
- **Comida**: aparición aleatoria en celdas libres y crecimiento.  
- **Puntaje**, y opcionalmente aumento de velocidad.

**Teclas:** `up`, `down`, `left`, `right`

#### Por qué Elixir

Snake es un juego en tiempo real: algo tiene que "mover" la partida a intervalos fijos aunque el jugador no haga nada. En Elixir, **cada partida puede ser un proceso ligero independiente** (un `GenServer`) que se envía a sí mismo un mensaje cada 150 ms para avanzar un tick. Es el modelo del lenguaje en su forma más pura: procesos aislados que se comunican por mensajes. Si un proceso falla, solo se pierde esa partida, y su supervisor lo gestiona sin afectar al resto.

#### Ventajas

- El modelo de procesos y mensajes encaja exactamente con un bucle de juego por partida.  
- Miles de partidas simultáneas sin esfuerzo, cada una aislada.  
- La inmutabilidad hace que cada tick sea una función pura: estado viejo → estado nuevo, fácil de probar.  
- El *pattern matching* expresa las colisiones y los cambios de dirección de forma muy declarativa.  
- Es el lenguaje con paradigma más distinto del proyecto (funcional), lo que hace la comparación más interesante.

#### Desventajas

- Curva de aprendizaje alta para quien viene de lenguajes imperativos.  
- Ecosistema más pequeño y menos ejemplos disponibles, lo que también puede afectar a la calidad del código que genere la IA.  
- Las estructuras inmutables requieren elegir bien la representación (por ejemplo, una cola o lista para el cuerpo, más un `MapSet` para detectar colisiones rápidamente).  
- La imagen Docker requiere Erlang y Elixir, y la compilación inicial es lenta.

---

### 5.4 Tetris — C\#

| Campo | Valor |
| :---- | :---- |
| Lenguaje | C\# 12 (.NET 8\) |
| Framework web | ASP.NET Core (WebSockets nativos) |
| Tipo | Tiempo real |
| Comunicación | WebSocket |
| Puerto interno | 8004 |
| Tablero | 10 columnas × 20 filas |

#### Cómo funciona el juego

Piezas de cuatro bloques (*tetrominós*: I, O, T, S, Z, J, L) caen desde la parte superior del tablero. El jugador puede moverlas a los lados, rotarlas y acelerar su caída. Cuando una pieza toca fondo, se fija. Las filas completas se eliminan y suman puntos. La partida termina cuando una nueva pieza no cabe al aparecer.

#### Qué debe implementar la lógica

- **Piezas y rotación**: definir las siete piezas y sus rotaciones. Se recomienda el sistema estándar SRS (*Super Rotation System*), incluyendo los *wall kicks* (desplazamientos que permiten rotar junto a una pared).  
- **Generador de piezas**: sistema de "bolsa de 7" (se barajan las siete piezas y se reparten antes de volver a barajar), para evitar rachas largas sin una misma pieza.  
- **Gravedad**: en cada tick la pieza baja una fila.  
- **Colisiones**: con paredes, suelo y bloques fijados.  
- **Fijación y limpieza de líneas**.  
- **Puntaje y niveles**: la velocidad aumenta cada cierto número de líneas.  
- **Pieza siguiente** visible para el jugador.

**Teclas:** `left`, `right`, `rotate`, `soft_drop`, `hard_drop`

**Formato del `board`** (matriz de 20 filas por 10 columnas de enteros):

| Valor | Significado |
| :---- | :---- |
| `0` | Casilla vacía |
| `1` a `7` | Casilla ocupada por una pieza: I, O, T, S, Z, J, L (la pieza que cae y las ya fijadas) |
| `8` | Sombra de aterrizaje: dónde caería la pieza actual |

`state.data` incluye `score`, `level`, `lines`, `next` (letra de la pieza siguiente), `paused` e `interval_ms` (milisegundos entre ticks de gravedad). Además del tick, el servidor envía un `state` inmediatamente después de cada tecla. `game_over.data` incluye `score`, `level`, `lines`, `reason` (`top_out`) y `tick`. Si el cliente envía `options.seed` en `start`, las piezas salen en un orden reproducible (se usa en las pruebas).

**Puntaje:** 100, 300, 500 y 800 por 1, 2, 3 y 4 líneas a la vez (multiplicado por el nivel), 1 punto por fila en caída suave y 2 por fila en caída rápida. El nivel sube cada 10 líneas y la gravedad parte de 1 s por fila.

#### Por qué C\#

Tetris es el juego con la lógica más compleja del proyecto: varias piezas con tablas de rotación, reglas de colisión, niveles y puntuación. Esa complejidad se gestiona mejor con un **sistema de tipos fuerte y expresivo**. C\# combina orientación a objetos con elementos funcionales (records inmutables, *pattern matching*, LINQ), y ASP.NET Core ofrece soporte nativo para WebSockets y temporizadores asíncronos.

#### Ventajas

- Los records y enums permiten modelar piezas, rotaciones y estados de forma segura y concisa.  
- `PeriodicTimer` junto con `async/await` resuelve el bucle de juego de forma limpia.  
- LINQ simplifica operaciones sobre el tablero, como detectar filas completas.  
- Muy buen rendimiento y herramientas de testing maduras (xUnit).

#### Desventajas

- La concurrencia es más delicada que en Elixir: el bucle de ticks y la llegada de teclas ocurren en paralelo, así que hay que proteger el estado (con un `lock`, un `Channel<T>` o procesando todo en una única cola).  
- El sistema de rotación SRS es extenso; implementarlo completo aumenta mucho el tamaño del código.  
- La imagen Docker de .NET es relativamente grande.

---

### 5.5 Asteroids — Go

| Campo | Valor |
| :---- | :---- |
| Lenguaje | Go 1.23 |
| Framework web | Librería estándar `net/http` \+ `coder/websocket` |
| Tipo | Tiempo real |
| Comunicación | WebSocket |
| Puerto interno | 8005 |
| Simulación | 60 ticks por segundo |
| Envío de estado | 30 veces por segundo |
| Mundo | Plano continuo de 800 × 600 unidades, con bordes envolventes |

#### Cómo funciona el juego

El jugador controla una nave en el centro de un espacio lleno de asteroides. La nave rota, acelera y dispara. Cada asteroide destruido se parte en fragmentos más pequeños y rápidos. Destruir asteroides en rápida sucesión aumenta un multiplicador de puntos (combo). Al limpiar la pantalla comienza una oleada más difícil. La partida termina cuando la nave pierde todas sus vidas.

#### Qué debe implementar la lógica

- **Física de la nave**: rotación a velocidad angular fija, aceleración en la dirección a la que apunta, inercia y fricción que reduce la velocidad gradualmente, y una velocidad máxima.  
- **Mundo envolvente**: toda entidad que sale por un borde reaparece por el opuesto.  
- **Disparos**: las balas heredan la velocidad de la nave más su propia velocidad, tienen un tiempo de vida limitado (unos 1,2 segundos) y existe un máximo de balas simultáneas y un tiempo mínimo entre disparos.  
- **Asteroides**: tres tamaños (grande, mediano, pequeño). Al ser destruido, un asteroide grande o mediano se divide en dos del tamaño inferior, con direcciones aleatorias y mayor velocidad. Los pequeños desaparecen.  
- **Colisiones**: entre círculos, comparando la distancia entre centros con la suma de los radios. Se comprueban bala contra asteroide y nave contra asteroide, considerando el envolvimiento de bordes.  
- **Combo**: cada destrucción incrementa el multiplicador (hasta un máximo, por ejemplo x8) y reinicia un temporizador de 2 segundos. Si el temporizador llega a cero, el multiplicador vuelve a x1.  
- **Puntaje**: los asteroides pequeños valen más que los grandes (por ejemplo, 20, 50 y 100 puntos), multiplicados por el combo actual.  
- **Oleadas**: cada oleada genera más asteroides grandes, siempre lejos de la nave.  
- **Vidas e invulnerabilidad**: la nave tiene 3 vidas. Al reaparecer es invulnerable durante 2 segundos.  
- **Aleatoriedad reproducible**: el generador aleatorio usa una semilla almacenada en el estado, para que una partida pueda reproducirse exactamente en las pruebas.

**Teclas:** `rotate_left`, `rotate_right`, `thrust`, `fire`

#### Particularidades del contrato

Asteroids introduce dos diferencias respecto a los demás juegos en tiempo real:

**1\. Teclas mantenidas.** Rotar y acelerar son acciones continuas. El cliente informa cuándo se presiona y cuándo se suelta cada tecla, y el servidor mantiene el conjunto de teclas activas, aplicándolas en cada tick:

```json
{ "type": "input", "key": "thrust", "pressed": true }
{ "type": "input", "key": "thrust", "pressed": false }
```

**2\. Mundo continuo en lugar de cuadrícula.** No existe una matriz de celdas, así que `board` se envía como `null` y las entidades viajan en `data` con coordenadas decimales:

```json
{
  "type": "state",
  "tick": 1840,
  "status": "playing",
  "board": null,
  "data": {
    "ship": { "x": 400.0, "y": 300.0, "angle": 1.57, "thrusting": true, "invulnerable": false },
    "asteroids": [ { "id": 12, "x": 120.5, "y": 88.2, "size": "large" } ],
    "bullets": [ { "x": 410.3, "y": 280.1 } ],
    "score": 4250,
    "combo": 3,
    "lives": 2,
    "wave": 4
  },
  "events": [ "asteroid_destroyed", "combo_up" ]
}
```

El campo `events` lista lo que ocurrió desde el último envío. El frontend lo usa exclusivamente para efectos visuales y de sonido (explosiones, temblor de pantalla, animación del multiplicador). Eventos posibles: `asteroid_destroyed`, `combo_up`, `combo_lost`, `ship_destroyed`, `wave_cleared`, `game_over`.

#### Diseño del bucle de juego

Cada partida corre en su propia goroutine con un único bucle que es la autoridad del estado:

```
goroutine de partida:
  ticker a 60 Hz
  select:
    ← channel de entrada  → actualiza el conjunto de teclas activas
    ← ticker              → aplica teclas, avanza física, resuelve colisiones,
                             cada 2 ticks envía el estado al cliente
    ← contexto cancelado  → la conexión se cerró, termina la goroutine
```

Toda modificación del estado ocurre dentro de esta goroutine. La goroutine que lee el WebSocket solo envía las teclas por el channel y nunca toca el estado directamente, lo que elimina las condiciones de carrera sin necesidad de `mutex`.

La simulación avanza 60 veces por segundo para que la física sea precisa, pero el estado se envía solo 30 veces por segundo para reducir el tráfico.

#### Por qué Go

Asteroids necesita un bucle de alta frecuencia, muchas entidades en movimiento y entrada del jugador en paralelo. Go resuelve esto con su modelo de concurrencia nativo: una goroutine por partida, un `time.Ticker` para el reloj y un channel para las teclas, combinados en un `select`. Es un modelo distinto al de los otros dos juegos de tiempo real (procesos con mensajes en Elixir y async/await en C\#), lo que permite comparar tres formas de resolver el mismo problema.

#### Ventajas

- El patrón goroutine \+ ticker \+ channel \+ `select` expresa el bucle de juego de forma directa y sin condiciones de carrera.  
- Buen rendimiento para actualizar muchas entidades 60 veces por segundo.  
- Compila a un único binario estático: la imagen Docker más ligera del proyecto.  
- La librería estándar cubre casi todo: servidor HTTP, JSON, matemáticas y aleatoriedad.

#### Desventajas

- Go no tiene sobrecarga de operadores, así que la aritmética de vectores es verbosa (`pos = pos.Add(vel.Scale(dt))`).  
- No tiene enums reales ni *pattern matching*: el tamaño de los asteroides o los tipos de evento se modelan con constantes `iota` y `switch`.  
- Como el apuntado requiere precisión, la latencia de red se percibe más que en Snake. En ejecución local no es un problema.  
- El JSON con muchas entidades puede ser pesado; si hiciera falta, se pueden redondear las coordenadas a un decimal.

---

## 6\. Resumen comparativo

| Juego | Lenguaje | Paradigma dominante | Tipo | Protocolo | Reto técnico principal |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Sudoku | Python | Imperativo / dinámico | Turnos | REST | Backtracking y unicidad de solución |
| Buscaminas | Java | Orientado a objetos | Turnos | REST | Flood fill y generación segura |
| Snake | Elixir | Funcional / actores | Tiempo real | WebSocket | Bucle de juego con procesos |
| Tetris | C\# | Multiparadigma | Tiempo real | WebSocket | Rotaciones y concurrencia del estado |
| Asteroids | Go | Imperativo / concurrente (CSP) | Tiempo real | WebSocket | Física con inercia y bucle a 60 Hz |

La combinación cubre cinco estilos de programación distintos, lo cual es deseable para el objetivo de comparar cómo se expresa la lógica de un juego en cada uno.

---

## 7\. Frontend (React)

El frontend tiene una responsabilidad deliberadamente limitada:

- **Menú principal** con la lista de juegos.  
- **Un componente por juego** que dibuja el `board` recibido (con CSS Grid o `<canvas>`).  
- **Captura de entrada**: clics para los juegos por turnos, teclado para los de tiempo real.  
- **Dos clientes de comunicación reutilizables**: uno REST (`fetch`) y otro WebSocket, ambos apuntando al gateway.

El frontend **no valida jugadas ni calcula estados**. Si un componente necesita saber si algo es válido, debe preguntarlo al servicio. Esto garantiza que toda la lógica estudiada esté en el backend.

En los juegos de tiempo real, el frontend simplemente re-renderiza cada vez que llega un mensaje `state`. No hay interpolación ni predicción en el cliente.

---

## 8\. Guía para agentes de IA y colaboradores

Esta sección resume las reglas que debe seguir cualquier persona o agente de IA que trabaje en el proyecto.

### 8.1 Reglas obligatorias

1. **Respetar el contrato común** de la sección 4\. No añadir campos fuera de `data` ni cambiar nombres de rutas o mensajes.  
2. **Mantener la lógica pura en `logic/`**, sin dependencias del framework web.  
3. **No usar motores ni librerías de juego** (sección 3.2).  
4. **Escribir código idiomático** para cada lenguaje: aprovechar las características propias (pattern matching en Elixir, records en Java y C\#, comprensiones en Python) en lugar de traducir literalmente el mismo código de un lenguaje a otro.  
5. **Incluir pruebas unitarias** de la lógica.  
6. **No exponer información oculta** al cliente (por ejemplo, minas o la solución del sudoku).  
7. **Cada servicio debe funcionar de forma aislada** con `docker compose up <servicio>`.  
8. **Documentar con comentarios breves**: cada archivo empieza con un comentario que explica qué hace, y cada método o función interna lleva un comentario corto con su propósito. Se prioriza la claridad y la concisión, no la exhaustividad.

### 8.2 Orden de implementación recomendado

1. Estructura del repositorio y `docker-compose.yml`.  
2. Gateway en Node.js con enrutamiento HTTP y WebSocket.  
3. **Sudoku (Python)** como primer juego completo de punta a punta: lógica, pruebas, servidor y componente React. Sirve para validar el contrato REST.  
4. **Snake (Elixir)** como primer juego en tiempo real. Sirve para validar el contrato WebSocket.  
5. Buscaminas (Java).  
6. Tetris (C\#).

### 8.3 Cómo añadir un juego nuevo

1. Crear la carpeta `services/<juego>-<lenguaje>/` con las capas `logic/`, `server/` y `tests/`.  
2. Implementar el contrato REST o WebSocket según el tipo de juego.  
3. Añadir su `Dockerfile` y registrarlo en `docker-compose.yml`.  
4. Añadir la ruta correspondiente en el gateway.  
5. Crear el componente de renderizado en `frontend/src/games/`.  
6. Documentar el juego en la sección 5 de este documento con la misma estructura.

### 8.4 Criterios para evaluar el código generado por IA

Como uno de los objetivos es evaluar a la IA, conviene revisar cada servicio con estas preguntas:

- ¿La lógica funciona correctamente y pasa las pruebas?  
- ¿El código usa los recursos propios del lenguaje, o parece escrito "en otro lenguaje con distinta sintaxis"?  
- ¿Respeta el contrato sin desviaciones?  
- ¿La separación entre lógica y servidor se mantiene limpia?  
- ¿Cuántas correcciones fueron necesarias hasta que funcionó?  
- ¿Se gestionan bien los casos límite (giro de 180° en Snake, primer clic en Buscaminas, rotación junto a la pared en Tetris, colisiones cerca de los bordes envolventes en Asteroids)?

---

## 9\. Riesgos y limitaciones conocidas

| Riesgo | Impacto | Mitigación |
| :---- | :---- | :---- |
| Latencia en juegos de tiempo real | Movimiento poco fluido si el servidor está lejos | Ejecutar todo en local; es suficiente para el propósito del proyecto. |
| Proxy de WebSockets en el gateway | Conexiones que se cortan o no se establecen | Configurar `ws: true` en el proxy y manejar el evento `upgrade` del servidor HTTP. |
| Imágenes Docker pesadas (Java, .NET, Elixir) | Primer arranque lento | Usar *builds multi-stage* e imágenes base ligeras. |
| Pérdida de partidas al reiniciar un servicio | Bajo | Aceptado: no se requiere persistencia. |
| Condiciones de carrera en Tetris | Estado inconsistente | Procesar ticks y entradas en una sola cola secuencial. |

