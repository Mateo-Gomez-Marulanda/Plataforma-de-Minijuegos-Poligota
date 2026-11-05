# Rust Like — Fase 4 (Contenido del Almacén) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** completar el Almacén con:
- el resto de enemigos: torreta, robot oxidado y gotera;
- los consumibles que faltan: spray lubricante y grasa protectora;
- las piezas intercambiables con rasgo de la §4.1: oruga, resorte, taladro, magnéticos, largo alcance y térmicos.

**Architecture:** las reglas nuevas viven en `services/rustlike-rust/src/logic/`:
- modelos de pieza en `corrosion.rs`;
- tipos y aparición en `entities.rs` y `spawn.rs`;
- comportamiento en `ai.rs`;
- acciones y efectos en el turno en `mod.rs`, con un módulo nuevo `traits.rs` para los rasgos.

Además se toca:
- `presenter.rs` (JSON);
- `frontend/src/games/Rustlike.jsx`, que dibuja y envía lo nuevo.

**Tech Stack:** el mismo de las fases anteriores: Rust 1.99, axum 0.8, rand 0.10 (`RngExt`) y React 19 con Vitest.

**Spec:** `docs/rustlike-rust.md`:
- §3.3: la pieza bloqueada pasa el golpe al núcleo;
- §4.1: piezas iniciales y comunes;
- §5: consumibles;
- §7.1: enemigos base;
- §8.3: charcos;
- §9.4: piezas con rasgo en los pisos 11–30;
- §12.2–12.4: contrato.

También `docs/arquitectura-minijuegos.md` §4 y §8. Se construye sobre las fases 1–3 de la rama `feat/rustlike-fase-1`.

## Global Constraints

- Todo va en la rama `feat/rustlike-fase-1`, sin push.
- Siguen las reglas de las fases anteriores:
  - dependencias de ejecución: solo axum, tokio, serde, serde_json y rand;
  - toda la aleatoriedad pasa por `state.rng`;
  - se valida antes de mutar: una acción inválida no cambia nada, ni el turno ni el generador aleatorio;
  - nada fuera de `data` en el contrato;
  - el cliente nunca recibe lo que no ve, salvo lo que detectan los sensores térmicos (§12.3);
  - comentario de cabecera en español en cada archivo y un comentario corto en cada función interna;
  - identificadores en inglés;
  - mensajes al jugador en español, con los textos exactos que fija cada tarea.
- **Solo un agente escribe a la vez en la rama** (en la fase anterior, dos escritores en paralelo mezclaron commits).
- Piezas de la §4.1 (sin el núcleo reforzado, que es de la fase 5, porque solo lo sueltan los jefes):

  | Pieza | Hueco | id | Resistencia | Rasgo |
  |---|---|---|---|---|
  | Básicas | los 4 | `basic` | 1.0 | — (brazos: daño base 10) |
  | De oruga | piernas | `tracked` | 0.5 | Los charcos no las oxidan |
  | De resorte | piernas | `spring` | 1.5 | Salto automático de 2 casillas cada 10 turnos |
  | Con taladro | brazos | `drill` | 1.2 | Daño base 15 |
  | Magnéticos | brazos | `magnetic` | 1.0 | Daño base 10; atraen objetos a 3 casillas |
  | De largo alcance | sensores | `long_range` | 1.3 | +3 al radio de visión |
  | Térmicos | sensores | `thermal` | 1.0 | Detectan enemigos a través de las paredes |

- Enemigos de la §7.1, con el escalado por piso ya existente (`entities::scaled`):

  | Enemigo | id | Integridad | Golpe | Velocidad |
  |---|---|---|---|---|
  | Torreta | `turret` | 25 | 5 | Inmóvil |
  | Robot oxidado | `rusty_robot` | 60 | 10 | Lenta |
  | Gotera | `leak` | indestructible | — | Inmóvil |

- Consumibles de la §5: spray lubricante (`lubricant_spray`): −10 a las cuatro piezas. Grasa protectora (`protective_grease`): inmunidad a toda corrosión durante 10 turnos.

