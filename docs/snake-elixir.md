# Snake: Elixir + OTP

Servicio WebSocket en `services/snake-elixir/`. Es el juego donde el lenguaje y su modelo de ejecución **definen** la arquitectura: cada partida es un proceso independiente de la máquina virtual de Erlang (BEAM) que se envía mensajes a sí mismo para avanzar.

## 1. Tecnologías

| Tecnología | Versión | Para qué se usa |
| :---- | :---- | :---- |
| **Elixir** | 1.17 (imagen); 1.20 en el entorno local | Lenguaje funcional que corre sobre la BEAM |
| **Erlang/OTP** | 27 (imagen) | La máquina virtual (BEAM) y las librerías OTP: procesos, `GenServer`, supervisores |
| **Bandit** | 1.14.1 | Servidor HTTP y WebSocket escrito en Elixir puro |
| **Thousand Island** | 1.6.0 | Servidor de sockets sobre el que está hecho Bandit: acepta conexiones y crea un proceso por cada una |
| **Plug** | 1.20.3 | Especificación y herramientas para aplicaciones web en Elixir. `Plug.Router` define las rutas |
| **WebSock** + **WebSockAdapter** | 0.5.3 / 0.7.0 | `WebSock` define cómo se comporta un manejador de WebSocket; `WebSockAdapter` convierte una petición HTTP en una conexión WebSocket |
| **Jason** | 1.4.5 | Codifica y decodifica JSON |
| **Mix** | — | Herramienta de compilación y gestión de dependencias; genera el *release* |
| **ExUnit** + **WebSockex** | — | Pruebas; WebSockex es un cliente WebSocket que solo se usa en test |

**No se usa Phoenix.** Phoenix es el framework web habitual de Elixir y, debajo, usa exactamente estas piezas (Bandit, Plug y WebSock). Para un único endpoint WebSocket con JSON no aportaba nada y añadía muchas dependencias.

## 2. Estructura de archivos

```
services/snake-elixir/
├── mix.exs                  proyecto, aplicación OTP y dependencias
├── mix.lock                 versiones exactas de las dependencias
├── lib/
│   ├── logic/
│   │   └── juego.ex         Snake.Logic.Juego: reglas puras (struct + funciones)
│   └── server/
│       ├── application.ex   Snake.Application: árbol de supervisión y arranque
│       ├── router.ex        Snake.Server.Router: rutas /ws y /health
│       ├── socket.ex        Snake.Server.Socket: manejador de la conexión WebSocket
│       ├── partida.ex       Snake.Server.Partida: GenServer con el reloj de una partida
│       └── mensajes.ex      Snake.Server.Mensajes: JSON ↔ términos de Elixir
├── test/                    juego_test.exs (lógica) y ws_test.exs (integración)
└── Dockerfile
```

## 3. La idea clave: procesos

Elixir corre sobre la BEAM, donde un **proceso** es una unidad de ejecución muy ligera (no es un proceso del sistema operativo): se pueden tener cientos de miles. Cada proceso tiene su propia memoria y **solo se comunica con los demás enviando mensajes**; nunca comparte estado. Eso elimina las condiciones de carrera.

Por cada jugador conectado hay **dos procesos**:

```
Navegador ──WebSocket──▶ Proceso del socket (Snake.Server.Socket)   ← lo crea Bandit
                              │  ▲
              input, pause,   │  │  {:snake_state, ...}
              resume (cast)   ▼  │  {:snake_game_over, ...}
                         Proceso de la partida (Snake.Server.Partida, un GenServer)
                              guarda el estado del juego y marca el reloj
```

- El **proceso del socket** lo crea Bandit para cada conexión. Recibe los mensajes del navegador y los traduce.
- El **proceso de la partida** (`GenServer`) guarda el estado y marca los ticks. Lo crea el proceso del socket cuando llega `start`.

### El árbol de supervisión

`Snake.Application` arranca, bajo un supervisor, dos hijos:

```
Snake.Supervisor (one_for_one)
├── DynamicSupervisor "PartidaSupervisor"   ← aquí viven los procesos de partida
└── Bandit (puerto 8003)                    ← recibe las conexiones
```

Las partidas se crean con `restart: :temporary`: si una **falla**, solo se pierde esa partida y el supervisor no la reinicia ni afecta a las demás.

## 4. Cómo funciona la lógica

`Snake.Logic.Juego` es un módulo sin procesos ni red. Su estado es un `struct` y cada operación recibe uno y devuelve otro:

| Función | Qué hace |
| :---- | :---- |
| `nuevo_juego(opciones)` | Serpiente de 3 casillas en el centro y una fruta. Ancho y alto entre 5 y 50 |
| `aplicar_accion(juego, dir)` | Registra un giro para el siguiente tick |
| `tick(juego)` | Avanza un paso: mueve, detecta colisiones y gestiona la comida |
| `terminado(juego)` | `nil`, o `{:lost, razon}` / `{:won, razon}` |
| `intervalo_ms(juego)` | 150 ms al empezar; baja 5 ms por fruta hasta un mínimo de 60 ms |
| `a_tablero(juego)` | Matriz para dibujar: 0 vacío, 1 cuerpo, 2 cabeza, 3 comida |

### Reglas importantes

