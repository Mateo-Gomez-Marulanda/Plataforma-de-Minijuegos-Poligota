# Tetris: C# + ASP.NET Core

Servicio WebSocket en `services/tetris-csharp/`. Es el juego con la lógica más compleja (rotaciones SRS, bolsa de 7, niveles y puntaje) y el que más depende de **cómo se coordinan el reloj y las teclas** sin que se pisen entre sí.

## 1. Tecnologías

| Tecnología | Versión | Para qué se usa |
| :---- | :---- | :---- |
| **C#** | 12 | Lenguaje. Se usan *records*, `with`, *pattern matching*, expresiones de colección `[...]` y constructores primarios |
| **.NET** | 8 | Plataforma de ejecución y bibliotecas base |
| **ASP.NET Core** | 8 | Framework web. Se usa su modelo de ***minimal APIs*** (rutas declaradas en `Program.cs`) |
| **Kestrel** | (parte de ASP.NET Core) | El servidor HTTP y WebSocket. Es el que abre el puerto 8004 |
| **WebSockets nativos** | `System.Net.WebSockets` | Se activan con el *middleware* `UseWebSockets()`; sin SignalR |
| **System.Text.Json** | (parte de .NET) | Convierte entre objetos C# y JSON (con nombres en *snake_case*) |
| **System.Threading.Channels** | (parte de .NET) | La cola de mensajes que ordena teclas y ticks |
| **Inyección de dependencias** | (parte de ASP.NET Core) | Permite cambiar la velocidad de la gravedad en las pruebas |
| **xUnit** + **WebApplicationFactory** | 2.9 / 8.0 | Pruebas; el segundo levanta el servidor completo **en memoria** |

No se usa **SignalR** (la librería de tiempo real de .NET) porque exigiría un cliente JavaScript propio y un protocolo distinto al contrato común.

## 2. Estructura de archivos

```
services/tetris-csharp/
├── Tetris.sln                           solución (agrupa servicio y pruebas)
├── src/Tetris/
│   ├── Tetris.csproj                    net8.0, C# 12
│   ├── Program.cs                       arranque, rutas /ws y /health
│   ├── Logic/                           lógica pura, sin ASP.NET
│   │   ├── Tetromino.cs                 enum de las 7 piezas
│   │   ├── Shapes.cs                    formas y rotaciones
│   │   ├── Kicks.cs                     tablas de wall kicks (SRS)
│   │   ├── Board.cs                     tablero 10x20 inmutable
│   │   ├── Piece.cs                     la pieza que cae
│   │   ├── Rng.cs                       generador aleatorio puro
│   │   ├── SevenBag.cs                  bolsa de 7
│   │   ├── GameState.cs                 estado completo de la partida
│   │   └── Game.cs                      reglas (funciones estáticas)
│   └── Server/
│       ├── TetrisSocket.cs              conexión WebSocket y lectura del socket
│       ├── GameSession.cs               bucle que procesa teclas y ticks
│       ├── Messages.cs                  mensajes JSON ↔ tipos de C#
│       └── TickPolicy.cs                intervalo de gravedad (interfaz)
├── tests/Tetris.Tests/                  xUnit
└── Dockerfile
```

## 3. Cómo funciona la lógica

### 3.1 Estado inmutable y funciones puras

El estado de una partida es un `record` (`GameState`): tablero, pieza actual, cola de piezas, generador aleatorio, puntaje, líneas y estado. **Nunca se modifica**; cada regla devuelve uno nuevo con `with`:

```csharp
return Fits(state.Board, abajo) ? state with { Current = abajo } : Lock(state);
```

La API pública de `Game` coincide con la del diseño: `NewGame`, `Apply(estado, acción)`, `Tick(estado)` e `IsOver(estado)`.

### 3.2 Piezas y rotaciones

`Shapes.cs` define cada pieza **una sola vez**, en su orientación inicial dentro de una caja de 3×3 (4×4 para la I y la O). Las otras tres orientaciones se **calculan girando** la caja 90° con la fórmula `(fila, col) → (col, n−1−fila)`. La O no gira: es un cuadrado.

### 3.3 Wall kicks (SRS)