## Rulings de diseño (lo que el diseño deja abierto)

- **Decisiones del usuario:**
  - las piezas con rasgo aparecen **desde el piso 11**; en los pisos 1–10 solo salen piezas básicas usadas;
  - el resorte salta **automáticamente al moverse** cuando está cargado.
- **Una pieza bloqueada (100) pierde su rasgo pero conserva su resistencia.** Así:
  - unos sensores de largo alcance bloqueados tienen radio 1;
  - un resorte bloqueado no salta;
  - unos brazos magnéticos bloqueados no atraen nada;
  - unos térmicos bloqueados no detectan.

  Excepción: la oruga sigue protegiendo de los charcos porque es una protección física.
- **Salto del resorte:** se produce con un `Move` a una casilla libre si se cumple todo esto:
  - las piernas son `spring` y no están bloqueadas;
  - `jump_cooldown == 0`;
  - la casilla siguiente en la misma dirección es transitable, sin enemigo y sin el robot.

  El robot avanza 2 casillas. Solo cuenta el charco de la casilla de llegada. `jump_cooldown` pasa a 10 y baja en 1 en cada turno consumido. Las piernas se tiran una sola vez, antes del salto. Si la segunda casilla no sirve, el movimiento es normal (1 casilla) y no gasta la carga.
- **Cambiar pieza** (`{type:"swap"}`, §12.2): el robot tiene que estar sobre una entidad pieza. Toma su modelo y su corrosión, y deja en el suelo su pieza de ese hueco con su corrosión. Consume turno. El núcleo no se cambia en esta fase.
- **Piezas en el suelo por piso:** `rng.random_range(1..=2)`. El hueco se elige al azar entre `HIT_SLOTS` y la corrosión es `random_range(10..=60)`.
  - Pisos < 11: modelo `basic`.
  - Pisos ≥ 11: con `random_bool(0.5)` sale `basic`; si no, uno de los dos modelos de rasgo de ese hueco, al azar.
- **Robot oxidado:**
  - aparece desde el piso 3, `random_range(0..=1)`;
  - es lento: actúa en turnos alternos (`Enemy.rested` va alternando);
  - persigue como el ácaro (distancia ≤ 8) y ataca al estar adyacente;
  - al destruirse suelta en su casilla una pieza con las reglas anteriores, pero con corrosión `random_range(30..=70)`.
- **Torreta:**
  - aparece desde el piso 2: `random_range(0..=1)` y, desde el piso 15, `random_range(1..=2)`;
  - es inmóvil;
  - en su turno dispara si el robot está en una de las 8 líneas rectas a ≤ 5 casillas y todas las casillas intermedias son transitables y sin enemigos. Si está adyacente, también dispara;
  - log del disparo: «La torreta te dispara. » + el texto de la corrosión.
- **Gotera:**
  - `random_range(1..=2)` por piso desde el piso 1, sobre `Floor` y fuera de la sala inicial;
  - es inmóvil, no ataca y bloquea el paso;
  - moverse hacia ella → 422 INVALID_MOVE «La gotera es indestructible.», sin gastar turno;
  - en la fase de entorno, cuando `turn % 6 == 0`, cada gotera convierte en charco una casilla `Floor` vecina al azar (de sus 8 vecinas, nunca la escalera); si no hay ninguna, no hace nada.
- **Spray y grasa:**
  - `random_range(0..=1)` de cada uno por piso;
  - las latas siguen siendo 2–4;
  - `Use` sin `target` para ambos; si se envía un `target`, se ignora;
  - spray con las cuatro piezas a 0 → 422 «Ninguna pieza tiene óxido.»;
  - la grasa fija `grease_turns = 10` (y si ya estaba activa, lo reinicia a 10). Mientras `grease_turns > 0` no se aplica corrosión de ninguna fuente: golpes, charcos, pasiva ni propagación. `grease_turns` baja en 1 en cada turno consumido.
