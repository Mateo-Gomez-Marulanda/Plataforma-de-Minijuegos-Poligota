# Rust Like — Fases 2 (Corrosión) y 3 (Combate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El robot se oxida por piezas (piernas, brazos, sensores y núcleo), con efectos reales en el movimiento y la visión; pierde la partida cuando el núcleo llega a 100. Además combate contra ácaros y drones, y recoge y usa latas de aceite.

**Architecture:** Toda la regla nueva vive en `services/rustlike-rust/src/logic/`, en módulos puros nuevos (`corrosion.rs`, `entities.rs`, `spawn.rs`, `pathfinding.rs`, `ai.rs`, `combat.rs`) que `logic/mod.rs` orquesta siguiendo el orden de turno de la §6.1 del diseño. El servidor solo cambia en `presenter.rs`, que añade piezas, objetos y entidades visibles. El frontend dibuja lo nuevo y envía las acciones nuevas.

**Tech Stack:** el mismo de la fase 1: Rust 1.99 con axum 0.8, tokio, serde, serde_json y rand 0.10 (`RngExt`), y React 19 con Vitest.

**Spec:** `docs/rustlike-rust.md` (§3 corrosión, §4.1 pieza básica, §5 lata de aceite, §6 combate, §7.1 ácaro y dron, §8.3 charco, §12 contrato, §15 fases 2 y 3) y `docs/arquitectura-minijuegos.md` §4 y §8. Se construye sobre la fase 1 (`docs/superpowers/plans/2026-11-04-rustlike-fase-1.md`), ya terminada en la rama `feat/rustlike-fase-1`.

## Global Constraints

- Todo el trabajo va en la rama `feat/rustlike-fase-1` (lo pidió el usuario). Sin push.
- Las mismas reglas que en la fase 1:
  - dependencias de ejecución: solo axum, tokio, serde, serde_json y rand;
  - toda la aleatoriedad de la partida pasa por `state.rng`;
  - se valida antes de mutar, así que una acción inválida no cambia nada, ni el turno ni el generador aleatorio;
  - el contrato común no admite nada fuera de `data`;
  - el cliente nunca recibe lo que no ve;
  - cada archivo lleva un comentario de cabecera en español y cada función interna un comentario corto;
  - los identificadores van en inglés.
- La tabla de estados de la §3.2 se copia literal:

  | Corrosión | id | Fallo de piernas | Multiplicador de brazos | Radio de visión |
  |---|---|---|---|---|
  | 0–24 | `optimal` | 0.0 | 1.0 | 8 |
  | 25–49 | `light` | 0.10 | 0.75 | 6 |
  | 50–74 | `severe` | 0.25 | 0.50 | 4 |
  | 75–99 | `critical` | 0.50 | 0.25 | 2 |
  | 100 | `blocked` | 0.75 | 0.0 | 1 |

- Fuentes de corrosión:
  - núcleo +1 cada 10 turnos (`turn % 10 == 0`);
  - propagación: cada 5 turnos (`turn % 5 == 0`), cada pieza no núcleo en estado `critical` o `blocked` suma +1 al núcleo;
  - golpe enemigo en una pieza al azar entre piernas, brazos y sensores;
  - si esa pieza ya está a 100, la corrosión pasa al núcleo;
  - charco: piernas +3 al entrar en él.
- Corrosión recibida = `round(cantidad × resistencia de la pieza que la recibe)`, con un máximo de 100. Las piezas básicas tienen resistencia 1.0 y los brazos básicos daño base 10.
- **Charcos: entre 4 y 6 por piso** (decisión del usuario).
- Ácaro de óxido: integridad 15, golpe 6. Dron de limpieza: integridad 30, golpe 6. Los dos tienen velocidad normal.
- Lata de aceite: −30 a la pieza que elija el jugador, con un mínimo de 0. Hay 3 espacios de objetos.
- Puntaje: destruir un enemigo suma `score::points_for_floor(floor)`, la regla del usuario ya implementada.
- Daño del jugador = `round(10 × multiplicador de brazos)`. Los ataques siempre aciertan.
- Mensajes al jugador en español, con los textos exactos que fija cada tarea.

