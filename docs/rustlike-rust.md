# Rust Like — Documento de diseño

| Campo | Valor |
|---|---|
| Servicio | `rustlike-service` |
| Lenguaje | Rust (edición 2021, versión estable) |
| Framework web | Axum |
| Tipo | Por turnos |
| Comunicación | REST |
| Puerto interno | 8007 |
| Ruta pública | `/api/rustlike/*` → `http://rustlike-service:8007/*` |
| Carpeta | `services/rustlike-rust/` |
| Pisos | 1 a 255 (tipo `u8`) |
| Dependencias permitidas | `axum`, `tokio`, `serde`, `serde_json`, `rand` |
| Estado del documento | Diseño aprobado, valores numéricos iniciales sujetos a balance |

> Este documento forma parte del proyecto *Plataforma de Minijuegos Políglota* y sigue sus reglas generales: lógica pura separada del servidor, sin motores ni librerías de juego, servidor como autoridad y estado en memoria sin persistencia.

---

## 1. Concepto

El jugador es un **robot de mantenimiento** que despierta en una fábrica abandonada que se hunde 255 pisos bajo tierra. Su objetivo es llegar al núcleo de la fábrica, en el último piso, antes de oxidarse por completo.

**Pilares del diseño:**

1. **El óxido es la vida.** No existe barra de salud: todo el daño es corrosión.
2. **El cuerpo es modular.** Cuatro piezas que se oxidan por separado y pueden reemplazarse por otras encontradas en la mazmorra.
3. **Partidas instantáneas.** Muerte permanente, sin guardado y sin progreso entre partidas. Todo progreso ocurre dentro de la partida.
4. **Siempre hay algo nuevo.** Cada rango de pisos introduce mecánicas que cambian la forma de jugar, no solo números más altos.

El nombre y el tema juegan con el lenguaje: *Rust* significa óxido, el piso se guarda en un `u8` (máximo 255) y el jefe final se llama **The Borrow Checker**.

---

## 2. Estructura de una partida

```
Inicio en el piso 1 con piezas básicas
   │
   ▼
Explorar el piso ──▶ combatir, recoger objetos, cambiar piezas
   │
   ▼
Bajar por la escalera (o saltar por un hueco de ascensor)
   │
   ├── cada 10 pisos: sala de jefe
   ├── cada 50 pisos: jefe de zona y cambio de zona
   │
   ▼
Fin: el núcleo llega a 100 (derrota)
     o se derrota a The Borrow Checker en el piso 255 (victoria)
```

### 2.1 Duración objetivo

Una partida exitosa debe durar entre **45 y 90 minutos**. Llegar al piso 255 debe ser un logro poco frecuente. Para conseguirlo:

- **Huecos de ascensor** (sección 9.1) permiten saltar varios pisos a cambio de corrosión.
- **Los pisos se encogen con la profundidad** (sección 8.2): los primeros son amplios; los profundos, pequeños e intensos.

### 2.2 Límite de pisos

El piso se almacena como `u8` y el descenso usa aritmética comprobada (`checked_add`). Bajar desde el piso 255 es imposible: el tipo de dato impide que exista un piso 256.

---

## 3. Sistema de corrosión

### 3.1 Piezas

El robot tiene cuatro piezas, cada una con corrosión de **0 a 100**:

| Pieza | Función | Al llegar a 100 |
|---|---|---|
| **Piernas** | Movimiento | Se traban en el 75 % de los movimientos |
| **Brazos** | Ataque | No hacen daño |
| **Sensores** | Campo de visión | Radio de visión de 1 casilla |
| **Núcleo** | Vida del robot | **Fin de la partida** |

### 3.2 Estados

| Corrosión | Estado | Fallo de piernas | Daño de brazos | Radio de visión |
|---|---|---|---|---|
| 0–24 | Óptimo | 0 % | 100 % | 8 |
| 25–49 | Leve | 10 % | 75 % | 6 |
| 50–74 | Grave | 25 % | 50 % | 4 |
| 75–99 | Crítico | 50 % | 25 % | 2 |
| 100 | Bloqueado | 75 % | 0 % | 1 |