- **Imán:** al final de cada turno consumido, con los brazos `magnetic` sin bloquear, cada objeto o pieza del suelo a Chebyshev ≤ 3 del robot y en una casilla visible avanza 1 casilla hacia el robot con `next_step`. Los objetos no se bloquean entre sí ni los bloquean los enemigos; solo los muros. Puede acabar bajo el robot.
- **Térmicos:** con los sensores `thermal` sin bloquear, los **enemigos** a distancia euclídea ≤ radio de visión aparecen en `data.entities` aunque no estén en una casilla visible, marcados con `"detected": true`. Los drones siguen despertando solo con `state.visible`.

## Review Focus

- **Grasa a mitad de turno:** con la grasa activa, un golpe enemigo no oxida nada, pero el log sigue diciendo quién atacó; cuando la grasa llega a 0, la corrosión vuelve en el turno siguiente (Tarea 4).
- **Salto contra enemigos:** si hay un enemigo en la primera casilla, se ataca en lugar de saltar; si está en la segunda, no se salta y se avanza 1 (Tarea 4).
- **Cambiar en una casilla con objeto y pieza a la vez:** `pick` recoge el objeto y `swap` cambia la pieza; los dos coexisten sin perder nada (Tareas 2 y 4).
- **Fuga por los térmicos:** solo salen enemigos detectados; objetos y piezas tras una pared nunca, y las goteras sí, porque son enemigos (Tarea 4).
- **Gotera que encierra:** una gotera nunca se coloca en un pasillo de una casilla de ancho que corte el camino a la escalera (Tarea 2).

---

### Task 1: Modelos de pieza y rasgos

**Files:**
- Modify: `services/rustlike-rust/src/logic/corrosion.rs`

**Interfaces (Produces):**
- `PartModel { Basic, Tracked, Spring, Drill, Magnetic, LongRange, Thermal }` con:
  - `id()`, que da los de la tabla;
  - `resistance()`, con los valores de la tabla;
  - `fits(self, slot: Slot) -> bool`: `Basic` encaja en todos; cada rasgo solo en su hueco; ninguno de rasgo en `Core`;
  - `arms_base_damage()`: `Drill` 15 y el resto 10;
  - `pub const fn trait_models(slot: Slot) -> &'static [PartModel]`: piernas → `[Tracked, Spring]`, brazos → `[Drill, Magnetic]`, sensores → `[LongRange, Thermal]`, núcleo → `[]`.
- `pub fn part_label(slot: Slot, model: PartModel) -> &'static str`, con el nombre visible en español:
  - «Piernas básicas», «Brazos básicos», «Sensores básicos», «Núcleo básico»;
  - «Piernas de oruga», «Piernas de resorte»;
  - «Brazos con taladro», «Brazos magnéticos»;
  - «Sensores de largo alcance», «Sensores térmicos».
- `impl Part { pub fn has_trait(&self, model: PartModel) -> bool }`: true si `self.model == model` y la pieza no está bloqueada.
- `impl Body { pub fn vision_radius(&self) -> i32 }`: el radio del estado de los sensores, + 3 si `sensors.has_trait(LongRange)`.
- `corrode` no cambia de firma; ya aplica la resistencia del modelo.

- [ ] **Step 1: Pruebas:**
  - `resistances_match_table`;
  - `fits_rules`;
  - `drill_damage_15`;
  - `trait_models_per_slot`;
  - `labels`;
  - `blocked_part_loses_trait`;
  - `long_range_adds_3_unless_blocked` (sensores 0 → 11, 30 → 9, 100 → 1);
  - `tracked_halves_and_spring_increases` (`corrode(Legs, 6)` → oruga 3 y resorte 9).
- [ ] **Step 2:** `cargo test corrosion` → FAIL. **Step 3:** Implementar. **Step 4:** `cargo test` y `cargo clippy --all-targets -- -D warnings` → PASS. Sustituir en `mod.rs` las llamadas a `body.sensors.condition().vision_radius()` por `body.vision_radius()`.
- [ ] **Step 5: Commit** `feat(rustlike): piezas de oruga, resorte, taladro, magnéticas, largo alcance y térmicas`

---

### Task 2: Enemigos, consumibles y piezas en el suelo