## Rulings de diseño que el plan fija (lo que el diseño deja abierto)

- **Escalado por piso** (la §17 lo deja pendiente): `scaled(base, floor) = base + base * ((floor - 1) / 10) / 10` con enteros, es decir, +10 % cada 10 pisos completos. Se aplica a la integridad y al golpe.
- **Las piernas solo se traban al desplazarse** a una casilla libre. Atacar es trabajo de los brazos, así que no tira el dado de piernas.
- **Detección:** el ácaro persigue si está a distancia de Chebyshev ≤ 8. El dron patrulla vagando al azar hasta que su casilla entra en el campo de visión del jugador (`state.visible`); desde entonces queda despierto para siempre y persigue. Usar la visión del jugador evita la asimetría del shadowcasting que señaló la revisión final.
- **Al bajar de piso**, los enemigos del piso nuevo no actúan ese turno, pero la fase de entorno sí corre.
- El núcleo no cuenta para su propia propagación.

## Review Focus

- **Muerte a mitad de turno:** si un golpe enemigo lleva el núcleo a 100, la partida pasa a `lost` en ese mismo turno, los demás enemigos ya no hacen nada que importe y cualquier acción posterior da 422 «La partida ha terminado.» (Tarea 5).
- **Ataque contra un enemigo que no se ve:** con los sensores bloqueados (radio 1), moverse hacia un enemigo adyacente sigue atacándolo y nunca lo atraviesa (Tarea 5).
- **Fugas de información:** `data.entities` solo trae entidades en casillas que están en `state.visible` en ese momento; un enemigo recordado pero fuera de la vista no aparece (Tarea 5).
- **Recoger con los 3 espacios llenos:** 422 sin cambiar nada; la lata sigue en el suelo (Tarea 5).
- **Enemigos que se apilan o pisan al jugador:** dos enemigos nunca comparten casilla ni ocupan la del robot, y los objetos en el suelo no bloquean a nadie (Tareas 4 y 5).

---

### Task 1: Módulo de corrosión

**Files:**
- Create: `services/rustlike-rust/src/logic/corrosion.rs` (`pub mod corrosion;` en `logic/mod.rs`)

**Interfaces (Produces):**
- `#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)] #[serde(rename_all = "snake_case")] pub enum Slot { Legs, Arms, Sensors, Core }` con `pub fn id(self) -> &'static str` (`"legs"`…) y `pub fn name(self) -> &'static str` (`"Piernas"`, `"Brazos"`, `"Sensores"`, `"Núcleo"`). `pub const HIT_SLOTS: [Slot; 3] = [Legs, Arms, Sensors]`.
- `pub enum Condition { Optimal, Light, Severe, Critical, Blocked }` con `pub fn from_corrosion(c: u8) -> Condition`, `id()`, `legs_fail_chance(self) -> f64`, `arms_multiplier(self) -> f64` y `vision_radius(self) -> i32`, con los valores de la tabla de Global Constraints.
- `pub enum PartModel { Basic }` con `id()` → `"basic"`, `resistance(self) -> f64` → 1.0, y `arms_base_damage(self) -> u32` → 10. Es un `enum` con una sola variante a propósito: la fase 4 añade las demás.
- `#[derive(Clone, Copy, Debug, PartialEq, Eq)] pub struct Part { pub model: PartModel, pub corrosion: u8 }` con `pub fn condition(&self) -> Condition`.
- `#[derive(Clone, Debug, PartialEq, Eq)] pub struct Body { pub legs: Part, pub arms: Part, pub sensors: Part, pub core: Part }` con `pub fn new() -> Body` (todas `Basic` a 0, más `impl Default`), `pub fn part(&self, Slot) -> &Part` y `pub fn part_mut(&mut self, Slot) -> &mut Part`.
- `pub struct Corroded { pub slot: Slot, pub amount: u8, pub blocked_now: bool, pub transferred: bool }`, el resultado de aplicar corrosión.
- `pub fn corrode(body: &mut Body, slot: Slot, base: u32) -> Option<Corroded>`. Si `slot` no es `Core` y la pieza ya está a 100, aplica `base` al núcleo con la resistencia del núcleo y marca `transferred = true`. La cantidad es `round(base × resistencia)` y el resultado se recorta a 100. Devuelve `None` si la cantidad redondeada es 0 o la pieza destino ya estaba a 100. `blocked_now` es true si la pieza llega a 100 en esta llamada.
- `pub fn repair(part: &mut Part, amount: u8) -> u8`: resta con mínimo 0 y devuelve lo que restó de verdad.