Si las piernas se traban, el jugador **pierde el turno** y los enemigos actúan igualmente. Las piernas solo se traban al **desplazarse** a una casilla libre: atacar es trabajo de los brazos y no tira el dado de piernas.

### 3.3 Fuentes de corrosión

| Fuente | Efecto |
|---|---|
| Paso del tiempo | Núcleo +1 cada 10 turnos |
| Golpe enemigo | Corrosión en una pieza al azar (piernas, brazos o sensores) |
| Pieza ya bloqueada que recibe un golpe | La corrosión pasa al núcleo |
| Pisar un charco | Piernas +3 |
| Propagación | Cada pieza en estado crítico o bloqueado suma +1 al núcleo cada 5 turnos |
| Caída por hueco de ascensor | Piernas +3 por cada piso caído |

Toda corrosión recibida por una pieza se multiplica por la **resistencia** de esa pieza (sección 4).

### 3.4 Reducción de corrosión

Solo mediante consumibles (sección 5) o reemplazando la pieza (sección 4).

---

## 4. Piezas intercambiables

Las piezas aparecen en el suelo de la mazmorra. Estando sobre una, el jugador puede cambiarla por la suya del mismo tipo; la pieza retirada queda en el suelo. **Las piezas encontradas son usadas** y traen su propio nivel de corrosión.

Cada pieza tiene **resistencia** (multiplicador de la corrosión que recibe) y opcionalmente un **rasgo**.

### 4.1 Piezas iniciales y comunes

| Tipo | Pieza | Resistencia | Rasgo |
|---|---|---|---|
| Piernas | Básicas | ×1.0 | — |
| Piernas | De oruga | ×0.5 | Inmunes a los charcos |
| Piernas | De resorte | ×1.5 | Saltar 2 casillas cada 10 turnos |
| Brazos | Básicos | ×1.0 | Daño base 10 |
| Brazos | Con taladro | ×1.2 | Daño base 15 |
| Brazos | Magnéticos | ×1.0 | Atraen objetos a 3 casillas |
| Sensores | Básicos | ×1.0 | — |
| Sensores | De largo alcance | ×1.3 | +3 al radio de visión |
| Sensores | Térmicos | ×1.0 | Detectan enemigos a través de paredes |
| Núcleo | Básico | ×1.0 | — |
| Núcleo | Reforzado | ×0.7 | Solo lo sueltan los jefes |

Los núcleos **solo los sueltan los jefes**, porque cambiar el núcleo equivale a recuperar la vida.

### 4.2 Piezas raras (zonas profundas)

Cambian la forma de jugar en lugar de solo mejorar números:

| Pieza | Efecto |
|---|---|
| Brazos de imán | Atraen a un enemigo una casilla hacia el robot en lugar de atacar a distancia |
| Piernas de flotación | Caminan sobre el agua sin corrosión, pero las cintas transportadoras no las mueven |
| Sensores de eco | Sin visión normal; cada 5 turnos un pulso revela todo el piso |
| Núcleo de fundición | El calor reduce su corrosión en lugar de dañar |

### 4.3 Bonos de conjunto

Cada pieza pertenece a un **fabricante**. Llevar dos o más piezas del mismo fabricante activa un efecto extra. Los fabricantes y sus bonos están pendientes de definir (sección 17).

---

## 5. Objetos consumibles

El robot tiene **3 espacios** de consumibles. No hay otro inventario.

| Objeto | Efecto |
|---|---|
| Lata de aceite | −30 de corrosión en la pieza que elija el jugador |
| Spray lubricante | −10 de corrosión en todas las piezas |
| Grasa protectora | Inmunidad a toda corrosión durante 10 turnos |

---

