# Blackjack: Kotlin + Ktor

Servicio REST en `services/blackjack-kotlin/`. Es el juego definido por **reglas y fases**: lo difícil no es el rendimiento sino impedir estados inválidos (pedir carta en el turno del crupier, doblar con tres cartas). Para las reglas de la mesa y el contrato, ver la [sección 5.6 del documento de arquitectura](arquitectura-minijuegos.md); aquí se explica cómo está hecho por dentro.

## 1. Tecnologías

| Tecnología | Versión | Para qué se usa |
| :---- | :---- | :---- |
| **Kotlin** | 2.4 | Lenguaje. Se usan `sealed interface`, `data class` con `copy()`, `when` exhaustivo y `Result` |
| **JDK** | 21 | Plataforma de ejecución (la misma que Buscaminas). Gradle la fija con un *toolchain* |
| **Ktor** | 3.6 | Framework web ligero: servidor Netty, enrutado y el plugin `StatusPages` para los errores |
| **kotlinx.serialization (JSON)** | 1.12 | Solo el modelo `JsonObject`, para leer y construir el JSON a mano. No se usa el plugin del compilador |
| **Gradle (Kotlin DSL)** | 9.8 | Compilación, pruebas y el jar ejecutable (`buildFatJar`) |
| **kotlin.test** + **JUnit 5** | (de Kotlin) | Pruebas. `ktor-server-test-host` levanta la app **en memoria** |
| **Logback** | 1.5 | Registro por consola |

No se usa Spring Boot ni ninguna librería de cartas o de juego: el mazo, el valor de las manos y las reglas están programados a mano. El barajado es el `shuffled(random)` de la librería estándar (Fisher-Yates).

## 2. Estructura de archivos

```
services/blackjack-kotlin/
├── settings.gradle.kts, build.gradle.kts   build de Gradle
├── src/main/kotlin/com/minijuegos/blackjack/
│   ├── Main.kt                  arranque: lee PORT (8006 por defecto)
│   ├── logic/                   lógica pura, sin Ktor ni JSON
│   │   ├── Cards.kt             Suit, Rank, Card y el valor de una mano
│   │   ├── Shoe.kt              el zapato de 6 mazos
│   │   └── Game.kt              fases, estado, acciones y reglas
│   └── server/
│       ├── Application.kt       rutas REST y manejo de errores
│       ├── Presenter.kt         GameState -> JSON del contrato
│       ├── Requests.kt          cuerpos JSON -> acciones de la lógica
│       └── GameStore.kt         sesiones en memoria
├── src/test/kotlin/...          GameTest (lógica), ApiTest (REST), GameStoreTest
└── Dockerfile
```

## 3. Cómo funciona la lógica

### 3.1 Estado inmutable y fases cerradas

El estado es un `data class GameState` que nunca se modifica: cada acción devuelve uno nuevo con `copy()`. La fase de la ronda es una `sealed interface`:

```kotlin
sealed interface Phase {
    data object Betting : Phase
    data class PlayerTurn(val activeHand: Int) : Phase
    data object DealerTurn : Phase
    data class RoundOver(val results: List<HandResult>) : Phase
}
```

Al ser cerrada, todo `when` sobre `Phase` (en `allowedActions` y en el presentador) tiene que cubrir los cuatro casos o el compilador falla. Las acciones (`Action`) también son una jerarquía cerrada, y `applyAction` es un `when` exhaustivo sobre ellas.

| Operación del diseño | En Kotlin |
| :---- | :---- |
| `nuevo_juego(opciones)` | `newGame(seed, chips)` |
| `aplicar_accion(estado, accion)` | `applyAction(state, action): Result<GameState>` |
| (validación para los botones) | `allowedActions(state)` |

### 3.2 Errores como valores

`applyAction` no lanza excepciones: una acción inválida devuelve `Result.failure(InvalidMove(...))`. El servidor la convierte en `422`. Así la lógica no depende de cómo se informa el error y las pruebas comparan resultados en vez de capturar excepciones.

### 3.3 Valor de la mano

`handValue` suma los Ases como 1 y, si hay alguno y sumar 10 no pasa de 21, uno cuenta 11: la mano es **suave**. Por eso A + A + 9 vale 21 (un As como 11 y otro como 1). El crupier se planta en cualquier 17, también en el suave, porque `playDealer` pide mientras el total sea menor que 17.

### 3.4 Flujo de una ronda

1. **Apuesta.** Se valida (10 a 500, y no más de las fichas), se descuenta de las fichas, se rebaraja si ya se repartió el 75 % del zapato y se reparte jugador, crupier, jugador, crupier.
2. **Naturales.** Si el crupier o el jugador tienen Blackjack natural, la ronda se liquida de inmediato (empate si ambos).
3. **Turno del jugador.** `PlayerTurn(activeHand)` avanza de mano en mano. Pedir, plantarse, doblar y dividir actúan sobre la mano activa; una mano que llega a 21 o se pasa se planta sola.
4. **Crupier y liquidación.** Cuando no queda ninguna mano sin terminar, el crupier juega y se liquida dentro de la misma respuesta. Si todas las manos se pasaron, el crupier no pide cartas.
5. **Mínimo de fichas.** Al liquidar, si el jugador queda con menos de `MIN_CHIPS` (50) se le suben a 50. Como 50 es mayor que la apuesta mínima, siempre puede apostar y la sesión no tiene derrota: `status` es siempre `playing`. Las fichas apostadas sí se descuentan durante la ronda, de modo que el saldo puede verse por debajo de 50 mientras se juega.