- [ ] **Step 1: Pruebas** (`#[cfg(test)]` en corrosion.rs): `condition_thresholds` (0, 24, 25, 49, 50, 74, 75, 99 y 100 dan su estado), `table_values` (los cuatro métodos con los cinco estados, valores de la tabla), `corrode_applies_and_caps` (90 + 15 → 100, `blocked_now`), `blocked_part_transfers_to_core` (piernas a 100, `corrode(Legs, 6)` → núcleo +6, `transferred`, piernas siguen en 100), `full_core_returns_none`, `repair_floors_at_zero` (10 − 30 → 0, devuelve 10).
- [ ] **Step 2:** `cargo test corrosion` → FAIL (falta el módulo).
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `cargo test` y `cargo clippy --all-targets -- -D warnings` → PASS.
- [ ] **Step 5: Commit** `feat(rustlike): piezas, estados y reglas de corrosión`

---

### Task 2: Charcos en el generador

**Files:**
- Modify: `services/rustlike-rust/src/logic/map/mod.rs` (`Tile::Puddle`, id `"puddle"`, transitable, no bloquea la luz) y `services/rustlike-rust/src/logic/map/generator.rs`

**Interfaces:** `Tile::Puddle`. `Map::is_walkable` lo acepta. `fov.rs` sigue bloqueando la luz solo con `Wall` (comprobarlo).

- [ ] **Step 1: Pruebas en generator.rs:**
  - `puddles_per_floor`: para seeds 0..100 en el piso 1, hay entre 4 y 6 `Puddle`;
  - `puddles_avoid_start_and_stairs`: nunca hay un charco en `start` ni en `stairs`;
  - `puddles_are_inside_rooms`: cada charco está dentro del rectángulo de alguna `room`;
  - las pruebas de alcanzabilidad y de determinismo de la fase 1 siguen pasando sin tocarlas (el BFS de la prueba debe aceptar `Puddle`).
- [ ] **Step 2:** `cargo test generator` → FAIL.
- [ ] **Step 3:** Implementar. **Después** de colocar la escalera, `count = rng.random_range(4..=6)`. Se eligen casillas `Floor` al azar dentro de habitaciones al azar, sin repetir y sin tocar `start` ni `stairs`, con un máximo de 200 intentos. En el piso 255 se aplica la misma regla.
- [ ] **Step 4:** `cargo test` y `clippy` → PASS.
- [ ] **Step 5: Commit** `feat(rustlike): charcos en el Almacén (4 a 6 por piso)`

---

### Task 3: La corrosión en el turno

**Files:**
- Modify: `services/rustlike-rust/src/logic/state.rs` (`pub body: Body`), `logic/action.rs` (eventos nuevos), `logic/mod.rs` (orden del turno), `services/rustlike-rust/src/presenter.rs` y `services/rustlike-rust/tests/api.rs`