## 6. Combate

### 6.1 Orden del turno

El mundo solo avanza cuando el jugador actúa. **Una petición REST equivale a un turno completo:**

1. **Jugador**: realiza su acción (si las piernas se traban, pierde el turno).
2. **Enemigos**: cada uno, por id ascendente, ataca si está adyacente, se acerca si detecta al jugador o vaga al azar. Si el jugador cae a media fase, los demás ya no actúan.
3. **Entorno**: goteras, cintas, imanes, calor, inundación, corrosión pasiva y propagación.
4. **Comprobación**: si el núcleo llega a 100, la partida termina.
5. **Respuesta**: el servidor devuelve el estado y los eventos del turno.

### 6.2 Atacar

No existe una acción de ataque separada: **moverse hacia un enemigo lo ataca** (*bump to attack*).

```
daño = daño base de los brazos × multiplicador por corrosión de los brazos
```

Los enemigos tienen **integridad** (su vida). Al llegar a 0 se destruyen. Los enemigos no se oxidan.

### 6.3 Recibir golpes

```
corrosión recibida = golpe del enemigo × resistencia de la pieza alcanzada
```

La pieza alcanzada se elige al azar entre piernas, brazos y sensores.

### 6.4 Aleatoriedad

Los ataques **siempre aciertan**. El azar solo interviene en:

- Qué pieza recibe el golpe.
- Si las piernas se traban al moverse.

### 6.5 Velocidad

- **Normal**: actúa cada turno.
- **Lenta**: actúa uno de cada dos turnos (contador interno).
- **Veloz**: actúa dos veces por turno (solo élites, sección 7.2).

### 6.6 Puntaje

Destruir a un enemigo y completar un piso valen lo mismo: **20 puntos**, más **5 cada 50 pisos** (pisos 1–50: 20, 51–100: 25, 101–150: 30… 251–255: 45). Se usa el valor del piso en el que ocurre el hecho.

- Al bajar por la escalera cuenta el piso completado (el que se deja atrás).
- Una caída por hueco de ascensor suma un piso completado por cada piso caído.

---

## 7. Enemigos

### 7.1 Enemigos base

| Enemigo | Integridad | Golpe | Velocidad | Comportamiento |
|---|---|---|---|---|
| Ácaro de óxido | 15 | 6 | Normal | Aparece en grupos y persigue al jugador |
| Dron de limpieza | 30 | 6 | Normal | Patrulla y persigue al detectar al jugador |
| Torreta | 25 | 5 | Inmóvil | Dispara en línea recta hasta 5 casillas |
| Robot oxidado | 60 | 10 | Lenta | Al destruirse suelta una de sus piezas |
| Gotera | Indestructible | — | Inmóvil | Crea charcos a su alrededor con el tiempo |

La integridad y el golpe escalan con el número de piso (sección 17).

**Detección:** el ácaro persigue al jugador si está a distancia de Chebyshev 8 o menos. El dron vaga al azar hasta que su casilla entra en el campo de visión del jugador; desde ese momento queda despierto para siempre y persigue. Los enemigos nunca comparten casilla ni entran en la del jugador. Cada zona añade enemigos propios (pendiente de definir, sección 17).

### 7.2 Enemigos élite

Un élite tiene **estadísticas mejoradas y un único modificador**:

| Modificador | Efecto | Aspecto |
|---|---|---|
| Galvanizado | Doble de integridad | Borde gris brillante |
| Veloz | Actúa dos veces por turno | Borde amarillo |
| Explosivo | Al destruirse, daña todo lo que está a 1 casilla | Borde rojo parpadeante |

**Reglas:**

- Aparecen a partir del piso 31.
- Probabilidad inicial de 5 %, que aumenta con la profundidad hasta un máximo de 25 %.
- Todo élite suelta siempre un objeto o una pieza.
- Los jefes nunca son élite.

---

## 8. Zonas de la fábrica

