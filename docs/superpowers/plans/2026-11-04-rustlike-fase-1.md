# Rust Like — Fase 1 (Base) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un robot que se puede mover por el Almacén generado con una semilla, con campo de visión y niebla, y que baja por las escaleras piso a piso, jugable de punta a punta desde la web.

**Architecture:** Crate `rustlike` con biblioteca (`src/lib.rs`) y binario (`src/main.rs`). `src/logic/` es lógica pura (sin Axum ni JSON salvo `serde::Deserialize` en `Action`/`Dir`). `src/routes.rs` y `src/presenter.rs` son la capa servidor, delgada: parsean el cuerpo, llaman a `logic::apply_action` bajo un `Mutex` y construyen el JSON del contrato común. El gateway reenvía `/api/rustlike/*` y el frontend dibuja un `<svg>`.

**Tech Stack:** Rust estable (1.99, edición 2021), axum 0.8, tokio 1 (`full`), serde 1 (`derive`), serde_json 1, rand 0.10. React 19 + Vitest para el frontend, Node + `node:test` para el gateway.

**Spec:** `docs/rustlike-rust.md` (diseño del juego) y `docs/arquitectura-minijuegos.md` §4 y §8 (contrato común y reglas del proyecto). Esta fase cubre la fase 1 de la §15 del diseño.

## Global Constraints

- Carpeta `services/rustlike-rust/`, servicio `rustlike-service`, puerto `8007` (variable `PORT`), ruta pública `/api/rustlike/*` → `http://rustlike-service:8007/*`.
- Dependencias de ejecución: solo `axum`, `tokio`, `serde`, `serde_json`, `rand`. `Cargo.lock` se versiona (fija la secuencia de `StdRng` y con ella la reproducibilidad por semilla).
- Edición 2021 en `Cargo.toml`.
- Piso: `u8` de 1 a 255; bajar usa `checked_add`.
- Toda la aleatoriedad de la partida pasa por un único `StdRng::seed_from_u64(seed)` guardado en el estado. Los ids de partida y las semillas por defecto usan otro generador (no el de la partida).
- Contrato común (arquitectura §4.1, regla 8.1.1): respuesta `{id, game: "rustlike", status, board, data, message}`. **Nada fuera de `data`**: los `events` y el `log` de la §12.3 del diseño van dentro de `data`. `message` es `null` en las respuestas correctas.
- Códigos: `POST /games` → 201, `GET` → 200, `move` → 200, `DELETE` → 204 (idempotente). Errores `{error, message}`: `INVALID_MOVE` (422, jugada que el juego no permite), `INVALID_REQUEST` (422, cuerpo mal formado o acción desconocida), `NOT_FOUND` (404, partida o ruta inexistente), `INTERNAL_ERROR` (500).
- Una acción inválida no cambia nada del estado (ni el turno, ni el generador aleatorio).
- El servidor nunca envía casillas no vistas: en `board` son `"unknown"`.
- Cada archivo empieza con un comentario breve que explica qué hace, y cada función interna lleva un comentario corto (regla 8.1.8). Comentarios y mensajes al jugador en español; identificadores en inglés, como en el diseño.
- Los valores de la fase 1: radio de visión **8** (estado Óptimo, §3.2), tamaños de zona de la §8.2, Almacén 60 × 30.

## Review Focus

- **Teclas repetidas rápido en el frontend:** mantener una flecha pulsada no debe mandar movimientos encadenados ni aplicar respuestas viejas. Se ignoran las teclas mientras hay una petición en curso (prueba en la Tarea 6).
- **Semillas en los bordes:** `u64::MAX` se acepta; `-1`, `1.5`, `"7"` y números mayores que `u64::MAX` dan 422 `INVALID_REQUEST` y no un 400/500 de Axum (Tarea 4).
- **Pisos sin salida:** con cualquier semilla, la escalera es alcanzable desde la posición inicial y no coincide con ella (Tarea 1, 300 semillas).
- **Jugada inválida que deja huella:** chocar con un muro o bajar fuera de la escalera devuelve 422 y el siguiente `GET` muestra el mismo turno y el mismo tablero (Tareas 3 y 4).
- **Fugas de información:** en la partida recién creada, toda casilla distinta de `"unknown"` está a distancia ≤ 8 del robot, y la escalera solo aparece en `board` cuando ya se vio (Tareas 3 y 4).