- **Cuerpo como lista** con la cabeza primero. Mover es añadir una cabeza nueva delante y quitar la cola (`Enum.drop(cuerpo, -1)`), salvo si se come.
- **Giro de 180°:** se ignora. Y si llegan varias teclas en el mismo tick, **solo cuenta la primera válida**: el estado guarda un único `giro` pendiente.
- **Colisión con el cuerpo:** se comprueba contra un `MapSet` del cuerpo. Si la serpiente no come, la cola se libera en ese mismo tick, así que entrar en la casilla de la cola es válido.
- **Fruta:** aparece en una casilla libre elegida al azar. Si no queda ninguna, la serpiente llenó el tablero y se **gana**.
- **Aleatoriedad pura:** el estado del generador (`:rand.seed_s` y `:rand.uniform_s`) va **dentro** del struct. Así `tick/1` sigue siendo una función pura y las pruebas son reproducibles con una semilla.

### Pattern matching

Elixir expresa las reglas casi como si fueran una descripción:

```elixir
def aplicar_accion(%__MODULE__{estado: :playing, giro: nil, direccion: actual} = juego, dir)
    when dir in @direcciones do
  if dir == actual or dir == opuesta(actual), do: juego, else: %{juego | giro: dir}
end
```

Esta cláusula solo se aplica si la partida está en curso **y** no hay ya un giro pendiente; la segunda cláusula (la general) deja el estado como está.

## 5. Cómo funciona el servidor

### 5.1 De HTTP a WebSocket

1. Bandit recibe la petición. `Snake.Server.Router` (un `Plug.Router`) tiene la ruta `get "/ws"`.
2. Esa ruta llama a `WebSockAdapter.upgrade(conn, Snake.Server.Socket, [], timeout: 600_000)`, que convierte la conexión HTTP en un WebSocket y delega en el módulo `Socket`.
3. A partir de ahí, `Socket` (que implementa el comportamiento `WebSock`) recibe tres tipos de evento:

| Función | Cuándo se llama |
| :---- | :---- |
| `init/1` | Al abrirse la conexión. Estado inicial: sin partida |
| `handle_in/2` | Llega un mensaje del navegador. Se decodifica con `Mensajes` y se ejecuta |
| `handle_info/2` | Llega un mensaje de otro proceso (la partida): se reenvía al navegador |

### 5.2 La partida: un GenServer con reloj

`GenServer` es el patrón de OTP para un proceso que guarda estado y responde a mensajes. `Partida` lo usa así:

- `init/1` guarda el estado, **monitoriza** al proceso del socket (`Process.monitor/1`), envía el estado inicial y programa el primer tick.
- El reloj es `Process.send_after(self(), {:tick, token}, intervalo)`: la partida **se envía a sí misma** un mensaje en el futuro. Cada tick vuelve a programar el siguiente, con el intervalo del nivel actual.
- El `token` (`make_ref()`) identifica el tick vigente. Al pausar se descarta el token, de modo que un tick que ya estaba en camino se ignora. Al reanudar se crea uno nuevo.
- `handle_cast({:input, tecla})` aplica un giro; `:pausar` y `:reanudar` activan y desactivan el reloj.
- Al terminar, envía `{:snake_game_over, ...}` y devuelve `{:stop, :normal, estado}`: el proceso muere.
- Si el socket se desconecta, llega `{:DOWN, ...}` y la partida también se detiene. **Cerrar el navegador libera la partida automáticamente.**

El estado nunca se comparte: el socket no toca el struct del juego, solo recibe copias en los mensajes.

### 5.3 JSON

`Snake.Server.Mensajes` es el único módulo que conoce el formato. Decodifica con `Jason.decode/1` y usa *pattern matching* para interpretar cada mensaje (`start`, `input`, `pause`, `resume`) y devolver errores como `UNKNOWN_KEY`. Codifica `state`, `game_over` y `error`.

## 6. Empaquetado en Docker

```
Etapa build   elixir:1.17-alpine, MIX_ENV=prod
                mix deps.get + mix deps.compile
                mix release                         → genera un release autónomo
Etapa final   alpine:3.22 + libstdc++, ncurses-libs, openssl
                bin/snake start                     (puerto 8003)
```

Un **release** de Elixir incluye el runtime de Erlang y el código compilado, así que no hace falta instalar Elixir en la imagen final. Por eso es la más pequeña del proyecto (48,7 MB).

## 7. Pruebas

20 pruebas con **ExUnit**:

- `test/juego_test.exs` (con `async: true`, porque no hay estado compartido): movimiento, giros (incluido 180° y varias teclas), colisiones, comer, entrar en la casilla de la cola, victoria al llenar el tablero, velocidad, la matriz del tablero y el determinismo con semilla.
- `test/ws_test.exs`: levanta el servicio real y lo usa con un cliente **WebSockex**. Comprueba `start`, los ticks, la pausa, `game_over` y los errores del contrato.

```sh
cd services/snake-elixir
MIX_ENV=test mix test
```

Si Erlang no está completo en tu sistema (falta `ssl` o `public_key`), el README explica cómo ejecutarlo en Docker.

## 8. Por qué Elixir encaja aquí

- Un bucle de juego por partida es **un proceso**, sin hilos ni bloqueos que gestionar.
- Si una partida falla, el resto no se entera.
- Como todo es inmutable, cada tick es una función pura: estado viejo → estado nuevo, fácil de probar.
- Un servidor con miles de partidas simultáneas es natural en la BEAM.

Su coste: la curva de aprendizaje es alta para quien viene de lenguajes imperativos y el ecosistema es más pequeño.