### 8.1 Zonas

Cada zona cambia la paleta de colores, el algoritmo de generación, los peligros y los enemigos. Los peligros de zonas anteriores pueden seguir apareciendo.

| Pisos | Zona | Generación | Peligros nuevos |
|---|---|---|---|
| 1–50 | **Almacén** | Habitaciones y pasillos | Goteras y charcos |
| 51–100 | **Planta de tratamiento** | Cavernas irregulares e inundadas | Agua abundante |
| 101–150 | **Fundición** | Naves amplias | Calor y cintas transportadoras |
| 151–200 | **Sala de servidores** | Laberintos entre racks | Electricidad e imanes |
| 201–254 | **Cámaras de vacío** | Pasillos estrechos y esclusas | Vacío y esclusas |
| 255 | **El núcleo** | Sala fija | Jefe final |

### 8.2 Tamaño de los pisos

El tamaño disminuye con la profundidad. Valores iniciales:

| Zona | Tamaño |
|---|---|
| Almacén | 60 × 30 |
| Planta de tratamiento | 56 × 28 |
| Fundición | 50 × 26 |
| Sala de servidores | 46 × 24 |
| Cámaras de vacío | 40 × 20 |

### 8.3 Peligros del entorno

| Peligro | Efecto |
|---|---|
| Charco | Piernas +3 al pisarlo |
| Agua electrificada | Daña a todo lo que esté encima, incluidos los enemigos |
| Calor | Reduce la corrosión cercana pero causa daño si el robot permanece al lado |
| Cinta transportadora | Mueve una casilla por turno a todo lo que esté encima (robot, enemigos y objetos) |
| Imán | Atrae al robot una casilla por turno si está en su línea |
| Vacío | Sin aire no hay corrosión pasiva, pero las esclusas expulsan lo que está en su recorrido |

**Interacciones:**

- Agua + electricidad → agua electrificada. Se puede atraer a los enemigos hacia ella.
- Calor + agua → el calor evapora los charcos con el tiempo.

Los efectos del entorno se aplican en la fase 3 del turno.

---

## 9. Variedad entre pisos

### 9.1 Huecos de ascensor

- Pueden aparecer a partir del piso 5.
- Al entrar, el robot cae entre 3 y 10 pisos y recibe piernas +3 por cada piso caído.
- **La caída se detiene siempre en el siguiente piso de jefe**: no se pueden saltar jefes.

### 9.2 Pisos especiales

A partir del piso 11, cada piso tiene una probabilidad de ser especial:

| Piso | Descripción |
|---|---|
| Taller | Sala segura sin enemigos donde se elige una mejora entre tres |
| Apagón | Todo el piso está oscuro; la visión queda al mínimo |
| Inundación | El agua sube cada pocos turnos; hay que salir rápido |
| Chatarrería | Muchas piezas en el suelo, vigiladas por robots oxidados |
| Trueque | Un robot comerciante cambia una pieza del jugador por otra |
| Emboscada | La escalera queda bloqueada hasta destruir a todos los enemigos |

### 9.3 Elección de camino

A partir del piso 31, algunos pisos tienen **dos escaleras**, cada una marcada con un símbolo que indica el tipo del piso siguiente: normal, taller, chatarrería o peligro.

### 9.4 Ritmo de novedades

| Pisos | Novedad |
|---|---|
| 1–10 | Mecánicas básicas y primer jefe |
| 11–30 | Pisos especiales y piezas con rasgos |
| 31–50 | Enemigos élite, dos escaleras y primer jefe de zona |
| 51+ | Nueva zona cada 50 pisos con su generación, peligros, enemigos, jefes y piezas |

---

## 10. Jefes

### 10.1 Distribución

- **Jefes regulares**: pisos terminados en 10, 20, 30 y 40 de cada zona.
- **Jefes de zona**: pisos 50, 100, 150, 200 y 250. Más difíciles y con mejor recompensa.
- **Jefe final**: piso 255.