---

### Task 1: Crate, mapa, zonas y generador del Almacén

**Files:**
- Create: `services/rustlike-rust/Cargo.toml`, `services/rustlike-rust/Cargo.lock` (lo genera cargo), `services/rustlike-rust/.gitignore` (`target/`)
- Create: `services/rustlike-rust/src/lib.rs` (`pub mod logic;` por ahora)
- Create: `services/rustlike-rust/src/logic/mod.rs` (por ahora solo `pub mod map;`)
- Create: `services/rustlike-rust/src/logic/map/mod.rs`, `map/zones.rs`, `map/generator.rs`
- Add to git: `docs/rustlike-rust.md` (todavía no está versionado)

**Interfaces:**
- Produces (en `logic::map`):
  - `#[derive(Clone, Copy, Debug, PartialEq, Eq)] pub enum Tile { Wall, Floor, Stairs }` con `pub fn id(self) -> &'static str` → `"wall"`, `"floor"`, `"stairs"`.
  - `#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)] pub struct Pos { pub x: i32, pub y: i32 }`.
  - `#[derive(Clone, Debug, PartialEq, Eq)] pub struct Map { pub width: usize, pub height: usize, tiles: Vec<Tile> }` con `pub fn filled(width, height, Tile) -> Map`, `pub fn get(&self, Pos) -> Tile` (fuera de los límites devuelve `Wall`), `pub fn set(&mut self, Pos, Tile)`, `pub fn in_bounds(&self, Pos) -> bool`, `pub fn is_walkable(&self, Pos) -> bool` (`Floor` o `Stairs`).
  - `pub struct Level { pub map: Map, pub start: Pos, pub stairs: Option<Pos> }`.
  - `zones::Zone { Warehouse, TreatmentPlant, Foundry, ServerRoom, VacuumChambers, Core }` (Copy, Debug, PartialEq, Eq) con `pub fn for_floor(floor: u8) -> Zone`, `pub fn size(self) -> (usize, usize)` y `pub fn id(self) -> &'static str`.
  - `generator::generate(floor: u8, rng: &mut StdRng) -> Level`.

- [ ] **Step 1: Crear el crate**

`cargo new --lib services/rustlike-rust --name rustlike --edition 2021`, después `cargo add axum serde_json rand`, `cargo add tokio --features full` y `cargo add serde --features derive`. Añadir a mano en `Cargo.toml` una sección `[[bin]] name = "rustlike-service", path = "src/main.rs"` solo en la Tarea 4, cuando exista `main.rs`.

- [ ] **Step 2: Escribir las pruebas de zonas y del generador (en `#[cfg(test)] mod tests` dentro de cada archivo)**

```rust
// zones.rs
#[test] fn floors_map_to_zones() {
    assert_eq!(Zone::for_floor(1), Zone::Warehouse);   assert_eq!(Zone::for_floor(50), Zone::Warehouse);
    assert_eq!(Zone::for_floor(51), Zone::TreatmentPlant); assert_eq!(Zone::for_floor(150), Zone::Foundry);
    assert_eq!(Zone::for_floor(200), Zone::ServerRoom);  assert_eq!(Zone::for_floor(254), Zone::VacuumChambers);
    assert_eq!(Zone::for_floor(255), Zone::Core);
}
#[test] fn sizes_match_design() {
    assert_eq!(Zone::Warehouse.size(), (60, 30)); assert_eq!(Zone::TreatmentPlant.size(), (56, 28));
    assert_eq!(Zone::Foundry.size(), (50, 26));   assert_eq!(Zone::ServerRoom.size(), (46, 24));
    assert_eq!(Zone::VacuumChambers.size(), (40, 20)); assert_eq!(Zone::Core.size(), (40, 20));
}
#[test] fn ids() { assert_eq!(Zone::Warehouse.id(), "warehouse"); /* treatment_plant, foundry, server_room, vacuum_chambers, core */ }

// generator.rs  (rng = StdRng::seed_from_u64(seed))
#[test] fn same_seed_same_level()            // generate(1, rng(42)) == generate(1, rng(42)) en map, start y stairs
#[test] fn different_seeds_differ()          // generate(1, rng(1)).map != generate(1, rng(2)).map
#[test] fn level_has_zone_size()             // piso 1 → 60×30; piso 60 → 56×28
#[test] fn border_is_wall()                  // toda casilla con x==0, y==0, x==width-1 o y==height-1 es Wall
#[test] fn stairs_reachable_and_apart()      // para seed in 0..300: stairs.is_some(), stairs != start,
                                             // map.get(start)==Floor, map.get(stairs)==Stairs, y un BFS en 8 direcciones
                                             // (escrito en la prueba) desde start por casillas walkable llega a stairs
#[test] fn exactly_one_stairs()              // contar Tile::Stairs == 1 en pisos 1..=254 (seed 7)
#[test] fn last_floor_has_no_stairs()        // generate(255, ..).stairs == None y no hay ninguna Tile::Stairs
```