Girar junto a una pared o al suelo podría chocar. El **Super Rotation System** prueba hasta cinco desplazamientos, en orden, y usa el primero que cabe. `Kicks.cs` contiene las tablas oficiales (una para J, L, S, T y Z y otra para la I). Las tablas oficiales usan *y hacia arriba*, mientras que el tablero usa *filas hacia abajo*; `Kicks.Tabla` hace esa conversión (`Row = -y`). Si ninguno cabe, la pieza no gira.

Ejemplo comprobado en las pruebas: una I vertical pegada a la pared izquierda no cabe al girar a horizontal (ni sin desplazar ni un paso a la izquierda), pero sí con el tercer desplazamiento (+2 columnas).

### 3.4 Bolsa de 7

`SevenBag.Generate` baraja las siete piezas con Fisher-Yates y las reparte todas antes de volver a barajar, así nunca hay rachas largas sin una pieza. La cola mantiene siempre al menos 7 piezas por delante, lo que permite mostrar la **pieza siguiente**.

El generador aleatorio (`Rng`, algoritmo SplitMix64) es **puro**: su estado es un valor que va dentro de `GameState`, y pedir un número devuelve también el generador siguiente. Con la misma semilla las piezas salen en el mismo orden.

### 3.5 Reglas del juego

| Regla | Detalle |
| :---- | :---- |
| Aparición | La pieza aparece centrada arriba. Si no cabe, la partida termina (`top_out`) |
| Gravedad | En cada tick la pieza baja una fila; si no puede, se fija y aparece la siguiente |
| Caída suave | Baja una fila y da 1 punto. En el suelo no hace nada: se fijará en el siguiente tick |
| Caída rápida | Baja hasta el fondo (2 puntos por fila) y se fija al instante |
| Líneas | 100, 300, 500 y 800 puntos por 1, 2, 3 y 4 líneas, multiplicado por el nivel |
| Nivel | Sube cada 10 líneas; la gravedad baja de forma lineal: `1000 − 60·(nivel−1)` ms por fila, con 100 ms de mínimo (nivel 8: 580 ms, nivel 10: 460 ms, nivel 14: 220 ms, mínimo desde el nivel 16) |

### 3.6 La matriz que se dibuja

`Game.ToMatrix` devuelve 20 filas × 10 columnas: casillas fijadas, la pieza activa (1 a 7) y la **sombra de aterrizaje** (8), que muestra dónde caería la pieza.

## 4. Cómo funciona el servidor

### 4.1 Arranque (`Program.cs`)

```csharp
builder.Services.AddSingleton<ITickPolicy, LevelTickPolicy>();   // inyección de dependencias
app.UseWebSockets();                                              // middleware
app.MapGet("/health", ...);
app.Map("/ws", async (HttpContext http, ITickPolicy policy, ...) => { ... });
```

1. **Kestrel** recibe la petición. Pasa por el *pipeline de middleware*; `UseWebSockets()` reconoce las peticiones de actualización a WebSocket.
2. El delegado de `/ws` recibe por **inyección** el `HttpContext` y la política de ticks. Acepta la conexión con `AcceptWebSocketAsync()` y se la entrega a `TetrisSocket`.

### 4.2 El problema de la concurrencia

En una conexión ocurren dos cosas a la vez: **llegan teclas** del jugador y **vence el reloj** de la gravedad. Si cada una modificara el estado desde su propio hilo, habría condiciones de carrera. Además, un `WebSocket` **no admite dos envíos simultáneos**.

La solución es que **solo un bucle toque el estado y envíe mensajes**:

```
 Tarea de lectura (ReadLoopAsync)            Bucle de la sesión (GameSession.RunAsync)
 ────────────────────────────────            ─────────────────────────────────────────
 lee del socket                              espera el siguiente mensaje de la cola
 interpreta el JSON                          con un tiempo límite = lo que falta
 mete el mensaje en la cola  ──Channel──▶    para el siguiente tick de gravedad
                                             · llega un mensaje → lo procesa
                                             · vence el tiempo   → hace un tick
                                             envía el estado resultante
```