Las salas de jefe son fijas, diseñadas a mano, sin generación aleatoria. Todo jefe suelta un núcleo.

### 10.2 Arquetipos de jefes regulares

Se repiten en cada zona, con estadísticas y comportamientos más exigentes en cada vuelta:

| Arquetipo | Mecánica |
|---|---|
| La Prensa Hidráulica | Marca casillas un turno antes de aplastarlas |
| La Bomba de Agua | Inunda la sala progresivamente |
| La Reina Ácaro | Genera ácaros continuamente |
| El Recolector | Absorbe las piezas tiradas en la sala para fortalecerse |

### 10.3 Jefes de zona

| Piso | Zona | Jefe |
|---|---|---|
| 50 | Almacén | Pendiente de definir |
| 100 | Planta de tratamiento | Pendiente de definir |
| 150 | Fundición | **El Horno**: seca el óxido a su alrededor, pero quema |
| 200 | Sala de servidores | Pendiente de definir |
| 250 | Cámaras de vacío | Pendiente de definir |

### 10.4 Jefe final: The Borrow Checker

- Cada golpe que asesta **toma prestada** una pieza del jugador (nunca el núcleo).
- La pieza prestada queda vacía y se comporta como bloqueada.
- Al derrotarlo, devuelve todas las piezas y la partida termina en **victoria**.

---

## 11. Generación procedural

- **Semilla**: cada partida tiene una semilla `u64`. La misma semilla genera exactamente la misma partida.
- **Algoritmo por zona** (sección 8.1). El Almacén usa habitaciones rectangulares sin solapamiento conectadas por pasillos en L.
- **Contenido por piso**: escalera (o dos), enemigos, objetos, piezas, peligros y, opcionalmente, un hueco de ascensor. La densidad aumenta con la profundidad.

---

## 12. Contrato con el frontend

