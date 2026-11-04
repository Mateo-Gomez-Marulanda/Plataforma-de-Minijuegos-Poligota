# Asteroids: Go + net/http

Servicio WebSocket en `services/asteroids-go/`. Es el juego con física continua (inercia, fricción, mundo envolvente) y el que usa **teclas mantenidas**. Para su diseño de cara al contrato, ver la [sección 5.5 del documento de arquitectura](arquitectura-minijuegos.md); aquí se explica cómo está hecho por dentro.

## 1. Tecnologías

| Tecnología | Versión | Para qué se usa |
| :---- | :---- | :---- |
| **Go** | 1.23 | Lenguaje. Se usan goroutines, channels, `select`, constantes con `iota` y `math/rand/v2` |
| **net/http** | (librería estándar) | Servidor HTTP: rutas `GET /ws` y `GET /health` con el enrutador de Go 1.22+ |
| **coder/websocket** | 1.8 | WebSocket (la única dependencia). Sin Gorilla ni Socket.IO: mensajes JSON nativos |
| **encoding/json** | (librería estándar) | Convierte entre estructuras de Go y JSON |
| **testing** | (librería estándar) | Pruebas, con `-race` para detectar condiciones de carrera |

## 2. Estructura de archivos

```
services/asteroids-go/
├── go.mod, go.sum             módulo `asteroids` y su única dependencia
├── main.go                    arranque: lee PORT (8005 por defecto) y sirve HTTP
├── logic/                     lógica pura, sin red ni JSON
│   ├── vec.go                 vectores, envolvimiento y distancia entre bordes
│   ├── game.go                estado, física, disparos, colisiones, combo, oleadas
│   └── game_test.go
├── server/
│   ├── handler.go             /health y /ws; una goroutine lee el socket
│   ├── session.go             el bucle select que es dueño del estado
│   ├── messages.go            mensajes JSON ↔ tipos de la lógica
│   └── server_test.go
└── Dockerfile
```

Las pruebas van junto al código (`*_test.go`) porque es la convención de Go: el compilador solo las ve con `go test`.

## 3. Cómo funciona la lógica

### 3.1 Estado mutable con métodos

A diferencia de Elixir y C#, aquí `State` se modifica en sitio: `Tick()` cambia la nave, las balas y los asteroides y devuelve los eventos ocurridos. Es lo idiomático en Go y es seguro porque **una sola goroutine** toca el estado (ver sección 4).

| Operación del diseño | En Go |
| :---- | :---- |
| `nuevo_juego(opciones)` | `NewGame(seed)` |
| `aplicar_accion(estado, accion)` | `SetKey(tecla, pulsada)` y `Tap(tecla)` |
| `tick(estado)` | `Tick()` |
| `terminado(estado)` | el campo `Over` |

### 3.2 Física

- **Unidades:** el mundo mide 800 × 600 y el tiempo avanza `Dt = 1/60` s por tick. La lógica no mira el reloj: cada `Tick()` es un paso fijo, así que una partida es **determinista**.
- **Ángulo:** 0 apunta hacia arriba y crece en sentido horario (`dirFromAngle` da el vector `(sin a, -cos a)`).
- **Nave:** gira a 4,5 rad/s; al acelerar suma `260 · Dt` en la dirección que apunta; cada tick conserva `0,55^Dt` de su velocidad (fricción) y se limita a 380 u/s.
- **Envolvimiento:** `wrapCoord` deja cada coordenada en `[0, tamaño)`. Las colisiones usan `wrappedDist`, que toma el camino más corto entre dos puntos pasando por los bordes. Por eso un asteroide que cruza el borde puede chocar con algo que está al otro lado.

### 3.3 Reglas

- **Disparo:** máximo 4 balas, 0,2 s entre disparos y 1,2 s de vida. La bala sale de la punta de la nave y suma su velocidad a la de la nave.
- **Asteroides:** grande (radio 40), mediano (22) y pequeño (12). Al ser alcanzado, un grande o mediano se parte en dos del tamaño inferior con dirección aleatoria; los pequeños desaparecen. Cuanto más pequeño, más rápido, y cada oleada suma un 10 % de velocidad.
- **Puntaje y combo:** 20, 50 y 100 puntos por grande, mediano y pequeño, multiplicados por el combo actual. Cada destrucción sube el combo (tope x8) y reinicia un temporizador de 2 s; si se agota, vuelve a x1. Perder una vida también reinicia el combo.
- **Oleadas:** la oleada *n* trae `3 + n` asteroides grandes (máximo 10), siempre a más de 190 unidades de la nave. Al destruir el último comienza la siguiente.
- **Vidas:** 3. Al perder una, la nave reaparece quieta en el centro y es invulnerable 2 s (el cliente la dibuja parpadeando). Sin vidas, la partida termina.
- **Aleatoriedad reproducible:** `State` guarda su propio generador `rand.PCG` sembrado con `options.seed`. Con la misma semilla y las mismas teclas, la partida es idéntica (hay una prueba que lo comprueba).