- [ ] **Step 3: Ejecutar `cargo test` en `services/rustlike-rust`** — Expected: no compila (faltan los tipos).

- [ ] **Step 4: Implementar `Tile`, `Pos`, `Map`, `Level`, `Zone` y `generate`**

Algoritmo de `generate` (§11: habitaciones rectangulares sin solapamiento + pasillos en L), con la profundidad fija en la fase 1 (todas las zonas usan este algoritmo; las demás llegan en la fase 7):
- `Map::filled(w, h, Wall)` con `(w, h) = Zone::for_floor(floor).size()`.
- Hasta 80 intentos y como máximo 12 habitaciones: ancho aleatorio en `5..=12`, alto en `4..=8`, esquina superior izquierda dentro de `1..w-ancho-1` × `1..h-alto-1`. Se descarta si su rectángulo agrandado 1 casilla por cada lado se cruza con una ya aceptada.
- Si quedan menos de 2 habitaciones, se repite todo con el mismo `rng` (que ya avanzó). Con estos números no debería pasar casi nunca, pero garantiza que la escalera y el inicio queden en salas distintas.
- Cada habitación `i ≥ 1` se une con la `i-1` por un pasillo en L entre sus centros; con `rng.random_bool(0.5)` se elige si va primero en horizontal o en vertical.
- `start` = centro de la primera habitación; `stairs` = centro de la última, salvo en el piso 255, donde es `None` y no se coloca escalera.

- [ ] **Step 5: Ejecutar `cargo test` y `cargo clippy -- -D warnings`** — Expected: todo PASS, sin avisos.

- [ ] **Step 6: Commit**

```bash
git add docs/rustlike-rust.md services/rustlike-rust
git commit -m "feat(rustlike): crate, zonas y generador del Almacén con semilla"
```

---

### Task 2: Campo de visión (shadowcasting)

**Files:**
- Create: `services/rustlike-rust/src/logic/fov.rs` (y `pub mod fov;` en `logic/mod.rs`)

**Interfaces:**
- Consumes: `Map`, `Pos`, `Tile` (Tarea 1).
- Produces: `pub fn compute(map: &Map, origin: Pos, radius: i32) -> Vec<Vec<bool>>`, indexado `[y][x]` con `map.height` filas de `map.width` columnas.

- [ ] **Step 1: Escribir las pruebas (en `fov.rs`, mapas armados a mano con `Map::filled` + `set`)**

```rust
#[test] fn origin_is_visible()
#[test] fn open_room_lights_circle()    // sala 21×21 sin muros interiores, origen (10,10), radio 8:
                                        // (10,2) y (18,10) visibles, (10,1) no; (16,16) no (6²+6² = 72 > 64)
#[test] fn walls_are_visible_but_block() // en un pasillo horizontal, el muro que lo cierra en x=5 es visible y (6,y) no
#[test] fn pillar_casts_shadow()         // muro en (12,10), origen (10,10): (14,10) no visible, (12,9) sí
#[test] fn grid_has_map_shape()          // compute(&map 60×30, ..).len() == 30 y cada fila mide 60
```

- [ ] **Step 2: Ejecutar `cargo test fov`** — Expected: FAIL (falta `compute`).

- [ ] **Step 3: Implementar `compute`**

Shadowcasting recursivo en 8 octantes (el algoritmo clásico de Björn Bergström). Una casilla es visible si `dx² + dy² <= radius²`. Los muros reciben luz pero cortan el haz. Esto también determina las pruebas de sombra.

- [ ] **Step 4: Ejecutar `cargo test` y `cargo clippy -- -D warnings`** — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(rustlike): campo de visión con shadowcasting"`