**Interfaces:**
- Consumes: Tarea 1 y `Tile::Puddle`.
- Produces:
  - Eventos nuevos en `Event`, con sus ids: `PlayerStuck` (`player_stuck`), `PartDegraded` (`part_degraded`), `PartBlocked` (`part_blocked`), `GameOver` (`game_over`).
  - En `mod.rs`: la función privada `fn apply_corrosion(state: &mut GameState, slot: Slot, base: u32, events: &mut Vec<Event>)`, que envuelve `corrode`, anota en el log, emite los eventos y comprueba el núcleo. **Las Tareas 5 la reutilizan para los golpes enemigos.**
  - También `fn end_turn(state: &mut GameState, events: &mut Vec<Event>)`, que hace la fase de entorno y la comprobación.
- `VISION_RADIUS` desaparece: el radio es `state.body.sensors.condition().vision_radius()`.

Reglas del turno (sin enemigos todavía):
1. `Move`:
   - si el destino es un muro → Err, como en la fase 1;
   - si el destino está libre → `rng.random_bool(legs_fail_chance)`, **solo si la probabilidad es > 0**;
   - si se traba → `PlayerStuck` y el log «Tus piernas se traban. Pierdes el turno.», el robot no se mueve pero el turno pasa;
   - si no se traba → el robot se mueve; si el destino es `Puddle`, `apply_corrosion(Legs, 3)` con el log «Pisas un charco.».
2. `Wait` y `Descend` como en la fase 1.
3. Con todo turno consumido: `turn += 1`, después `end_turn`, que hace:
   - si `turn % 10 == 0`, núcleo +1;
   - si `turn % 5 == 0`, núcleo +1 por cada pieza de `HIT_SLOTS` en `critical`/`blocked`;
   - recalcula la visión con el radio de los sensores.

Log de `apply_corrosion`:
- `"{Nombre} +{n}."`, por ejemplo «Piernas +3.»;
- si hubo transferencia: `"{Nombre de la pieza golpeada} ya está bloqueada: el óxido pasa al núcleo. Núcleo +{n}."`;
- si `blocked_now`: añade «{Nombre} bloqueadas por el óxido.» (sensores y piernas en plural tal cual; el núcleo nunca llega aquí porque termina la partida).

La corrosión pasiva del núcleo no escribe en el log, pero sí emite `PartDegraded`.

Si el núcleo llega a 100: `status = Lost`, `GameOver` y el log «Tu núcleo se ha oxidado por completo. Fin de la partida.».

Presenter: `data.parts = { legs: {name, corrosion, condition}, arms, sensors, core }`.

- [ ] **Step 1: Pruebas** (en `logic/mod.rs`, ajustando con `state.body.part_mut(..).corrosion = ..`):
  - `passive_core_every_10_turns`: 10 esperas → núcleo 1;
  - `propagation_every_5_turns`: piernas a 80, 5 esperas → núcleo 1 (propagación del turno 5), y tras 10 esperas → núcleo 3 (en el turno 10 se suman el pasivo y la propagación);
  - `stuck_legs_lose_turn`: piernas a 100; buscar una semilla en la que la siguiente tirada falle; turno +1, posición igual, evento `PlayerStuck`;
  - `optimal_legs_never_roll`: dos partidas con la misma semilla; mover con piernas óptimas no consume el generador (el siguiente piso generado es idéntico);
  - `puddle_corrodes_legs`: `map.set` un charco al lado y moverse sobre él → piernas 3, eventos `[PlayerMoved, PartDegraded]`;
  - `sensors_shrink_vision`: sensores a 75 → ninguna casilla visible a más de 2;
  - `core_at_100_loses`: núcleo a 99, esperar hasta el turno 10 → `Lost`, `GameOver` en los eventos, y la acción siguiente da Err «La partida ha terminado.»;
  - `invalid_move_does_not_roll`: con las piernas a 100, chocar con un muro da Err y no cambia ni el turno ni el generador.

  En `tests/api.rs`, `parts_in_contract`: `data.parts.legs` vale `{name:"basic", corrosion:0, condition:"optimal"}` y las cuatro claves existen.
