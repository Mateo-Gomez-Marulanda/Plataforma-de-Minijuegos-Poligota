# Buscaminas: Java 21 + Spring Boot

Servicio REST en `services/buscaminas-java/`. Genera el tablero tras el primer clic, destapa casillas en cadena, gestiona banderas y detecta victoria o derrota. Su rasgo distintivo es el **modelo orientado a objetos** con las novedades de Java moderno (records, interfaz sellada y *pattern matching*).

## 1. Tecnologías

| Tecnología | Versión | Para qué se usa |
| :---- | :---- | :---- |
| **Java** | 21 | Lenguaje. Se usan *records*, `sealed interface`, `switch` con *pattern matching* y enums |
| **Spring Boot** | 4.0.9 | Arranca y configura la aplicación sin XML: detecta las clases anotadas y levanta el servidor web |
| **Spring Framework** (Spring MVC) | 7.0.10 | El motor web que hay debajo de Boot: enrutado, inyección de dependencias y conversión de mensajes |
| **Tomcat embebido** | 11.0.27 | El servidor HTTP. Va **dentro** del `.jar`, así que no hace falta instalar un servidor aparte |
| **Jackson** | 3.1.7 | Convierte entre JSON y objetos Java |
| **Maven** | 3.9 | Compila, ejecuta las pruebas y empaqueta el `.jar` |
| **JUnit** + **MockMvc** + **JSONPath** | JUnit 6 | Pruebas: JUnit organiza los casos, MockMvc llama a los controladores sin red y JSONPath consulta el JSON de la respuesta |

## 2. Estructura de archivos

```
services/buscaminas-java/
├── pom.xml                                   dependencias y plugin de empaquetado
├── src/main/resources/application.properties server.port=8002
├── src/main/java/com/minijuegos/buscaminas/
│   ├── BuscaminasApplication.java            punto de arranque (@SpringBootApplication)
│   ├── logic/                                lógica pura, sin Spring
│   │   ├── Posicion.java                     record (fila, columna)
│   │   ├── Opciones.java                     record con validación (filas, columnas, minas)
│   │   ├── Accion.java                       interfaz sellada: Revelar | Bandera
│   │   ├── EstadoCelda.java / EstadoPartida.java   enums
│   │   ├── MovimientoInvalido.java           excepción de las reglas
│   │   ├── Celda.java                        una casilla: mina, vecinas, estado
│   │   ├── Tablero.java                      cuadrícula, minas, conteo y flood fill
│   │   └── Partida.java                      reglas y vista del jugador
│   └── server/                               capa HTTP
│       ├── PartidaController.java            rutas REST
│       ├── Peticiones.java                   JSON (mapas) → objetos de la lógica
│       ├── Respuesta.java                    objetos de la lógica → JSON del contrato
│       ├── RepositorioPartidas.java          partidas en memoria
│       ├── ManejadorErrores.java             excepciones → respuestas {error, message}
│       └── PartidaNoEncontrada.java          404
├── src/test/java/.../                        pruebas
└── Dockerfile
```

## 3. Cómo funciona la lógica

### 3.1 El modelo de objetos

| Clase | Responsabilidad |
| :---- | :---- |
| `Posicion` | *Record* inmutable `(fila, columna)` |
| `Opciones` | *Record* que **valida al construirse**: lados entre 3 y 50 y minas entre 1 y `filas × columnas − 9`. Una instancia siempre es válida |
| `Celda` | Si tiene mina, cuántas minas la rodean y su estado (`OCULTA`, `REVELADA` o `BANDERA`) |
| `Tablero` | La matriz de celdas: reparte minas, cuenta vecinas y abre regiones |
| `Partida` | Aplica las acciones, lleva el estado (`JUGANDO`, `GANADA`, `PERDIDA`) y produce la vista del jugador |

### 3.2 Acciones con interfaz sellada

```java
public sealed interface Accion {
    record Revelar(Posicion posicion) implements Accion {}
    record Bandera(Posicion posicion) implements Accion {}
}
```

`sealed` significa que **solo** existen esas dos acciones. `Partida.aplicar` las distingue con un `switch` sobre el tipo, y el compilador comprueba que no falte ninguna:

```java
switch (accion) {
    case Accion.Revelar r  -> revelar(r.posicion());
    case Accion.Bandera b  -> alternarBandera(b.posicion());
}
```

### 3.3 El primer clic nunca pierde

Las minas **no existen** al crear la partida. En el primer `Revelar`, `Tablero.colocarMinas`:

1. Calcula la zona segura: la casilla pulsada y sus vecinas.
2. Reúne el resto de casillas como candidatas y las baraja con `Collections.shuffle`.
3. Pone mina en las primeras *n* candidatas.
4. Calcula, para cada casilla, cuántas vecinas tienen mina.

Por eso el límite de minas es `filas × columnas − 9`: tiene que quedar sitio para la zona segura. Con el máximo permitido el primer clic abre todo y gana al instante, lo cual es correcto.

### 3.4 Destape en cadena (flood fill)

`Tablero.revelarEnCadena` abre la casilla pulsada y, si tiene **cero** minas alrededor, abre todas sus vecinas, y así sucesivamente. Es un recorrido en anchura (BFS) con una cola `ArrayDeque`:

```
cola ← [origen]
mientras haya casillas en la cola:
    actual ← sacar de la cola
    para cada vecina oculta de actual:
        revelarla
        si tiene 0 minas alrededor → añadirla a la cola
```

Una casilla se marca como revelada **al encolarla**, de modo que nunca se procesa dos veces. Las casillas con bandera no se abren, y una casilla con número no propaga la apertura.