---

### Task 3: Estado de la partida y turnos (moverse, esperar, bajar)

**Files:**
- Create: `services/rustlike-rust/src/logic/state.rs`, `services/rustlike-rust/src/logic/action.rs`
- Modify: `services/rustlike-rust/src/logic/mod.rs` (API pública: `new_game`, `apply_action`, reexporta los tipos)
- Modify: `docs/rustlike-rust.md` §12.3 (`events` y `log` dentro de `data`, `message: null` arriba, `data.allowedActions`, `data.entities` vacío en la fase 1), y corregir las referencias de las §4.3 y §7.1 de "sección 14" a "sección 17". Añadir una sección «Puntaje» con la regla de los 20 puntos (+5 cada 50 pisos) por enemigo destruido y por piso completado, y quitar "Fórmula de puntaje" de la §17.
- Create: `services/rustlike-rust/src/logic/score.rs`

**Interfaces:**
- Consumes: `generate`, `Zone`, `fov::compute`.
- Produces:
  - `action.rs`: `#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)] #[serde(tag = "type", rename_all = "snake_case")] pub enum Action { Move { dir: Dir }, Wait, Descend }`; `#[derive(Deserialize, ..)] #[serde(rename_all = "snake_case")] pub enum Dir { Up, Down, Left, Right, UpLeft, UpRight, DownLeft, DownRight }` con `pub fn delta(self) -> (i32, i32)` (`Up` = `(0, -1)`); `pub enum Event { PlayerMoved, FloorDescended }` con `pub fn id(self) -> &'static str` → `"player_moved"`, `"floor_descended"`; `#[derive(Debug, PartialEq, Eq)] pub struct InvalidMove(pub String)`.
  - `state.rs`: `pub enum Status { Playing, Won, Lost }` con `id()` → `"playing"`/`"won"`/`"lost"`, y
    `pub struct GameState { pub seed: u64, pub floor: u8, pub zone: Zone, pub turn: u32, pub map: Map, pub stairs: Option<Pos>, pub player: Pos, pub seen: Vec<Vec<bool>>, pub visible: Vec<Vec<bool>>, pub status: Status, pub log: Vec<String>, pub rng: StdRng }` (`StdRng` no es `Clone` en rand 0.10: el estado se modifica en el sitio).
    Más `pub fn known_tile(&self, Pos) -> Option<Tile>` (`None` si nunca se vio) y `pub fn allowed_actions(&self) -> Vec<&'static str>` (`["move", "wait"]`, más `"descend"` si el robot está sobre la escalera).
  - `mod.rs`: `pub const VISION_RADIUS: i32 = 8;`, `pub const LOG_LIMIT: usize = 20;`, `pub fn new_game(seed: u64) -> GameState`, `pub fn apply_action(state: &mut GameState, action: Action) -> Result<Vec<Event>, InvalidMove>`.
  - `GameState` lleva también `pub score: u32` (empieza en 0).
  - `logic/score.rs`: `pub fn points_for_floor(floor: u8) -> u32` = `20 + 5 * ((floor - 1) / 50)`, es decir, 20 en los pisos 1–50, 25 en los 51–100… y 40 en los 251–255. Es lo que vale **destruir a un enemigo** en ese piso (fase 3) y **completar** ese piso al bajar.

Puntaje (decisión del usuario): al bajar del piso `f` se suma `points_for_floor(f)`, el del piso completado. Destruir enemigos usará la misma función a partir de la fase 3. Los saltos por hueco de ascensor (fase 6) sumarán un piso completado por cada piso caído.

Reglas (y textos fijos):
- `new_game`: piso 1, turno 0, `Playing`, nivel de `generate(1, &mut rng)`, visión calculada y `seen` actualizado, `log = ["Despiertas en el piso 1 de la fábrica."]`.
- `Move`: si el destino no es transitable → `Err(InvalidMove("Un muro bloquea el paso."))`. Los diagonales se permiten siempre que el destino sea transitable. Si se puede: mueve, `turn += 1`, recalcula visión, suma a `seen` y devuelve `[PlayerMoved]`.
- `Wait`: `turn += 1` y devuelve `[]`.
- `Descend`: si no está sobre `Stairs` → `Err("No hay escalera aquí.")`; si `floor.checked_add(1)` es `None` → `Err("No se puede bajar más: el piso 255 es el último.")`. Si se puede: genera el piso nuevo con el mismo `rng`, coloca al robot en `start`, reinicia `seen`, `turn += 1`, añade al log `"Bajas al piso {n}."` y devuelve `[FloorDescended]`.
- Si `status != Playing` → `Err("La partida ha terminado.")`.
- Toda validación ocurre **antes** de modificar el estado. El `log` conserva las últimas `LOG_LIMIT` entradas.