- [ ] **Step 2:** `cargo test` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `cargo test` y `clippy` → PASS.
- [ ] **Step 5: Commit** `feat(rustlike): corrosión por turno, charcos, piernas trabadas y derrota`

---

### Task 4: Entidades, aparición y búsqueda de caminos

**Files:**
- Create: `services/rustlike-rust/src/logic/entities.rs`, `logic/spawn.rs` y `logic/pathfinding.rs` (con sus `pub mod`)

**Interfaces (Produces):**
- `entities.rs`:
  - `pub enum EnemyKind { RustMite, Drone }` con `id()` (`"rust_mite"`, `"drone"`), `name()` (`"el ácaro de óxido"`, `"el dron de limpieza"`), `bite()` (`"te muerde"`, `"te golpea"`), `base_integrity()` (15 y 30) y `base_hit()` (6 y 6);
  - `pub fn scaled(base: u32, floor: u8) -> u32` con la fórmula del ruling;
  - `pub enum ItemKind { OilCan }` con `id()` → `"oil_can"` y `name()` → `"una lata de aceite"`;
  - `pub struct Enemy { pub kind: EnemyKind, pub integrity: u32, pub max_integrity: u32, pub hit: u32, pub awake: bool }` con `pub fn new(kind, floor) -> Enemy` (ya escalado; `awake = false`);
  - `pub enum EntityKind { Enemy(Enemy), Item(ItemKind) }`;
  - `pub struct Entity { pub id: u32, pub pos: Pos, pub kind: EntityKind }`.
- `spawn.rs`: `pub fn populate(floor: u8, level: &Level, rng: &mut StdRng, next_id: &mut u32) -> Vec<Entity>`. Nunca en `rooms[0]` (la sala de inicio), solo en casillas `Floor`, nunca dos entidades en la misma casilla y nunca en la escalera. Cantidades:
  - grupos de ácaros: `1 + floor / 20`, con un máximo de 4; cada grupo trae `rng.random_range(2..=3)` ácaros alrededor del centro de una sala al azar;
  - drones: `rng.random_range(1..=2)`;
  - latas de aceite: `rng.random_range(1..=2)`.

  En el piso 255 devuelve un vector vacío.
- `pathfinding.rs`: `pub fn next_step(map: &Map, from: Pos, to: Pos, blocked: impl Fn(Pos) -> bool, max_depth: u32) -> Option<Pos>`. Es un BFS en 8 direcciones sobre casillas transitables que no cumplen `blocked` (la meta `to` se permite aunque esté ocupada). Devuelve la primera casilla del camino más corto, o `None` si no hay camino dentro de `max_depth`.

- [ ] **Step 1: Pruebas:**
  - `scaled_values`: `scaled(15, 1) == 15`, `scaled(15, 11) == 16`, `scaled(30, 21) == 36`, `scaled(6, 50) == 8`;
  - `enemy_new_uses_scaling`;
  - `populate_respects_rules`: 100 semillas; ninguna entidad en `rooms[0]`, ni en la escalera, ni en una casilla que no sea `Floor`, ni repetida; ids únicos y crecientes;
  - `populate_counts`: en el piso 1 hay entre 2 y 3 ácaros, entre 1 y 2 drones y entre 1 y 2 latas; en el piso 60, entre 8 y 12 ácaros;
  - `next_step_goes_around_wall`;
  - `next_step_respects_blocked`;
  - `next_step_none_when_unreachable`;
  - `next_step_depth_limit`.
- [ ] **Step 2:** `cargo test` → FAIL. **Step 3:** Implementar. **Step 4:** `cargo test` y `clippy` → PASS.
- [ ] **Step 5: Commit** `feat(rustlike): enemigos, objetos, aparición por piso y BFS`

---

### Task 5: Combate, IA y objetos en el turno