**Files:**
- Modify: `services/rustlike-rust/src/logic/entities.rs` y `services/rustlike-rust/src/logic/spawn.rs`

**Interfaces (Produces):**
- `EnemyKind` añade `Turret`, `RustyRobot` y `Leak`, con:
  - `id()`, según la tabla;
  - `name()`: «la torreta», «el robot oxidado», «la gotera»;
  - `bite()`: torreta «te dispara», robot «te golpea», gotera «» (no ataca);
  - `base_integrity()` y `base_hit()`: la gotera 0 y 0;
  - `pub fn indestructible(self) -> bool`: solo `Leak`.
- `Enemy` añade `pub rested: bool`, inicialmente false.
- `ItemKind` añade `LubricantSpray` y `ProtectiveGrease`, con `id()` según la tabla y `name()`: «un spray lubricante», «una grasa protectora».
- `EntityKind` añade `Part { slot: Slot, part: Part }`.
- `spawn.rs`:
  - `pub fn random_part(floor: u8, rng: &mut StdRng, corrosion: RangeInclusive<u8>) -> (Slot, Part)`, con las reglas de los rulings;
  - `populate` añade las goteras, torretas, robots oxidados, piezas, sprays y grasas de los rulings, siempre después de lo que ya existe en el orden del generador aleatorio;
  - las mismas reglas de colocación que ya tiene: `Floor`, nunca `rooms[0]`, nunca repetida, nunca la escalera;
  - una gotera **no** se coloca en una casilla con menos de 3 vecinas transitables (así nunca tapa un pasillo de una casilla).

- [ ] **Step 1: Pruebas** en `spawn.rs` y `entities.rs`:
  - `new_enemy_stats`: la torreta 25/5 y el robot 60/10 en el piso 1, con escalado en el 21; la gotera es indestructible;
  - `random_part_before_11_is_basic`: 200 semillas en el piso 5;
  - `random_part_from_11_mixes`: en el piso 11, con 200 semillas, aparecen tanto `basic` como modelos de rasgo, y siempre se cumple `model.fits(slot)`;
  - `populate_phase4_counts`:
    - pisos 1, 2, 3 y 15;
    - goteras entre 1 y 2;
    - torretas 0 en el piso 1, entre 0 y 1 en el 2 y entre 1 y 2 en el 15;
    - robots oxidados 0 antes del piso 3;
    - piezas entre 1 y 2;
    - sprays y grasas ≤ 1;
  - `leak_never_blocks_path`: en 100 semillas sigue habiendo camino de `start` a `stairs` que evite las goteras (BFS de prueba);
  - `populate_respects_rules` (el que ya existe) sigue pasando con todas las entidades nuevas.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. Los `match` exhaustivos de `ai.rs`, `presenter.rs` y `mod.rs` que no compilen se resuelven con el comportamiento mínimo (la gotera no actúa y las piezas se ignoran), porque la Tarea 3 los completa. **Step 4:** `cargo test` y `clippy` → PASS.
- [ ] **Step 5: Commit** `feat(rustlike): torretas, robots oxidados, goteras, sprays, grasas y piezas en el suelo`

---

### Task 3: Comportamiento de los enemigos nuevos

**Files:**
- Modify: `services/rustlike-rust/src/logic/ai.rs`, `logic/mod.rs` (choque con la gotera, goteo en `end_turn`, pieza que suelta el robot oxidado), `src/presenter.rs` y `tests/api.rs`

**Reglas:** las de los rulings para la torreta, el robot oxidado y la gotera. Detalles:
- **Torreta:**
  - `pub(crate) fn clear_line(map, entities, from, to, max: i32) -> bool` en `ai.rs`: hay línea recta en una de las 8 direcciones, la distancia es ≤ max y las casillas intermedias son transitables y sin enemigos;
  - el golpe va a `HIT_SLOTS[rng.random_range(0..3)]`, como el resto.