- [ ] **Step 1: Escribir las pruebas (`#[cfg(test)]` en `logic/mod.rs`)**

```rust
#[test] fn new_game_starts_on_floor_one()        // floor 1, turn 0, zone Warehouse, Playing, player == posición inicial
#[test] fn same_seed_same_game()                 // new_game(9) y new_game(9): iguales map, player, seen; misma secuencia
                                                 // de acciones válidas → mismo estado (comparar campos, no rng)
#[test] fn move_into_wall_is_rejected_and_changes_nothing()
    // buscar una Dir cuyo destino sea Wall; Err(InvalidMove("Un muro bloquea el paso.")); turn, player y seen sin cambios
#[test] fn valid_move_advances_turn()            // turn 1, player desplazado según delta, eventos == [PlayerMoved]
#[test] fn wait_advances_turn()
#[test] fn descend_off_stairs_is_rejected()
#[test] fn descend_on_stairs_goes_to_next_floor() // player = stairs; Ok([FloorDescended]); floor 2; player sobre Floor;
                                                  // log.last() == "Bajas al piso 2."
#[test] fn cannot_descend_from_floor_255()       // floor = 255, map.set(player, Stairs) → Err con el texto del piso 255; floor sigue en 255
#[test] fn unseen_tiles_are_unknown()            // known_tile devuelve None en toda casilla con seen == false, y Some en las vistas
#[test] fn fresh_game_sees_only_radius()         // toda casilla vista cumple dx² + dy² <= 64 respecto al robot
#[test] fn allowed_actions_offer_descend_only_on_stairs()
#[test] fn log_is_capped()                       // 30 descensos (poniendo al robot en la escalera cada vez) → log.len() == 20
#[test] fn points_grow_every_50_floors()         // points_for_floor: 1→20, 50→20, 51→25, 100→25, 101→30, 250→40, 255→40
#[test] fn descending_adds_points_of_completed_floor() // piso 1 → bajar → score 20; con floor = 50 sobre la escalera → bajar → +20;
                                                      // con floor = 51 → bajar → +25; una jugada inválida no cambia score
```

- [ ] **Step 2: Ejecutar `cargo test`** — Expected: FAIL.
- [ ] **Step 3: Implementar `action.rs`, `state.rs` y la API de `mod.rs` con las reglas de arriba.**
- [ ] **Step 4: Ejecutar `cargo test` y `cargo clippy -- -D warnings`** — Expected: PASS.
- [ ] **Step 5: Editar `docs/rustlike-rust.md` §12.3 y las referencias "sección 14" → "sección 17".**
- [ ] **Step 6: Commit** — `git commit -m "feat(rustlike): estado de partida, movimiento, espera y descenso"`

---

### Task 4: Servidor Axum con el contrato REST

**Files:**
- Create: `services/rustlike-rust/src/routes.rs`, `services/rustlike-rust/src/presenter.rs`, `services/rustlike-rust/src/main.rs`
- Modify: `services/rustlike-rust/src/lib.rs` (`pub mod routes; mod presenter;`), `services/rustlike-rust/Cargo.toml` (`[[bin]]`, y `[dev-dependencies] tower = { version = "0.5", features = ["util"] }` y `http-body-util = "0.1"`, que solo sirven para las pruebas y ya son dependencias transitivas de axum)
- Create: `services/rustlike-rust/tests/api.rs`
- Modify: `README.md` (añadir la sección «Desarrollo local de Rust Like» igual que la de Blackjack: `cargo test`, `cargo run`, y `PORT`)

**Interfaces:**
- Consumes: `logic::{new_game, apply_action, Action, GameState, InvalidMove, VISION_RADIUS}`.
- Produces: `pub fn app() -> axum::Router` (almacén nuevo y vacío), que usan `main.rs` y las pruebas.