**Files:**
- Create: `services/rustlike-rust/src/logic/combat.rs` y `logic/ai.rs`
- Modify:
  - `logic/action.rs`: `Action::Pick` y `Action::Use { slot: u8, target: Option<Slot> }`, más los eventos `EnemyHit` (`enemy_hit`), `EnemyDestroyed` (`enemy_destroyed`), `PlayerHit` (`player_hit`), `ItemPicked` (`item_picked`) y `ItemUsed` (`item_used`);
  - `logic/state.rs`: `pub entities: Vec<Entity>`, `pub next_id: u32` y `pub items: [Option<ItemKind>; 3]`, más `allowed_actions`, que añade `"pick"` si hay un objeto bajo el robot y un espacio libre, y `"use"` si lleva algún objeto;
  - `logic/mod.rs`: `populate` en `new_game` y en `descend`, y el orden de turno completo;
  - `src/presenter.rs`, `tests/api.rs` y `docs/rustlike-rust.md`.

**Interfaces:**
- `combat.rs`:
  - `pub fn player_damage(body: &Body) -> u32` = `round(arms_base_damage × arms_multiplier)`;
  - `pub fn enemy_at(entities: &[Entity], pos: Pos) -> Option<usize>`;
  - `pub fn item_at(entities: &[Entity], pos: Pos) -> Option<usize>`.
- `ai.rs`: `pub fn enemy_turns(state: &mut GameState, events: &mut Vec<Event>)` recorre los enemigos por id ascendente y para cada uno:
  - si la partida ya está perdida, para;
  - si está adyacente (Chebyshev 1), ataca;
  - si no, decide si persigue:
    - un ácaro persigue si está a distancia ≤ 8;
    - un dron persigue si está despierto; se despierta si su casilla está en `state.visible`, y eso se comprueba al empezar su turno;
  - si persigue, `next_step` hacia el robot con `max_depth` 20, tratando como bloqueadas las casillas de otros enemigos y la del robot;
  - si no, vaga: una dirección al azar con `random_range(0..8)` y se mueve si la casilla es transitable y está libre.

  Al atacar se elige la pieza con `HIT_SLOTS[rng.random_range(0..3)]` y se llama a `apply_corrosion` de la Tarea 3 (hay que hacerla `pub(crate)`), con el evento `PlayerHit`. El log antepone `"{Name capitalizado} {bite}. "` al texto de la corrosión, por ejemplo «El ácaro de óxido te muerde. Sensores +6.».

Orden del turno (§6.1):
1. Acción del jugador.
2. Si se consumió el turno y la acción no fue `Descend`, actúan los enemigos.
3. `end_turn`.

Acciones:
- `Move` hacia una casilla con enemigo: ataque. No tira el dado de piernas y funciona aunque la casilla no sea visible.
  - Se calcula `dmg = player_damage`.
  - Si `dmg == 0`: el log «Tus brazos bloqueados no hacen daño.» y el turno pasa.
  - Si no: se resta `dmg` a la integridad, con un mínimo de 0, más `EnemyHit` y el log «Golpeas a {name} (−{dmg}).».
  - Si la integridad llega a 0: se quita la entidad, `score += points_for_floor(floor)`, `EnemyDestroyed` y el log «Destruyes a {name}. +{p} puntos.».
- `Move` a una casilla libre con un objeto: el robot se mueve; el objeto no bloquea.
- `Pick`:
  - sin objeto bajo el robot → Err «No hay ningún objeto aquí.»;
  - con los 3 espacios llenos → Err «No tienes espacio: los 3 espacios están llenos.»;
  - si se puede: el objeto va al primer espacio libre y se quita del suelo, con `ItemPicked` y el log «Recoges {name}.». Consume turno.
- `Use`:
  - `slot > 2` → Err «Ese espacio no existe.»;
  - espacio vacío → Err «Ese espacio está vacío.»;
  - lata de aceite sin `target` → Err «Indica qué pieza quieres aceitar.»;
  - si se puede: `repair(part, 30)`, se vacía el espacio, `ItemUsed` y el log «Aceitas {nombre en minúsculas}. {Nombre} −{n}.» (por ejemplo «Aceitas piernas. Piernas −30.»). Consume turno.