### 12.1 Rutas

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/games` | Crea una partida. Cuerpo opcional: `{ "options": { "seed": 123 } }` |
| `GET` | `/games/{id}` | Estado actual |
| `POST` | `/games/{id}/move` | Ejecuta un turno |
| `DELETE` | `/games/{id}` | Elimina la partida |

### 12.2 Acciones

| Acción | Cuerpo | Condición |
|---|---|---|
| Moverse / atacar | `{ "type": "move", "dir": "up" }` | 8 direcciones |
| Esperar | `{ "type": "wait" }` | — |
| Usar objeto | `{ "type": "use", "slot": 0, "target": "legs" }` | `target` solo para la lata de aceite |
| Cambiar pieza | `{ "type": "swap" }` | Estar sobre una pieza |
| Recoger objeto | `{ "type": "pick" }` | Estar sobre un objeto y tener espacio |
| Bajar | `{ "type": "descend" }` | Estar sobre una escalera o un hueco de ascensor |
| Elegir mejora | `{ "type": "choose", "option": 1 }` | Solo en un taller |

Direcciones: `up`, `down`, `left`, `right`, `up_left`, `up_right`, `down_left`, `down_right`.

Una acción inválida devuelve `422` con `{ "error": "...", "message": "..." }`.

### 12.3 Estado

```json
{
  "id": "c7d2e0",
  "game": "rustlike",
  "status": "playing",
  "board": [["unknown", "wall", "floor", "water"]],
  "data": {
    "floor": 37,
    "zone": "warehouse",
    "turn": 412,
    "seed": 8812345678,
    "width": 60,
    "height": 30,
    "player": { "x": 12, "y": 7 },
    "visible": [[false, true, true, false]],
    "entities": [
      { "id": 4, "kind": "rust_mite", "x": 14, "y": 7, "elite": null },
      { "id": 9, "kind": "drone", "x": 18, "y": 5, "elite": "fast" },
      { "id": 11, "kind": "oil_can", "x": 10, "y": 9 },
      { "id": 12, "kind": "part", "slot": "legs", "name": "tracked", "corrosion": 40, "x": 15, "y": 8 }
    ],
    "parts": {
      "legs":    { "name": "basic", "corrosion": 42 },
      "arms":    { "name": "drill", "corrosion": 18 },
      "sensors": { "name": "basic", "corrosion": 61 },
      "core":    { "name": "basic", "corrosion": 35 }
    },
    "items": ["oil_can", null, "grease"],
    "allowedActions": ["move", "wait"],
    "events": ["player_hit", "part_degraded"],
    "log": ["El ácaro de óxido te muerde. Sensores +6."],
    "score": 4120
  },
  "message": null
}
```

- Sigue el contrato común de los minijuegos: en la raíz solo `id`, `game`, `status`, `board`, `data` y `message`; todo lo demás va dentro de `data`.
- `status`: `"playing"`, `"won"` o `"lost"`.
- `board`: tipo de cada casilla. Las nunca vistas son `"unknown"`.
- `message`: `null` en las respuestas correctas.
- `data.visible`: casillas dentro del campo de visión actual.
- `data.entities`: solo lo que está en casillas visibles. Enemigos: `{id, kind, x, y, elite, integrity, maxIntegrity}`; objetos: `{id, kind, x, y}`.
- `data.items`: los 3 espacios de objetos, con el id del objeto o `null`.
- `data.allowedActions`: acciones que se pueden intentar ahora (`"descend"` solo sobre la escalera, `"pick"` sobre un objeto con espacio libre, `"use"` si se lleva algún objeto).
- `data.events`: lo ocurrido en el turno, usado únicamente para animaciones.
- `data.log`: últimas 20 entradas del registro de mensajes.
- `data.score`: puntaje acumulado (sección 6.6).

**El servidor nunca envía información que el jugador no puede ver**: ni el mapa completo, ni enemigos fuera de visión, ni el contenido del piso siguiente (salvo el símbolo de las escaleras).

### 12.4 Eventos

`player_moved`, `player_stuck`, `enemy_hit`, `enemy_destroyed`, `player_hit`, `part_degraded`, `part_blocked`, `part_swapped`, `item_used`, `item_picked`, `floor_descended`, `elevator_fall`, `boss_defeated`, `part_borrowed`, `parts_returned`, `game_over`, `victory`.

---

## 13. Representación visual

Todo se dibuja con **componentes React, SVG y CSS**, sin imágenes ni recursos externos.

### 13.1 Componentes

```
<Game>
 ├── <Board>      ← un único <svg> del tamaño del piso
 │    ├── <Tile>   ← un <rect> por casilla (memorizado con React.memo)
 │    ├── <Entity> ← enemigos, objetos y piezas
 │    ├── <Robot>  ← el jugador, cada pieza como forma separada
 │    └── <Fog>    ← niebla y efecto de apagón
 └── <Hud>        ← panel a la derecha del mapa: piezas, corrosión, objetos, Recoger
                    y las últimas 5 líneas del registro (piso, zona, turno y puntaje van arriba)