Decisiones:
- Almacén: `Arc<Mutex<HashMap<String, GameState>>>` con `std::sync::Mutex`. `apply_action` se ejecuta con el candado tomado, lo que serializa las jugadas de una misma partida. Id: 6 caracteres hex a partir de `rand::random::<u32>()`, repitiendo si ya existe. Semilla por defecto: `rand::random::<u64>()`.
- Los cuerpos se leen como `Bytes` y se parsean con `serde_json`, para que cualquier error salga en formato de contrato y no con los rechazos de texto plano de Axum. `POST /games`: cuerpo vacío, `{}` u `{"options": {}}` son válidos; `options.seed` debe ser un entero JSON en `0..=u64::MAX`. `move`: `{"action": {...}}` deserializado a `Action`; si falla → 422 `INVALID_REQUEST` con el mensaje de serde.
- `InvalidMove` → 422 `INVALID_MOVE`. Partida inexistente → 404 `NOT_FOUND` "Partida no encontrada". Ruta desconocida (`fallback`) → 404 `NOT_FOUND` "Ruta no encontrada". `GET /health` → `{"status": "ok"}`.
- `presenter::present(id: &str, s: &GameState, events: &[Event]) -> serde_json::Value`:
  `{ id, game: "rustlike", status, message: null, board: [[tile o "unknown"]], data: { floor, zone, turn, seed, width, height, player: {x, y}, visible, entities: [], log, events: [ids], allowedActions, score } }`, con `score` tomado de `GameState::score`. Las respuestas de `GET` y `POST /games` llevan `events: []`.
- `main.rs`: `#[tokio::main]`, escucha en `0.0.0.0:$PORT` (8007 si no está definida) con `axum::serve`.

- [ ] **Step 1: Escribir `tests/api.rs`** (cada prueba usa `rustlike::routes::app()` con `tower::ServiceExt::oneshot` y helpers `post(app, path, body) -> (StatusCode, Value)` y `get`/`delete`)

```rust
#[tokio::test] async fn create_returns_201_with_contract()   // seed 42: 201, game "rustlike", status "playing", message null,
                                                             // data.floor 1, zone "warehouse", width 60, height 30, seed 42,
                                                             // board 30 filas × 60, data.events == [], data.entities == []
#[tokio::test] async fn same_seed_same_response()            // dos POST con seed 42 → board y data iguales (id distinto)
#[tokio::test] async fn create_without_body_works()          // cuerpo vacío → 201; también {} → 201
#[tokio::test] async fn max_seed_is_accepted()               // seed 18446744073709551615 → 201 y data.seed igual
#[tokio::test] async fn bad_seeds_are_rejected()             // -1, 1.5, "7", 18446744073709551616 → 422 INVALID_REQUEST
#[tokio::test] async fn get_unknown_game_is_404()            // NOT_FOUND
#[tokio::test] async fn unknown_route_is_404_json()          // GET /nope → 404 {"error":"NOT_FOUND",...}
#[tokio::test] async fn valid_move_returns_event()           // elegir una dir con casilla transitable en board alrededor de player;
                                                             // 200, turn 1, data.events == ["player_moved"]
#[tokio::test] async fn wall_move_is_422_and_state_untouched() // INVALID_MOVE; después GET → turn 0 y mismo board
#[tokio::test] async fn malformed_actions_are_invalid_request() // "nope", {}, {"action":{"type":"fly"}},
                                                               // {"action":{"type":"move","dir":"north"}} → 422 INVALID_REQUEST
#[tokio::test] async fn descend_off_stairs_is_422()
#[tokio::test] async fn board_never_leaks_unseen_tiles()     // toda casilla != "unknown" está a dx²+dy² <= 64 del robot;
                                                             // si "stairs" aparece en board, también es vista en ese momento o antes
#[tokio::test] async fn delete_is_idempotent()               // 204 dos veces; después GET → 404
```

- [ ] **Step 2: Ejecutar `cargo test --test api`** — Expected: FAIL (falta `routes`).
- [ ] **Step 3: Implementar `routes.rs`, `presenter.rs` y `main.rs` con las decisiones de arriba.**
- [ ] **Step 4: Ejecutar `cargo test` y `cargo clippy --all-targets -- -D warnings`** — Expected: PASS.
- [ ] **Step 5: Prueba a mano** — `PORT=8007 cargo run` y en otra terminal `curl -s -XPOST localhost:8007/games -d '{"options":{"seed":1}}' | head -c 300`. Expected: un JSON que contiene `"game":"rustlike"`.
- [ ] **Step 6: Añadir la sección de desarrollo local al `README.md`.**
- [ ] **Step 7: Commit** — `git commit -m "feat(rustlike): servidor Axum con el contrato REST"`