- Al bajar, `populate` usa `state.rng` **después** de `generate`.

Presenter:
- `data.entities` trae solo las entidades en casillas visibles:
  - enemigos: `{id, kind, x, y, elite: null, integrity, maxIntegrity}`;
  - objetos: `{id, kind, x, y}`.
- `data.items` es un array de 3 posiciones con el id de cada objeto o `null`.

Docs: en la §17 de `docs/rustlike-rust.md` se marca como decidido el escalado por piso (con la fórmula), y en la §6/§7 se anotan la regla de piernas, que solo se traban al desplazarse, y la de detección de ácaro y dron.

- [ ] **Step 1: Pruebas** (`logic/mod.rs`, colocando entidades a mano con `state.entities.clear()` + `push`):
  - `bump_attacks_and_destroys`: un ácaro con integridad 15 al lado; dos ataques (10 + 10) → destruido, `score` 20 y eventos `EnemyHit` + `EnemyDestroyed`;
  - `blocked_arms_do_no_damage`;
  - `attack_ignores_legs_and_visibility`: piernas a 100 y sensores a 100; el ataque golpea siempre;
  - `enemy_adjacent_hits_random_part`: después de esperar, alguna pieza de `HIT_SLOTS` tiene `corrosion == 6` y aparece `PlayerHit`;
  - `blocked_part_hit_goes_to_core`: las tres piezas de `HIT_SLOTS` a 100 y un ácaro adyacente; esperar → núcleo +6;
  - `death_mid_turn_stops_play`: las tres piezas de `HIT_SLOTS` a 100, núcleo a 94 y dos ácaros adyacentes; esperar → el primer golpe lleva el núcleo a 100, `Lost`, `GameOver` y **un solo** `PlayerHit` (el segundo ácaro ya no actúa);
  - `mite_chases_within_8`;
  - `drone_wanders_until_seen_then_chases`;
  - `enemies_never_stack_or_enter_player`: 200 turnos con 6 enemigos y el robot esperando; nunca hay dos en la misma casilla ni uno en la del robot;
  - `pick_and_full_slots`: con `items = [Some, Some, Some]` → Err y la lata sigue en `entities`;
  - `use_oil_can_rules`: los tres errores y el caso válido (piernas 50 → 20, espacio vacío después);
  - `descend_populates_new_floor`: tras bajar hay enemigos y ninguno en `rooms[0]`;
  - `same_seed_same_game` (el de la fase 1) sigue pasando, ampliado para comparar `entities` (ids, posiciones y tipos).

  En `tests/api.rs`:
  - `entities_only_visible`: toda entidad de `data.entities` está en una casilla con `data.visible[y][x] == true`;
  - `items_and_actions_contract`: `data.items == [null, null, null]` y la acción `{"type":"use","slot":0,"target":"legs"}` sobre un espacio vacío → 422 INVALID_MOVE «Ese espacio está vacío.»;
  - `bad_use_bodies`: `{"type":"use"}` y `{"type":"use","slot":0,"target":"tail"}` → 422 INVALID_REQUEST.
- [ ] **Step 2:** `cargo test` → FAIL. **Step 3:** Implementar. **Step 4:** `cargo test` y `clippy` → PASS.
- [ ] **Step 5:** Docs.
- [ ] **Step 6: Commit** `feat(rustlike): combate con ácaros y drones, IA y latas de aceite`

---

### Task 6: Frontend de corrosión y combate

**Files:**
- Modify: `frontend/src/games/Rustlike.jsx`, `frontend/src/games/Rustlike.test.jsx`, `frontend/src/styles.css` y `docs/frontend-y-gateway.md` §2 (controles)