```

### 13.2 Lenguaje visual

| Elemento | Representación |
|---|---|
| Zonas | Paleta propia definida en variables CSS |
| Robot | Grupo SVG de rectángulos y círculos; cada pieza cambia de color de gris a naranja y marrón según su corrosión |
| Ácaro | Círculo pequeño con patitas |
| Dron | Rombo |
| Torreta | Cuadrado con cañón |
| Robot oxidado | Versión tosca del robot del jugador |
| Élites | Borde de color según el modificador |
| Agua | Casilla azul con animación suave de opacidad |
| Agua electrificada | Azul con parpadeo amarillo |
| Calor | Degradado radial naranja que pulsa |
| Cinta transportadora | Franjas diagonales animadas en la dirección de la cinta |
| Imán | Forma de "U" |
| Escalera | Líneas escalonadas, con símbolo encima si hay dos |
| Hueco de ascensor | Casilla negra con borde de franjas amarillas y negras |
| Esclusa | Rectángulo con línea central que se abre y cierra |
| Niebla | Casillas exploradas pero no visibles con opacidad reducida |
| Apagón | Capa negra con degradado radial transparente centrado en el robot |
| Pulso de eco | Círculo que crece desde el robot y se desvanece |

Los eventos de cada turno se animan en secuencia (desplazamiento del robot, parpadeo del enemigo golpeado, cambio de color de la pieza dañada), sin que el frontend contenga lógica de juego.

---

## 14. Organización del código

```
services/rustlike-rust/
├── Cargo.toml
├── Dockerfile
├── src/
│   ├── main.rs            ← servidor Axum
│   ├── routes.rs
│   └── logic/
│       ├── mod.rs         ← API pública: new_game, apply_action
│       ├── state.rs       ← GameState, Player, Floor
│       ├── corrosion.rs
│       ├── combat.rs
│       ├── entities.rs    ← enemigos, élites, objetos, piezas (enums)
│       ├── ai.rs          ← comportamiento de enemigos y jefes
│       ├── fov.rs         ← campo de visión (shadowcasting)
│       ├── pathfinding.rs ← BFS / A*
│       ├── environment.rs ← peligros e interacciones
│       ├── special.rs     ← pisos especiales y ascensores
│       └── map/
│           ├── generator.rs
│           ├── zones.rs
│           └── bosses.rs
└── tests/
```

**Convenciones:**

- Tipos de casilla, enemigo, modificador, pieza, objeto, acción y evento como `enum`, manejados con `match` exhaustivos.
- Las entidades se guardan en un `Vec` y se referencian por identificador, nunca con referencias entre entidades.
- Toda la aleatoriedad pasa por un único generador sembrado con la semilla de la partida.

---

## 15. Fases de desarrollo

1. **Base**: generación del Almacén, movimiento, muros, escaleras y campo de visión.
2. **Corrosión**: cuatro piezas, estados, corrosión pasiva, charcos y propagación.
3. **Combate**: ácaro, dron y lata de aceite.
4. **Contenido del Almacén**: resto de enemigos, consumibles y piezas intercambiables.
5. **Jefes regulares**: los cuatro arquetipos.
6. **Mecánicas transversales**: huecos de ascensor, pisos especiales, élites y elección de camino.
7. **Zonas**: una a una, de la Planta de tratamiento a las Cámaras de vacío, con sus jefes de zona.
8. **Final**: The Borrow Checker y la condición de victoria.

---

## 16. Casos límite para las pruebas

- La misma semilla produce exactamente la misma partida.
- Ninguna casilla `unknown` ni entidad no visible se filtra al cliente.
- Una pieza bloqueada que recibe un golpe transfiere la corrosión al núcleo.
- Las piernas trabadas consumen el turno.
- Un hueco de ascensor nunca salta un piso de jefe.
- Es imposible descender desde el piso 255.
- The Borrow Checker nunca toma el núcleo y devuelve todas las piezas al ser derrotado.
- No se puede recoger un objeto con los 3 espacios llenos.
- Un enemigo explosivo daña también a otros enemigos.
- Las cintas transportadoras mueven robot, enemigos y objetos en la fase de entorno.

---

## 17. Pendiente de definir

- Tono y estilo visual definitivos.
- Balance de todos los valores numéricos.
- ~~Escalado de enemigos por piso~~ (decidido): `valor = base + base × ((piso − 1) / 10) / 10` con enteros, es decir, +10 % cada 10 pisos completos; se aplica a la integridad y al golpe.
- Enemigos propios de cada zona.
- Jefes de zona de los pisos 50, 100, 200 y 250.
- Fabricantes de piezas y sus bonos de conjunto.
- Probabilidades de pisos especiales, ascensores y dos escaleras.
- Opciones concretas de mejora en el taller.