- **Robot oxidado:** si `rested` es false, actúa y lo pone a true; si es true, lo pone a false y no hace nada. Al destruirlo, `attack` crea la entidad pieza con `random_part(floor, rng, 30..=70)` en su casilla (con un id nuevo) y añade al log «El robot oxidado suelta {etiqueta en minúsculas}.».
- **Gotera:**
  - no actúa en `enemy_turns`;
  - moverse hacia ella → Err «La gotera es indestructible.», validado antes de cualquier tirada;
  - el goteo va en `end_turn`, antes de la corrosión pasiva.
- **Presenter:**
  - las entidades nuevas usan sus `id()`;
  - la gotera manda `integrity: null` y `maxIntegrity: null`;
  - las piezas: `{id, kind: "part", slot, name: model.id(), corrosion, x, y}`;
  - los objetos nuevos: `{id, kind, x, y}`.

- [ ] **Step 1: Pruebas** (`logic/mod.rs`, con arenas a mano como las de la fase 3):
  - `turret_shoots_in_line_within_5`;
  - `turret_blocked_by_wall_or_enemy`;
  - `turret_never_moves`;
  - `rusty_robot_acts_every_other_turn`;
  - `rusty_robot_drops_part_on_death`: hay una entidad `Part` en su casilla y el log lo dice;
  - `leak_is_indestructible_and_costs_no_turn`;
  - `leak_drips_every_6_turns`: tras 6 esperas, una vecina pasa a `Puddle`; sin vecinas `Floor`, nada;
  - `same_seed_same_game` sigue pasando.

  En `tests/api.rs`, `phase4_entities_contract`: crear partidas con semillas hasta encontrar una gotera visible y comprobar `integrity == null`; y `part_entity_shape`, que con un estado construido en una prueba de lógica valide el JSON de una pieza.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** `cargo test` y `clippy` → PASS.
- [ ] **Step 5: Commit** `feat(rustlike): torreta que dispara en línea, robot oxidado lento y goteras`

---

### Task 4: Cambiar piezas, consumibles nuevos y rasgos en el turno

**Files:**
- Create: `services/rustlike-rust/src/logic/traits.rs` (salto, imán y detección térmica)
- Modify:
  - `logic/action.rs`: `Action::Swap` y los eventos `PartSwapped` (`part_swapped`) y `PlayerJumped` (`player_jumped`);
  - `logic/state.rs`: `pub jump_cooldown: u32`, `pub grease_turns: u32`, `allowed_actions` añade `"swap"` sobre una pieza, y `pub fn detected(&self, e: &Entity) -> bool`;
  - `logic/mod.rs`, `src/presenter.rs`, `tests/api.rs` y `docs/rustlike-rust.md`.

**Reglas** (las de los rulings), con estos textos exactos:
- **Swap:**
  - sin pieza → Err «No hay ninguna pieza aquí.»;
  - si se puede: log «Cambias tus {etiqueta propia en minúsculas} ({corrosión}) por {etiqueta nueva en minúsculas} ({corrosión}).» y evento `PartSwapped`.
- **Spray:** todas las piezas −10; log «Rocías el spray lubricante. Todas las piezas −10.»; evento `ItemUsed`.
- **Grasa:**
  - al usarla: log «Te untas grasa protectora: 10 turnos sin óxido.» y evento `ItemUsed`;
  - cada golpe con la grasa activa: prefijo + «La grasa protectora evita el óxido.», sin `PartDegraded`;
  - un charco con la grasa activa: no se oxida y no se escribe en el log.
- **Salto:** log «Saltas dos casillas con las piernas de resorte.» y evento `PlayerJumped` además de `PlayerMoved`.
- **Oruga:** sobre un charco no hay corrosión ni mensaje «Pisas un charco.».
- **Imán:** sin log ni evento; los objetos se mueven en `end_turn`, después del goteo.
- **Térmicos:** `state.detected(e)` es true si la entidad es un enemigo, `body.sensors.has_trait(Thermal)` y la distancia euclídea al cuadrado es ≤ `vision_radius()²`. El presenter incluye una entidad si `visible || detected` y añade `"detected": true` solo cuando no es visible.
- **Presenter:**
  - `data.parts[slot] = {name: model.id(), corrosion, condition}`, como ya era;
  - `data.effects = {grease: grease_turns, jumpCooldown: jump_cooldown o null si las piernas no son spring}`.