### 3.4 Teclas mantenidas

El estado guarda dos conjuntos de teclas: `held` (mantenidas hasta que llega `pressed: false`) y `tapped` (un `input` sin `pressed`, que cuenta solo en el siguiente tick). Cada tick consulta `held || tapped` y vacía `tapped`.

## 4. Cómo funciona el servidor

### 4.1 Una goroutine es dueña del estado

```
goroutine de lectura (handler.go)      goroutine de la sesión (session.go)
  conn.Read → Parse → inbox ─────────▶  for { select {
                                           case msg := <-inbox:  aplica teclas / start / pausa
                                           case <-ticker.C:      Tick(); cada 2 ticks envía el estado
                                           case <-ctx.Done():    termina } }
```

- El reloj es un `time.Ticker` a 60 Hz; la simulación avanza 60 pasos por segundo y el estado se envía cada `SendEvery = 2` ticks (30 por segundo).
- La goroutine de lectura **nunca toca el estado**: solo interpreta el mensaje y lo deja en el channel. Quien escribe en el socket es únicamente la sesión. Por eso no hay `mutex` y `go test -race` pasa.
- `Session.Run` recibe los channels de mensajes y de ticks como parámetros, así que las pruebas le dan un reloj falso y controlan el tiempo sin esperas.
- Si el servidor va con retraso, el ticker descarta ticks y la partida se ve más lenta; no los recupera. Es aceptable en local.

### 4.2 Mensajes

`messages.go` es el único archivo que conoce el JSON. Las respuestas de error usan los códigos `INVALID_JSON`, `UNKNOWN_TYPE`, `UNKNOWN_KEY` y `NOT_STARTED`.

- `board` siempre es `null`; las entidades viajan en `data` con las coordenadas redondeadas a un decimal para aligerar el JSON. Cada asteroide incluye su radio `r` para que el cliente no tenga que duplicar las medidas del juego.
- `events` acumula lo ocurrido entre dos envíos (como se simula a 60 Hz y se envía a 30 Hz, un evento nunca se pierde).
- Al terminar se envía un último `state` con `status: "lost"` y los eventos finales (para que se vea la última explosión), y a continuación `game_over` con `score`, `wave`, `reason: "no_lives"` y `tick`.
- `pause` y `resume` detienen y reanudan el reloj; el estado enviado lleva `data.paused`.

### 4.3 Origen y cierre

El servicio acepta cualquier cabecera `Origin`: solo es alcanzable a través del gateway, que no la modifica, y el navegador envía el origen de la web compartida. Al cerrarse la conexión, la goroutine de lectura cierra el channel, la sesión termina y la partida se libera.

## 5. Empaquetado en Docker

El `Dockerfile` compila en `golang:1.23-alpine` con `CGO_ENABLED=0` y copia el binario resultante a una imagen **`scratch`** (vacía). El ejecutable estático pesa unos 7 MB y la imagen 8 MB, así que es la imagen más ligera del proyecto. No hace falta tener Go instalado para jugar.

## 6. Pruebas

```sh
cd services/asteroids-go
go test -race ./...
go run .                  # servicio en http://localhost:8005
```

| Paquete | Qué prueba |
| :---- | :---- |
| `logic` | Rotación, empuje, inercia, velocidad máxima, envolvimiento, disparos y enfriamiento, división de asteroides, puntaje, combo, oleadas, invulnerabilidad, colisiones a través de los bordes y reproducibilidad con la misma semilla |
| `server` | Interpretación de mensajes, la sesión con un reloj falso (envío cada 2 ticks, pausa, teclas mantenidas, fin de partida) y un cliente WebSocket real contra el servidor |

## 7. Idiomas de Go que aparecen en el código

| Idioma | Dónde |
| :---- | :---- |
| `iota` en vez de enums | `Size`, `Key` y los tipos de `Event` (con métodos `String` y `Radius`) |
| Goroutine + channel + `select` | `session.go`: sustituye a los hilos con candados |
| Interfaz con método privado como "unión" | `Message` y sus variantes (`Start`, `Input`, `Pause`…) se distinguen con un `switch` de tipos |
| Punteros a valores opcionales | `*bool` y `*uint64` distinguen "no vino" de `false` y `0` en el JSON |
| Errores como valores | `Run` devuelve el error de un envío fallido y la conexión termina |
| Pruebas con tablas | `TestParse` recorre una lista de casos |