Detalles que conviene saber:

- **Pagos:** la apuesta se descuenta al apostar, así que ganar devuelve el doble, empatar devuelve la apuesta y un Blackjack natural devuelve la apuesta más 3:2 (la mitad de una apuesta impar se redondea hacia abajo).
- **Dividir:** solo con dos cartas del **mismo rango** (K y Q no valen), una vez por ronda y con fichas para la segunda apuesta. Cada mano nueva recibe su segunda carta enseguida. Los Ases divididos reciben una sola carta y quedan terminados, y una mano dividida nunca cuenta como Blackjack (`fromSplit`).
- **Doblar:** con las dos primeras cartas de cualquier mano (también tras dividir), una sola carta y la mano queda terminada.
- **21 automático:** una mano que llega a 21 se planta sola. El documento no lo exigía; evita que el jugador pida carta con 21.

### 3.5 Aleatoriedad reproducible

El estado guarda la `seed` y un contador `shuffles`. Cada zapato se baraja con `Random(seed xor (shuffles * constante))`, de modo que el primero es reproducible y cada rebarajado es distinto pero también reproducible. Las pruebas de la lógica no dependen de esto: amañan el zapato con `Shoe(listOf(...))` para fijar las cartas.

## 4. Cómo funciona el servidor

### 4.1 Rutas

Siguen el contrato REST de la sección 4.1 del diseño: `POST /games`, `GET /games/{id}`, `POST /games/{id}/move` y `DELETE /games/{id}`, más `GET /health`. El gateway reenvía `/api/blackjack/*` quitando el prefijo.

| Situación | Respuesta |
| :---- | :---- |
| Acción inválida, tipo de dato incorrecto u opciones erróneas | `422` `INVALID_MOVE` |
| El cuerpo no es JSON | `422` `INVALID_REQUEST` |
| Sesión o ruta inexistente | `404` `NOT_FOUND` |

`StatusPages` centraliza esta traducción: las rutas lanzan la excepción y el plugin la convierte al formato `{"error": ..., "message": ...}`.

### 4.2 Qué ve el cliente

`Presenter.kt` es el único sitio que decide el JSON. Mientras la fase es `PlayerTurn`, el crupier enseña su primera carta y la segunda sale como `{"hidden": true}`, con `value` en `null`: **la carta oculta no sale del servidor**. `allowedActions` le dice al frontend qué botones habilitar, así React no conoce las reglas de doblar o dividir. `data` incluye además `minBet` y `maxBet` para que el frontend no los repita.

### 4.3 Concurrencia

`GameStore` guarda las sesiones en un `ConcurrentHashMap`. `update` usa `computeIfPresent`, que es atómico por clave: dos jugadas simultáneas sobre la misma sesión se ejecutan una detrás de otra y no pueden pisarse (hay una prueba con 16 hilos que lo comprueba). Si la acción es inválida, la sesión queda como estaba.

## 5. Empaquetado en Docker

El `Dockerfile` usa dos etapas: `gradle:9.8-jdk21` compila el jar ejecutable (`buildFatJar`) y `eclipse-temurin:21-jre-alpine` solo lo ejecuta. Primero se copian los scripts de Gradle y se resuelven las dependencias, para que esa capa quede en caché. La imagen final pesa unos 342 MB y el servicio arranca en menos de un segundo (Spring Boot tarda varios).

## 6. Pruebas

```sh
cd services/blackjack-kotlin
gradle test               # 70 pruebas
gradle run                # servicio en http://localhost:8006
```

| Clase | Qué prueba |
| :---- | :---- |
| `GameTest` | Valor de manos (varios Ases, suave), zapato de 6 mazos y rebarajado al 75 %, apuestas, Blackjack natural frente a 21 con tres cartas, crupier con Blackjack, S17, doblar, dividir (incluidos Ases, y doblar tras dividir), el mínimo de 50 fichas y reproducibilidad |
| `ApiTest` | El contrato REST en memoria: formato del estado, carta oculta, errores `422` y `404` |
| `GameStoreTest` | Sesiones inexistentes, jugadas rechazadas y 16 hilos apostando a la vez |

## 7. Idiomas de Kotlin que aparecen en el código

| Idioma | Dónde |
| :---- | :---- |
| `sealed interface` + `when` exhaustivo | `Phase` y `Action`; el compilador avisa si falta un caso |
| `data class` con `copy()` | `GameState` y `Hand`: las transiciones no mutan nada |
| `data object` | `Betting`, `DealerTurn`, `Hit`... fases y acciones sin datos |
| Propiedades calculadas | `Hand.value`, `isBust`, `isBlackjack`, `Shoe.remaining` |
| Funciones de extensión | `GameState.draw()`, `withHand()` y `moveOn()` leen como parte del estado |
| `Result` en vez de excepciones | `applyAction` devuelve `Result<GameState>` |
| Tipos nulables | `JsonNull` y `null` en el presentador para la carta oculta y el resultado aún no definido |
| Colecciones funcionales | `sumOf`, `zip`, `mapIndexed`, `buildList`, `shuffled` |