### 3.5 Fin de la partida

- **Derrota:** destapar una mina. Se muestran todas las minas y las banderas mal puestas.
- **Victoria:** cuando el número de casillas reveladas es `filas × columnas − minas`. Las minas restantes salen con bandera.

### 3.6 La vista del jugador

`Partida.vista()` produce la matriz `int[][]` que viaja al cliente. **Mientras se juega nunca incluye minas ocultas**: solo se ve lo que el jugador ya sabe.

| Código | Significado |
| :---- | :---- |
| `-1` | Oculta |
| `-2` | Bandera |
| `0` a `8` | Destapada, con ese número de minas vecinas |
| `9` | Mina (solo al perder) |
| `10` | La mina que explotó (solo al perder) |
| `11` | Bandera sobre una casilla sin mina (solo al perder) |

## 4. Cómo funciona el servidor (Spring Boot)

### 4.1 El arranque

`@SpringBootApplication` en `BuscaminasApplication` activa tres cosas: la **autoconfiguración** (Boot configura Tomcat, Jackson y Spring MVC según las dependencias del `pom.xml`), el **escaneo de componentes** (encuentra las clases anotadas del paquete) y la configuración propia. `SpringApplication.run` crea el contenedor de Spring, levanta Tomcat en el puerto 8002 y deja la aplicación escuchando.

### 4.2 El camino de una petición

```
Tomcat recibe la petición HTTP
   → DispatcherServlet (el "recepcionista" de Spring MVC)
   → busca el método del controlador por ruta y verbo HTTP
   → Jackson convierte el cuerpo JSON en Map<String, Object>
   → PartidaController llama a Peticiones → Accion → Partida.aplicar(...)
   → Respuesta.de(...) crea el record de respuesta
   → Jackson lo convierte a JSON
   → Tomcat responde
```

### 4.3 Las piezas de Spring que aparecen

| Anotación | Qué hace aquí |
| :---- | :---- |
| `@RestController` | Marca `PartidaController`: sus métodos devuelven datos (JSON), no vistas |
| `@GetMapping`, `@PostMapping`, `@DeleteMapping` | Asocian cada método con una ruta y un verbo HTTP |
| `@PathVariable`, `@RequestBody` | Extraen el `{id}` de la ruta y el cuerpo JSON |
| `@ResponseStatus(CREATED)` | Responde `201` al crear |
| `@Component` | `RepositorioPartidas` lo crea y gestiona Spring |
| `@Autowired` | Indica qué constructor usar para la **inyección de dependencias** (el controlador recibe el repositorio) |
| `@RestControllerAdvice` + `@ExceptionHandler` | `ManejadorErrores` convierte excepciones en `{error, message}`: `MovimientoInvalido` → `422 INVALID_MOVE`, cuerpo ilegible → `422 INVALID_REQUEST`, partida o ruta inexistente → `404 NOT_FOUND` |

`PartidaController` tiene dos constructores: uno público para Spring y otro que recibe el generador aleatorio, que usan las pruebas para fijar la semilla.

### 4.4 JSON

Jackson serializa los *records* directamente. `Respuesta` es un record `(id, game, status, board, data, message)` y su `Datos` interno lleva `@JsonProperty("mines_remaining")` para respetar el nombre en *snake_case* del contrato. Para leer las peticiones se usa `Map<String, Object>` y `Peticiones` valida los tipos a mano; así los errores salen con mensajes propios.

## 5. Estado y concurrencia

`RepositorioPartidas` guarda las partidas en un `ConcurrentHashMap<String, Partida>`. Tomcat atiende cada petición en un hilo distinto, así que dos peticiones pueden tocar la misma partida a la vez. Para evitar conflictos, los métodos de `Partida` son `synchronized`: una sola petición a la vez por partida.

## 6. Un detalle que solo aparece en Docker

El generador aleatorio es `java.util.Random` y no `RandomGenerator.getDefault()`. El segundo necesita el módulo `jdk.random`, que **no viene** en la imagen `eclipse-temurin:21-jre-alpine` (solo JRE). Con el JDK completo (en local y en las pruebas) funcionaba, pero el contenedor no arrancaba. `java.util.Random` está en `java.base`, que siempre está.

## 7. Empaquetado en Docker

```
Etapa build   maven:3.9-eclipse-temurin-21
                copia pom.xml → mvn dependency:go-offline   (dependencias en caché)
                copia src/    → mvn package -DskipTests      (genera buscaminas.jar)
Etapa final   eclipse-temurin:21-jre-alpine
                copia buscaminas.jar → java -jar app.jar     (puerto 8002)
```

El `spring-boot-maven-plugin` genera un **jar ejecutable** ("fat jar") que incluye Tomcat y todas las librerías. La imagen final solo lleva el JRE y ese `.jar` (325 MB). Se compila dentro de Docker, así que quien lo use no necesita JDK ni Maven.

## 8. Pruebas

29 pruebas:

- `TableroTest` (7): número exacto de minas, la zona segura del primer clic en 200 semillas, conteo de vecinas, flood fill y que respeta las banderas.
- `PartidaTest` (13): primer clic, victoria y derrota, vista sin minas ocultas, banderas, y errores como "celda ya revelada" o "fuera del tablero". Usan `Partida.conMinas(...)` para fijar las minas en posiciones conocidas.
- `ApiTest` (9): el contrato REST con **MockMvc en modo *standalone*** (sin levantar Tomcat ni el contexto de Spring).

```sh
cd services/buscaminas-java
mvn test
```