- La **cola** es un `Channel<ClientMessage>` de `System.Threading.Channels`.
- **El reloj no es un hilo ni un temporizador aparte**: es el tiempo de espera de la lectura de la cola. `inbox.ReadAsync(token)` se cancela con `CancelAfter(tiempo hasta el siguiente tick)`; si salta la cancelación (y no es un cierre real), toca un tick. Con esto no puede haber ticks "obsoletos" ni dos cosas modificando el estado a la vez.
- Al pausar, el tiempo de espera es infinito.
- Tras una **caída rápida** se reprograma el reloj, para que la pieza nueva tenga su intervalo completo.
- Cada tecla genera un `state` inmediato (no hay que esperar al siguiente tick), así el juego responde al instante.

### 4.3 Mensajes

`Messages.cs` es el único lugar que conoce el JSON. Los mensajes del cliente se interpretan con `JsonDocument` y se convierten en una jerarquía de *records* (`StartMessage`, `InputMessage`, `PauseMessage`...); `GameSession.HandleAsync` los distingue con un `switch` con *pattern matching*. Los mensajes del servidor se serializan con `System.Text.Json` y la política `SnakeCaseLower`, de modo que `IntervalMs` sale como `interval_ms`.

Cuando una pieza limpia líneas, el `state` incluye en `events` el aviso correspondiente (`lines_1`, `lines_2`, `lines_3` o `tetris`). La lógica lo guarda en `GameState.LastCleared`: `Apply` y `Tick` lo ponen a cero al empezar y `Lock` lo fija con las líneas limpiadas, de modo que solo vale en el paso que las provoca. `MessageWriter.EventsFor` lo traduce al nombre del evento, y la sesión reenvía el estado sin eventos al pausar o reanudar para no repetirlo.

Los mensajes inválidos nunca lanzan excepciones: se convierten en un `ProtocolError` y se responde con un `error` (`INVALID_JSON`, `UNKNOWN_TYPE`, `UNKNOWN_KEY` o `NOT_STARTED`).

### 4.4 Cierre

Cuando el cliente cierra el socket, la tarea de lectura termina y **cierra la cola**; el bucle de la sesión lo detecta (`ChannelClosedException`) y acaba. La partida desaparece con él.

## 5. Empaquetado en Docker

```
Etapa build   mcr.microsoft.com/dotnet/sdk:8.0
                copia solo el .csproj → dotnet restore      (paquetes en caché)
                copia el código       → dotnet publish -c Release
Etapa final   mcr.microsoft.com/dotnet/aspnet:8.0-alpine    (160 MB)
                dotnet Tetris.dll                           (puerto 8004)
```

La imagen final lleva solo el runtime de ASP.NET, no el SDK. Se activa `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` porque Alpine no trae las bibliotecas de globalización (ICU).

## 6. Pruebas

103 pruebas con **xUnit**:

- **Lógica** (`ShapesTests`, `BoardTests`, `GameTests`): las formas, las tablas de kicks y su conversión, el tablero, la bolsa de 7, el movimiento, los giros con kicks, la gravedad, las caídas, el puntaje por líneas y niveles, el fin de partida y la matriz dibujada.
- **Mensajes** (`MessageTests`): la lectura de cada tipo de mensaje y la forma del JSON.
- **Integración** (`WebSocketTests`): levantan el servidor real **en memoria** con `WebApplicationFactory<Program>` (por eso `Program.cs` termina con `public partial class Program;`) y juegan por WebSocket. Para no esperar un segundo por tick, sustituyen `ITickPolicy` por una versión de 20 ms mediante inyección de dependencias. Incluyen una ráfaga de 300 teclas con la gravedad acelerada, para comprobar que los ticks nunca retroceden.

```sh
cd services/tetris-csharp
dotnet test tests/Tetris.Tests
```

Con .NET 8 instalado se ejecutan directamente; si no, el README explica cómo hacerlo en Docker.

## 7. Idiomas de C# que aparecen en el código

- **Records inmutables** y expresiones `with` para cada cambio de estado.
- **LINQ** (`Select`, `Where`, `All`, `FirstOrDefault`) para recorrer piezas y filas.
- **Pattern matching** en `switch` para acciones y mensajes.
- **Expresiones de colección** (`[...]`) y `ImmutableArray`/`ImmutableList` para colecciones inmutables.
- **Constructores primarios** (`GameSession(send, policy)`) y `async/await` con `CancellationToken`.