---

### Task 5: Docker, Compose y gateway

**Files:**
- Create: `services/rustlike-rust/Dockerfile`, `services/rustlike-rust/.dockerignore` (`target/`)
- Modify: `docker-compose.yml` (servicio `rustlike-service`, `build: ./services/rustlike-rust`, `expose: ["8007"]`, y añadirlo al `depends_on` del gateway)
- Modify: `gateway/src/app.js` (`rustlike: env.RUSTLIKE_URL ?? 'http://rustlike-service:8007'` y la ruta `{ prefix: '/api/rustlike', target: t.rustlike, rewrite: '' }`)
- Modify: `gateway/test/gateway.test.js` (prueba igual que la de Blackjack, en la línea 117)
- Modify: `README.md` (lista de servicios y comandos `docker compose`), `docs/frontend-y-gateway.md` §1 (fila de la tabla y `RUSTLIKE_URL`), `docs/funcionamiento-general.md` (filas de Rust Like en las tablas §2, §5, §6, §7 y §8, y en el diagrama de la §1)

- [ ] **Step 1: Escribir la prueba del gateway**

```js
test('buildRoutes: /api/rustlike apunta a rustlike-service:8007', () => {
  const ruta = (r) => r.find((x) => x.prefix === '/api/rustlike');
  assert.deepEqual(ruta(buildRoutes({})), { prefix: '/api/rustlike', target: 'http://rustlike-service:8007', rewrite: '' });
  assert.equal(ruta(buildRoutes({ RUSTLIKE_URL: 'http://localhost:9' })).target, 'http://localhost:9');
});
```

- [ ] **Step 2: Ejecutar `cd gateway && npm test`** — Expected: esa prueba FAIL.
- [ ] **Step 3: Añadir la ruta en `app.js`.** Ejecutar `npm test` — Expected: PASS.
- [ ] **Step 4: Escribir el `Dockerfile`** en dos etapas, como el de Asteroids: `rust:1.99-alpine` (con musl el binario sale estático); primero copiar `Cargo.toml` y `Cargo.lock` con un `src/lib.rs` y un `src/main.rs` vacíos para dejar las dependencias en caché, después copiar `src/`, tocar los archivos y hacer `cargo build --release --locked`. La imagen final es `FROM scratch`, con el binario `rustlike-service`, `ENV PORT=8007`, `EXPOSE 8007` y `CMD ["/rustlike-service"]`. El comentario de cabecera explica las dos etapas.
- [ ] **Step 5: Verificar** — `docker compose up -d --build --no-deps gateway rustlike-service` y `curl -s -XPOST localhost:3000/api/rustlike/games | head -c 200`. Expected: 201 con `"game":"rustlike"`. Anotar el tamaño de la imagen (`docker images`) para la tabla §7 de `funcionamiento-general.md`.
- [ ] **Step 6: Actualizar `docker-compose.yml`, `README.md`, `docs/frontend-y-gateway.md` y `docs/funcionamiento-general.md`.**
- [ ] **Step 7: Commit** — `git commit -m "feat(rustlike): imagen Docker, servicio en Compose y ruta en el gateway"`

---

### Task 6: Pantalla jugable en el frontend

**Files:**
- Create: `frontend/src/api/rustlike.js` (`crearPartida(seed?)`, `jugar(id, accion)`, `borrarPartida(id)`, igual que `api/blackjack.js` pero con `BASE = '/api/rustlike/games'`)
- Create: `frontend/src/games/Rustlike.jsx`, `frontend/src/games/Rustlike.test.jsx`, `frontend/src/pages/JuegoRustlike.jsx`
- Modify: `frontend/src/App.jsx` (ruta `/juegos/rustlike`), `frontend/src/config.js` (`{ id: 'rustlike', nombre: 'Rust Like', lenguaje: 'Rust', color: 'oxido', ruta: '/juegos/rustlike' }`), `frontend/src/styles.css` (`--oxido: #c8642a`, las clases `--oxido` que usan las otras fichas y la paleta del Almacén como variables), `frontend/src/musica/pistas.js` (entrada `rustlike` en `PISTAS` y `FUENTES`; **hace falta el mp3 y su enlace, que pone el usuario**), `frontend/src/App.test.jsx` (añadir `'rustlike'` a los `test.each` de las líneas 86 y 99)
- Modify: `docs/frontend-y-gateway.md` §2 (estructura, pantallas y controles)