- **Docs:** en la §4 y la §5 de `docs/rustlike-rust.md`, anotar los rulings (aparición, pieza bloqueada sin rasgo, salto automático, imán, térmicos, cantidades), y en la §12 `swap`, `effects` y `detected`.

- [ ] **Step 1: Pruebas:**
  - `swap_exchanges_parts`;
  - `swap_without_part_fails`;
  - `pick_and_swap_coexist` (objeto y pieza en la misma casilla);
  - `spray_rules` (incluido el error con todo a 0);
  - `grease_blocks_all_corrosion_for_10_turns`: golpe, charco, pasiva y propagación; en el turno 11 vuelve;
  - `spring_jumps_when_charged`;
  - `spring_attacks_if_enemy_adjacent`;
  - `spring_moves_one_if_second_tile_blocked`, que no gasta la carga;
  - `spring_cooldown_10`;
  - `blocked_spring_never_jumps`;
  - `tracked_ignore_puddles`;
  - `magnetic_pulls_items_within_3`;
  - `thermal_detects_through_walls_only_enemies`;
  - `long_range_sees_further`.

  En `tests/api.rs`: `effects_contract` (`data.effects.grease == 0` y `jumpCooldown == null` al empezar) y `swap_bad_body` (`{"type":"swap"}` sin pieza → 422 INVALID_MOVE «No hay ninguna pieza aquí.»).
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** `cargo test` y `clippy` → PASS. **Step 5:** Docs.
- [ ] **Step 6: Commit** `feat(rustlike): cambiar piezas, spray, grasa y rasgos de las piezas`

---

### Task 5: Frontend de la fase 4

**Files:**
- Modify: `frontend/src/games/Rustlike.jsx`, `frontend/src/games/Rustlike.test.jsx`, `frontend/src/styles.css` y `docs/frontend-y-gateway.md` §2

**Decisiones:**
- **Formas SVG nuevas** (16 px por casilla y `data-kind` en cada grupo):
  - `<Turret>`: un cuadrado con cañón;
  - `<RustyRobot>`: una versión tosca y marrón del robot;
  - `<Leak>`: una gota azul que cae;
  - `<FloorPart>`: un engranaje pequeño con la inicial del hueco (P, B o S);
  - `<Spray>` y `<Grease>`: iconos sencillos.

  Los enemigos con `detected: true` se dibujan con opacidad .5 y contorno discontinuo. La gotera no lleva barra de integridad.
- **HUD (panel derecho):**
  - el nombre de cada pieza usa la etiqueta del modelo, la misma tabla que `part_label` en un mapa `MODELOS` del cliente;
  - una línea «Grasa: N turnos» si `effects.grease > 0`;
  - una línea «Salto: listo» o «Salto: N turnos» si `effects.jumpCooldown !== null`;
  - el botón «Cambiar pieza», visible si `allowedActions` incluye `swap`.
- **Tecla X:** cambia de pieza.
- **Usar spray o grasa:** el botón «Usar» o las teclas 1, 2 y 3 envían `{type:'use', slot}` directamente, sin selector; el selector solo sale para la lata de aceite.
- `OBJETOS` añade «Spray lubricante» y «Grasa protectora».
- Los botones nuevos siguen las mismas reglas que los demás: `blur()` tras el clic y `disabled` con `inactivo`.

- [ ] **Step 1: Pruebas:**
  - `dibuja torretas, robots oxidados, goteras, piezas y consumibles`;
  - `los detectados se dibujan atenuados`;
  - `el nombre de la pieza sigue el modelo`;
  - `X y el botón Cambiar pieza envían swap solo si está permitido`;
  - `usar spray o grasa no abre el selector y envía use sin target`;
  - `muestra grasa y salto cuando aplican`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** `npm test` y `npm run build` → PASS.
- [ ] **Step 5:** Actualizar los controles en `docs/frontend-y-gateway.md` §2.
- [ ] **Step 6: Commit** `feat(Frontend): enemigos, piezas y consumibles de la fase 4 en Rust Like`