**Interfaces (Consumes):**
- `data.parts`, `data.items`, `data.entities` (con `kind` `rust_mite`, `drone` u `oil_can` e `integrity`/`maxIntegrity` en los enemigos);
- `allowedActions` (`pick`, `use`) y `status` `"lost"`;
- el tile `"puddle"`;
- las acciones `{type:'pick'}` y `{type:'use', slot, target}`.

Decisiones:
- **Casilla `puddle`:** azul, con una animación suave de opacidad hecha con CSS (§13.2).
- **Componentes SVG nuevos dentro del `<svg>`, dibujados entre las casillas y el robot:**
  - `<Mite>`: un círculo pequeño con 4 patitas;
  - `<Drone>`: un rombo;
  - `<OilCan>`: un rectángulo con tapa;
  - cada enemigo lleva una barra fina de integridad encima si está dañado.
- **`<Robot>`:** cada pieza es una forma separada (piernas abajo, cuerpo y núcleo en el centro, brazos a los lados y sensores arriba). El color sale del estado de la pieza mediante variables CSS: `--pieza-optimal: #9aa3ad`, `--pieza-light: #c89a6a`, `--pieza-severe: #c8642a`, `--pieza-critical: #8a4a24` y `--pieza-blocked: #5a3a24`.
- **`<Hud>`:**
  - cuatro filas de pieza, con el nombre en español, una barra de 0 a 100 y la etiqueta del estado («Óptimo», «Leve», «Grave», «Crítico», «Bloqueada»);
  - tres espacios de objeto con su nombre («Lata de aceite») y el botón «Usar»;
  - el botón «Recoger», visible solo si `allowedActions` incluye `pick`.
- **Usar la lata:** al pulsar «Usar», o la tecla 1, 2 o 3, aparece un selector con cuatro botones (Piernas, Brazos, Sensores, Núcleo) y «Cancelar». Al elegir una pieza se envía `{type:'use', slot, target}`. Esc o «Cancelar» lo cierran. Mientras está abierto, las teclas de movimiento no hacen nada.
- **Recoger:** la tecla G recoge.
- **Fin de la partida:** con `status === 'lost'`, una capa sobre el tablero muestra «Fin de la partida», «Llegaste al piso N» y «Puntaje: S», con el botón «Nueva partida». Las teclas del juego no envían nada.
- **Clic en botones:** los botones nuevos hacen `blur()` tras el clic, como los de la fase 1.

- [ ] **Step 1: Pruebas** en Rustlike.test.jsx (amplía el estado falso con `parts`, `items` y `entities`):
  - `muestra las cuatro piezas con su corrosión y estado`;
  - `dibuja los charcos`;
  - `dibuja ácaros, drones y latas visibles`, con un `data-kind` en cada grupo SVG para encontrarlos;
  - `G envía pick y el botón Recoger solo aparece con pick permitido`;
  - `usar la lata pide la pieza y envía use con target`: tecla 1 → clic en «Piernas» → `{type:'use', slot:0, target:'legs'}`;
  - `Esc cierra el selector sin enviar nada`;
  - `con el selector abierto las flechas no mueven`;
  - `al perder muestra el fin de partida y no envía teclas`;
  - `el color de cada pieza sigue su estado`, comprobando una clase o un atributo `data-condition` en cada forma del robot.
- [ ] **Step 2:** `npx vitest run src/games/Rustlike.test.jsx` → FAIL. **Step 3:** Implementar. **Step 4:** `npm test` (toda la suite) → PASS y `npm run build` → OK.
- [ ] **Step 5:** Verificar contra el servicio real. Levantar `docker compose up -d --build --no-deps frontend gateway rustlike-service`; crear una partida y hacer movimientos con `curl` a través de `localhost:5173/api/rustlike/...` hasta ver `data.entities` con un enemigo, y comprobar que `/juegos/rustlike` se sirve. Después, `docker compose stop` de esos tres servicios.
- [ ] **Step 6:** Actualizar los controles en `docs/frontend-y-gateway.md`.
- [ ] **Step 7: Commit** `feat(Frontend): corrosión, combate y objetos en Rust Like`