**Interfaces:**
- Consumes: el estado del contrato que produce la Tarea 4 (`board`, `data.player`, `data.visible`, `data.allowedActions`, `data.log`, `data.floor`, `data.turn`, `data.zone`).

Decisiones:
- Componentes de la §13.1 que tienen sentido en esta fase: `<Board>` (un `<svg role="img" aria-label="Piso N">` con `viewBox` de `width*16 × height*16`), `<Tile>` (un `<rect>` por casilla con `React.memo`, clase según el tipo y `--niebla` si se vio pero no es visible), `<Robot>` (un grupo de rect y círculos en `data.player`) y `<Hud>` (piso, zona, turno y las últimas 5 líneas del log). `"unknown"` no se dibuja.
- Teclado en `window`, con `preventDefault`: flechas y WASD para las 4 direcciones; Q, E, Z y C para `up_left`, `up_right`, `down_left` y `down_right`; espacio o `.` para esperar; Enter o `>` para bajar. Botón «Bajar» visible solo si `allowedActions` incluye `"descend"`, y botón «Nueva partida».
- **Mientras haya una petición en curso se ignoran las teclas**, y un contador descarta respuestas viejas, como en los otros juegos.
- Un 422 se muestra como mensaje sin borrar el tablero. Al desmontar se llama a `borrarPartida`.

- [ ] **Step 1: Escribir `Rustlike.test.jsx`** con el `fetch` falso de `Blackjack.test.jsx` y un estado de 3×3 (`board` con `"wall"`, `"floor"`, `"stairs"` y `"unknown"`):

```js
test('crea la partida al entrar y dibuja el piso')          // POST /api/rustlike/games; aparece role img con nombre «Piso 1»;
                                                            // el Hud muestra el puntaje de data.score
test('las flechas y WASD envían movimientos')               // ArrowRight → {action:{type:'move',dir:'right'}}; 'w' → dir 'up'
test('Q, E, Z y C envían las diagonales')                   // 'q' → up_left, 'c' → down_right
test('espacio espera y Enter baja')                         // {type:'wait'}, {type:'descend'}
test('el botón Bajar solo aparece con descend permitido')
test('ignora teclas mientras espera la respuesta')          // dos ArrowRight sin resolver la primera → 1 sola llamada a /move
test('un 422 muestra el mensaje y conserva el tablero')     // respuesta {error:'INVALID_MOVE', message:'Un muro bloquea el paso.'}
test('las casillas unknown no se dibujan')                  // número de <rect> de casilla == casillas conocidas
test('borra la partida al salir')                           // unmount → DELETE /api/rustlike/games/abc
```

- [ ] **Step 2: Ejecutar `cd frontend && npx vitest run src/games/Rustlike.test.jsx`** — Expected: FAIL (no existe el componente).
- [ ] **Step 3: Implementar `api/rustlike.js`, `Rustlike.jsx` y `JuegoRustlike.jsx`** (`<Pagina titulo="Rust Like" volverAJuegos musica="rustlike">`).
- [ ] **Step 4: Registrar el juego en `App.jsx`, `config.js`, `styles.css`, `pistas.js` y `App.test.jsx`.**
- [ ] **Step 5: Ejecutar `npm test`** — Expected: toda la suite PASS, incluidas `pistas.test.js` (necesita `public/musica/rustlike.mp3`) y `App.test.jsx`.
- [ ] **Step 6: Verificar en el navegador** con `docker compose up --build --no-deps frontend gateway rustlike-service`, en `http://localhost:5173/juegos/rustlike`: moverse, ver la niebla, chocar contra un muro (mensaje sin perder el tablero), encontrar la escalera y bajar al piso 2. Comprobar que las 7 fichas de `/juegos` y de la portada se ven bien.
- [ ] **Step 7: Actualizar `docs/frontend-y-gateway.md`.**
- [ ] **Step 8: Commit** — `git commit -m "feat(Frontend): pantalla jugable de Rust Like (fase 1)"`
