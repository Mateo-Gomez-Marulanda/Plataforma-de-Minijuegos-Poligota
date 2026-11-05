// Lógica pura del juego, sin dependencias de red: partida nueva y aplicación de acciones.
pub mod action;
pub mod ai;
pub mod combat;
pub mod corrosion;
pub mod entities;
pub mod fov;
pub mod map;
pub mod pathfinding;
pub mod score;
pub mod spawn;
pub mod state;
pub mod traits;

pub use action::{Action, Dir, Event, InvalidMove};
pub use state::{GameState, Status};

use corrosion::{corrode, repair, Body, Slot, HIT_SLOTS};
use map::generator::generate;
use map::zones::Zone;
use rand::rngs::StdRng;
use rand::{RngExt, SeedableRng};

/// Máximo de entradas que conserva el registro.
pub const LOG_LIMIT: usize = 20;

/// Crea una partida en el piso 1 a partir de la semilla.
pub fn new_game(seed: u64) -> GameState {
    let mut rng = StdRng::seed_from_u64(seed);
    let level = generate(1, &mut rng);
    let (w, h) = (level.map.width, level.map.height);
    let mut next_id = 0;
    let entities = spawn::populate(1, &level, &mut rng, &mut next_id);
    let mut state = GameState {
        seed,
        floor: 1,
        zone: Zone::for_floor(1),
        turn: 0,
        player: level.start,
        stairs: level.stairs,
        map: level.map,
        seen: vec![vec![false; w]; h],
        visible: Vec::new(),
        status: Status::Playing,
        log: vec!["Despiertas en el piso 1 de la fábrica.".to_string()],
        score: 0,
        body: Body::new(),
        entities,
        next_id,
        items: [None; 3],
        jump_cooldown: 0,
        grease_turns: 0,
        rng,
    };
    refresh_vision(&mut state);
    state
}

/// Aplica una acción; valida todo antes de tocar el estado.
pub fn apply_action(state: &mut GameState, action: Action) -> Result<Vec<Event>, InvalidMove> {
    if state.status != Status::Playing {
        return Err(InvalidMove("La partida ha terminado.".to_string()));
    }
    let mut events = Vec::new();
    match action {
        Action::Move { dir } => {
            let (dx, dy) = dir.delta();
            let dest = map::Pos {
                x: state.player.x + dx,
                y: state.player.y + dy,
            };
            if !state.map.is_walkable(dest) {
                return Err(InvalidMove("Un muro bloquea el paso.".to_string()));
            }
            if let Some(idx) = combat::enemy_at(&state.entities, dest) {
                if matches!(&state.entities[idx].kind,
                    entities::EntityKind::Enemy(e) if e.kind.indestructible())
                {
                    return Err(InvalidMove("La gotera es indestructible.".to_string()));
                }
                attack(state, idx, &mut events);
            } else {
                walk(state, dir, dest, &mut events);
            }
        }
        Action::Wait => {}
        Action::Descend => return descend(state),
        Action::Pick => pick(state, &mut events)?,
        Action::Swap => swap(state, &mut events)?,
        Action::Use { slot, target } => use_item(state, slot, target, &mut events)?,
    }
    state.turn += 1;
    // Los enemigos ven al robot ya en su nueva casilla.
    refresh_vision(state);
    ai::enemy_turns(state, &mut events);
    end_turn(state, &mut events);
    Ok(events)
}

/// Desplaza al robot a una casilla libre; las piernas pueden trabarse y las de resorte
/// cargadas saltan dos casillas.
fn walk(state: &mut GameState, dir: Dir, dest: map::Pos, events: &mut Vec<Event>) {
    // La tirada solo ocurre si la jugada es válida y la probabilidad es positiva.
    let chance = state.body.legs.condition().legs_fail_chance();
    if chance > 0.0 && state.rng.random_bool(chance) {
        events.push(Event::PlayerStuck);
        push_log(
            state,
            "Tus piernas se traban. Pierdes el turno.".to_string(),
        );
        return;
    }
    let dest = match traits::try_jump(state, dir, dest) {
        Some(landing) => {
            state.jump_cooldown = traits::JUMP_COOLDOWN;
            events.push(Event::PlayerMoved);
            events.push(Event::PlayerJumped);
            push_log(
                state,
                "Saltas dos casillas con las piernas de resorte.".to_string(),
            );
            landing
        }
        None => {
            events.push(Event::PlayerMoved);
            dest
        }
    };
    state.player = dest;
    // La oruga es una protección física: aun bloqueada, ignora los charcos.
    let tracked = state.body.legs.model == corrosion::PartModel::Tracked;
    if state.map.get(dest) == map::Tile::Puddle && !tracked {
        // Con grasa activa el charco no se oxida ni deja rastro en el registro.
        if state.grease_turns > 0 {
            return;
        }
        push_log(state, "Pisas un charco.".to_string());
        apply_corrosion(state, Slot::Legs, 3, events, "");
    }
}

/// Golpea al enemigo en `idx`; si su integridad llega a 0 lo destruye y suma puntos.
fn attack(state: &mut GameState, idx: usize, events: &mut Vec<Event>) {
    let dmg = combat::player_damage(&state.body);
    if dmg == 0 {
        push_log(state, "Tus brazos bloqueados no hacen daño.".to_string());
        return;
    }
    let entities::EntityKind::Enemy(enemy) = &mut state.entities[idx].kind else {
        return;
    };
    enemy.integrity = enemy.integrity.saturating_sub(dmg);
    let (dead, name, kind) = (
        enemy.integrity == 0,
        contracted(enemy.kind.name()),
        enemy.kind,
    );
    events.push(Event::EnemyHit);
    push_log(state, format!("Golpeas {name} (−{dmg})."));
    if dead {
        let pos = state.entities.remove(idx).pos;
        let points = score::points_for_floor(state.floor);
        state.score += points;
        events.push(Event::EnemyDestroyed);
        push_log(state, format!("Destruyes {name}. +{points} puntos."));
        if kind == entities::EnemyKind::RustyRobot {
            drop_part(state, pos);
        }
    }
}

/// El robot oxidado suelta una pieza en su casilla.
fn drop_part(state: &mut GameState, pos: map::Pos) {
    let (slot, part) = spawn::random_part(state.floor, &mut state.rng, 30..=70);
    let id = state.next_id;
    state.next_id += 1;
    let label = corrosion::part_label(slot, part.model).to_lowercase();
    state.entities.push(entities::Entity {
        id,
        pos,
        kind: entities::EntityKind::Part { slot, part },
    });
    push_log(state, format!("El robot oxidado suelta {label}."));
}

/// Contrae "el X" en "al X" para los mensajes de ataque.
fn contracted(name: &str) -> String {
    format!("al {}", name.strip_prefix("el ").unwrap_or(name))
}

/// Recoge el objeto bajo el robot en el primer espacio libre.
fn pick(state: &mut GameState, events: &mut Vec<Event>) -> Result<(), InvalidMove> {
    let Some(idx) = combat::item_at(&state.entities, state.player) else {
        return Err(InvalidMove("No hay ningún objeto aquí.".to_string()));
    };
    let Some(free) = state.items.iter().position(Option::is_none) else {
        return Err(InvalidMove(
            "No tienes espacio: los 3 espacios están llenos.".to_string(),
        ));
    };
    if let entities::EntityKind::Item(kind) = state.entities.remove(idx).kind {
        state.items[free] = Some(kind);
        events.push(Event::ItemPicked);
        push_log(state, format!("Recoges {}.", kind.name()));
    }
    Ok(())
}

/// Cambia la pieza del robot por la que hay en su casilla; la suya queda en el suelo.
fn swap(state: &mut GameState, events: &mut Vec<Event>) -> Result<(), InvalidMove> {
    let player = state.player;
    let found = state.entities.iter_mut().find_map(|e| match &mut e.kind {
        entities::EntityKind::Part { slot, part } if e.pos == player => Some((slot, part)),
        _ => None,
    });
    let Some((slot, part)) = found else {
        return Err(InvalidMove("No hay ninguna pieza aquí.".to_string()));
    };
    let slot = *slot;
    let mine = std::mem::replace(state.body.part_mut(slot), *part);
    *part = mine;
    let (old, new) = (
        corrosion::part_label(slot, mine.model).to_lowercase(),
        corrosion::part_label(slot, state.body.part(slot).model).to_lowercase(),
    );
    events.push(Event::PartSwapped);
    push_log(
        state,
        format!(
            "Cambias tus {old} ({}) por {new} ({}).",
            mine.corrosion,
            state.body.part(slot).corrosion
        ),
    );
    Ok(())
}

/// Usa el objeto de un espacio: aceite (pieza elegida), spray (todas) o grasa.
fn use_item(
    state: &mut GameState,
    slot: u8,
    target: Option<Slot>,
    events: &mut Vec<Event>,
) -> Result<(), InvalidMove> {
    let Some(cell) = state.items.get(usize::from(slot)).copied() else {
        return Err(InvalidMove("Ese espacio no existe.".to_string()));
    };
    let Some(item) = cell else {
        return Err(InvalidMove("Ese espacio está vacío.".to_string()));
    };
    match item {
        entities::ItemKind::OilCan => {}
        entities::ItemKind::LubricantSpray => {
            // Con todo limpio el spray se gastaría para nada.
            if [Slot::Legs, Slot::Arms, Slot::Sensors, Slot::Core]
                .iter()
                .all(|s| state.body.part(*s).corrosion == 0)
            {
                return Err(InvalidMove("Ninguna pieza tiene óxido.".to_string()));
            }
            for slot_id in [Slot::Legs, Slot::Arms, Slot::Sensors, Slot::Core] {
                repair(state.body.part_mut(slot_id), 10);
            }
            state.items[usize::from(slot)] = None;
            events.push(Event::ItemUsed);
            push_log(
                state,
                "Rocías el spray lubricante. Todas las piezas −10.".to_string(),
            );
            return Ok(());
        }
        entities::ItemKind::ProtectiveGrease => {
            state.grease_turns = 10;
            state.items[usize::from(slot)] = None;
            events.push(Event::ItemUsed);
            push_log(
                state,
                "Te untas grasa protectora: 10 turnos sin óxido.".to_string(),
            );
            return Ok(());
        }
    }
    let Some(part) = target else {
        return Err(InvalidMove("Indica qué pieza quieres aceitar.".to_string()));
    };
    // Aceitar una pieza sin óxido gastaría la lata para nada.
    if state.body.part(part).corrosion == 0 {
        return Err(InvalidMove("Esa pieza no tiene óxido.".to_string()));
    }
    let removed = repair(state.body.part_mut(part), 30);
    state.items[usize::from(slot)] = None;
    events.push(Event::ItemUsed);
    push_log(
        state,
        format!(
            "Aceitas {}. {} −{removed}.",
            part.name().to_lowercase(),
            part.name()
        ),
    );
    Ok(())
}

/// Baja al piso siguiente si el robot está sobre la escalera.
fn descend(state: &mut GameState) -> Result<Vec<Event>, InvalidMove> {
    if state.map.get(state.player) != map::Tile::Stairs {
        return Err(InvalidMove("No hay escalera aquí.".to_string()));
    }
    let next = state.floor.checked_add(1).ok_or_else(|| {
        InvalidMove("No se puede bajar más: el piso 255 es el último.".to_string())
    })?;
    let level = generate(next, &mut state.rng);
    let entities = spawn::populate(next, &level, &mut state.rng, &mut state.next_id);
    state.score += score::points_for_floor(state.floor);
    state.floor = next;
    state.zone = Zone::for_floor(next);
    state.seen = vec![vec![false; level.map.width]; level.map.height];
    state.player = level.start;
    state.stairs = level.stairs;
    state.map = level.map;
    state.entities = entities;
    state.turn += 1;
    push_log(state, format!("Bajas al piso {next}."));
    let mut events = vec![Event::FloorDescended];
    // La visión del piso anterior no sirve para el imán de este turno.
    refresh_vision(state);
    end_turn(state, &mut events);
    Ok(events)
}

/// Aplica corrosión a una pieza, la anota en el registro (con `prefix` delante del
/// primer texto) y emite los eventos.
pub(crate) fn apply_corrosion(
    state: &mut GameState,
    slot: Slot,
    base: u32,
    events: &mut Vec<Event>,
    prefix: &str,
) {
    // Con grasa activa no se oxida nada; solo se anota si el golpe trae texto.
    if state.grease_turns > 0 {
        if !prefix.is_empty() {
            push_log(
                state,
                format!("{prefix}La grasa protectora evita el óxido."),
            );
        }
        return;
    }
    let Some(hit) = corrode(&mut state.body, slot, base) else {
        if !prefix.is_empty() {
            push_log(state, prefix.trim_end().to_string());
        }
        return;
    };
    events.push(Event::PartDegraded);
    if hit.transferred {
        let text = format!(
            "{prefix}{} ya están {}: el óxido pasa al núcleo. Núcleo +{}.",
            slot.name(),
            blocked_word(slot),
            hit.amount
        );
        push_log(state, text);
    } else {
        push_log(
            state,
            format!("{prefix}{} +{}.", hit.slot.name(), hit.amount),
        );
    }
    if hit.blocked_now && hit.slot != Slot::Core {
        let text = format!(
            "{} {} por el óxido.",
            hit.slot.name(),
            blocked_word(hit.slot)
        );
        events.push(Event::PartBlocked);
        push_log(state, text);
    }
    check_core(state, events);
}

/// Participio "bloqueadas"/"bloqueados" concordado con el nombre de la pieza.
fn blocked_word(slot: Slot) -> &'static str {
    if slot == Slot::Legs {
        "bloqueadas"
    } else {
        "bloqueados"
    }
}

/// Termina la partida si el núcleo se oxidó por completo.
fn check_core(state: &mut GameState, events: &mut Vec<Event>) {
    if state.status == Status::Playing && state.body.core.corrosion >= 100 {
        state.status = Status::Lost;
        events.push(Event::GameOver);
        push_log(
            state,
            "Tu núcleo se ha oxidado por completo. Fin de la partida.".to_string(),
        );
    }
}

/// Fase de entorno tras un turno consumido: corrosión pasiva, propagación y visión.
fn end_turn(state: &mut GameState, events: &mut Vec<Event>) {
    if state.turn.is_multiple_of(6) {
        leaks_drip(state);
    }
    traits::magnet_pull(state);
    let mut core_gain = 0;
    if state.turn.is_multiple_of(10) {
        core_gain += 1;
    }
    if state.turn.is_multiple_of(5) {
        core_gain += HIT_SLOTS
            .iter()
            .filter(|s| {
                matches!(
                    state.body.part(**s).condition(),
                    corrosion::Condition::Critical | corrosion::Condition::Blocked
                )
            })
            .count() as u32;
    }
    if core_gain > 0
        && state.grease_turns == 0
        && corrode(&mut state.body, Slot::Core, core_gain).is_some()
    {
        events.push(Event::PartDegraded);
    }
    check_core(state, events);
    // La grasa baja después de las comprobaciones del turno: `use` la fija en 10 y
    // protege ese turno y los 9 siguientes (10 en total); el turno 11 vuelve el óxido.
    state.grease_turns = state.grease_turns.saturating_sub(1);
    state.jump_cooldown = state.jump_cooldown.saturating_sub(1);
    refresh_vision(state);
}

/// Cada gotera convierte en charco una casilla de suelo vecina al azar.
fn leaks_drip(state: &mut GameState) {
    let mut leaks: Vec<(u32, map::Pos)> = state
        .entities
        .iter()
        .filter(|e| matches!(&e.kind, entities::EntityKind::Enemy(en) if en.kind.indestructible()))
        .map(|e| (e.id, e.pos))
        .collect();
    leaks.sort_unstable_by_key(|l| l.0);
    for (_, pos) in leaks {
        let floors: Vec<map::Pos> = (-1..=1)
            .flat_map(|dy| (-1..=1).map(move |dx| (dx, dy)))
            .filter(|d| *d != (0, 0))
            .map(|(dx, dy)| map::Pos {
                x: pos.x + dx,
                y: pos.y + dy,
            })
            .filter(|p| state.map.get(*p) == map::Tile::Floor)
            .collect();
        if !floors.is_empty() {
            let pick = floors[state.rng.random_range(0..floors.len())];
            state.map.set(pick, map::Tile::Puddle);
        }
    }
}

/// Recalcula la visión actual y acumula lo visto en `seen`.
fn refresh_vision(state: &mut GameState) {
    state.visible = fov::compute(&state.map, state.player, state.body.vision_radius());
    for (seen_row, vis_row) in state.seen.iter_mut().zip(&state.visible) {
        for (s, v) in seen_row.iter_mut().zip(vis_row) {
            *s |= *v;
        }
    }
}

/// Añade una entrada al registro, descartando las más antiguas.
fn push_log(state: &mut GameState, entry: String) {
    state.log.push(entry);
    if state.log.len() > LOG_LIMIT {
        let excess = state.log.len() - LOG_LIMIT;
        state.log.drain(..excess);
    }
}

#[cfg(test)]
mod tests {
    use super::map::zones::Zone;
    use super::map::{Pos, Tile};
    use super::score::points_for_floor;
    use super::*;

    const DIRS: [Dir; 8] = [
        Dir::Up,
        Dir::Down,
        Dir::Left,
        Dir::Right,
        Dir::UpLeft,
        Dir::UpRight,
        Dir::DownLeft,
        Dir::DownRight,
    ];

    fn target(s: &GameState, d: Dir) -> Pos {
        let (dx, dy) = d.delta();
        Pos {
            x: s.player.x + dx,
            y: s.player.y + dy,
        }
    }

    fn on_stairs(seed: u64) -> GameState {
        let mut s = new_game(seed);
        s.player = s.stairs.unwrap();
        s
    }

    #[test]
    fn new_game_starts_on_floor_one() {
        let s = new_game(1);
        assert_eq!(s.floor, 1);
        assert_eq!(s.turn, 0);
        assert_eq!(s.zone, Zone::Warehouse);
        assert_eq!(s.status, Status::Playing);
        assert_eq!(s.score, 0);
        assert!(s.map.is_walkable(s.player));
        assert_eq!(s.log, vec!["Despiertas en el piso 1 de la fábrica."]);
    }

    #[test]
    fn same_seed_same_game() {
        let mut a = new_game(9);
        let mut b = new_game(9);
        assert_eq!(a.map, b.map);
        assert_eq!(a.player, b.player);
        assert_eq!(a.seen, b.seen);
        let acts = [
            Action::Wait,
            Action::Move { dir: Dir::Left },
            Action::Move { dir: Dir::Right },
            Action::Wait,
        ];
        for act in acts {
            let ra = apply_action(&mut a, act);
            let rb = apply_action(&mut b, act);
            assert_eq!(ra, rb);
        }
        assert_eq!((a.floor, a.turn, a.player), (b.floor, b.turn, b.player));
        assert_eq!(a.entities, b.entities);
        assert!(!a.entities.is_empty());
        assert_eq!(
            (&a.map, &a.seen, &a.visible, a.score, &a.log),
            (&b.map, &b.seen, &b.visible, b.score, &b.log)
        );
    }

    #[test]
    fn move_into_wall_is_rejected_and_changes_nothing() {
        // Coloca al robot en una casilla de suelo con un muro contiguo.
        let mut s = new_game(2);
        let map = &s.map;
        let (pos, d) = (0..map.height as i32)
            .flat_map(|y| (0..map.width as i32).map(move |x| Pos { x, y }))
            .filter(|p| map.is_walkable(*p))
            .find_map(|p| {
                let d = DIRS.into_iter().find(|d| {
                    let (dx, dy) = d.delta();
                    map.get(Pos {
                        x: p.x + dx,
                        y: p.y + dy,
                    }) == Tile::Wall
                })?;
                Some((p, d))
            })
            .unwrap();
        s.player = pos;
        let (turn, player, seen) = (s.turn, s.player, s.seen.clone());
        let r = apply_action(&mut s, Action::Move { dir: d });
        assert_eq!(r, Err(InvalidMove("Un muro bloquea el paso.".to_string())));
        assert_eq!((s.turn, s.player, s.seen), (turn, player, seen));
    }

    #[test]
    fn valid_move_advances_turn() {
        let mut s = new_game(3);
        let d = DIRS
            .into_iter()
            .find(|d| s.map.is_walkable(target(&s, *d)))
            .unwrap();
        let expected = target(&s, d);
        let r = apply_action(&mut s, Action::Move { dir: d });
        assert_eq!(r, Ok(vec![Event::PlayerMoved]));
        assert_eq!(s.turn, 1);
        assert_eq!(s.player, expected);
    }

    #[test]
    fn wait_advances_turn() {
        let mut s = new_game(3);
        assert_eq!(apply_action(&mut s, Action::Wait), Ok(vec![]));
        assert_eq!(s.turn, 1);
    }

    #[test]
    fn descend_off_stairs_is_rejected() {
        let mut s = new_game(4);
        let r = apply_action(&mut s, Action::Descend);
        assert_eq!(r, Err(InvalidMove("No hay escalera aquí.".to_string())));
        assert_eq!((s.floor, s.turn), (1, 0));
    }

    #[test]
    fn descend_on_stairs_goes_to_next_floor() {
        let mut s = on_stairs(5);
        let r = apply_action(&mut s, Action::Descend);
        assert_eq!(r, Ok(vec![Event::FloorDescended]));
        assert_eq!(s.floor, 2);
        assert_eq!(s.turn, 1);
        assert_eq!(s.map.get(s.player), Tile::Floor);
        assert_eq!(s.log.last().unwrap(), "Bajas al piso 2.");
    }

    #[test]
    fn cannot_descend_from_floor_255() {
        let mut s = new_game(6);
        s.floor = 255;
        s.map.set(s.player, Tile::Stairs);
        let r = apply_action(&mut s, Action::Descend);
        assert_eq!(
            r,
            Err(InvalidMove(
                "No se puede bajar más: el piso 255 es el último.".to_string()
            ))
        );
        assert_eq!(s.floor, 255);
    }

    #[test]
    fn unseen_tiles_are_unknown() {
        let s = new_game(7);
        let mut some_seen = false;
        for y in 0..s.map.height {
            for x in 0..s.map.width {
                let p = Pos {
                    x: x as i32,
                    y: y as i32,
                };
                assert_eq!(s.known_tile(p).is_some(), s.seen[y][x]);
                some_seen |= s.seen[y][x];
            }
        }
        assert!(some_seen);
    }

    #[test]
    fn fresh_game_sees_only_radius() {
        let s = new_game(8);
        for y in 0..s.map.height {
            for x in 0..s.map.width {
                if s.seen[y][x] {
                    let (dx, dy) = (x as i32 - s.player.x, y as i32 - s.player.y);
                    assert!(dx * dx + dy * dy <= 64);
                }
            }
        }
    }

    #[test]
    fn allowed_actions_offer_descend_only_on_stairs() {
        assert_eq!(new_game(10).allowed_actions(), vec!["move", "wait"]);
        assert_eq!(
            on_stairs(10).allowed_actions(),
            vec!["move", "wait", "descend"]
        );
    }

    #[test]
    fn log_is_capped() {
        let mut s = new_game(11);
        for _ in 0..30 {
            s.player = s.stairs.unwrap();
            apply_action(&mut s, Action::Descend).unwrap();
        }
        assert_eq!(s.log.len(), LOG_LIMIT);
        assert_eq!(s.log.last().unwrap(), "Bajas al piso 31.");
    }

    #[test]
    fn points_grow_every_50_floors() {
        for (f, p) in [
            (1, 20),
            (50, 20),
            (51, 25),
            (100, 25),
            (101, 30),
            (250, 40),
            (251, 45),
            (255, 45),
        ] {
            assert_eq!(points_for_floor(f), p);
        }
    }

    #[test]
    fn descending_adds_points_of_completed_floor() {
        let mut s = on_stairs(12);
        apply_action(&mut s, Action::Descend).unwrap();
        assert_eq!(s.score, 20);
        for (floor, gain) in [(50u8, 20u32), (51, 25)] {
            s.floor = floor;
            s.player = s.stairs.unwrap();
            let before = s.score;
            apply_action(&mut s, Action::Descend).unwrap();
            assert_eq!(s.score, before + gain);
        }
        let before = s.score;
        assert!(apply_action(&mut s, Action::Descend).is_err());
        assert_eq!(s.score, before);
    }

    // --- Fase 2: corrosión en el turno ---

    use super::corrosion::Slot;
    use rand::RngExt;

    fn walkable_dir(s: &GameState) -> Dir {
        DIRS.into_iter()
            .find(|d| s.map.get(target(s, *d)) == Tile::Floor)
            .unwrap()
    }

    fn wall_dir(s: &GameState) -> Option<Dir> {
        DIRS.into_iter()
            .find(|d| s.map.get(target(s, *d)) == Tile::Wall)
    }

    #[test]
    fn passive_core_every_10_turns() {
        let mut s = new_game(20);
        for _ in 0..10 {
            apply_action(&mut s, Action::Wait).unwrap();
        }
        assert_eq!(s.body.core.corrosion, 1);
    }

    #[test]
    fn propagation_every_5_turns() {
        let mut s = new_game(21);
        s.body.part_mut(Slot::Legs).corrosion = 80;
        for _ in 0..5 {
            apply_action(&mut s, Action::Wait).unwrap();
        }
        assert_eq!(s.body.core.corrosion, 1);
        for _ in 0..5 {
            apply_action(&mut s, Action::Wait).unwrap();
        }
        assert_eq!(s.body.core.corrosion, 3);
    }

    #[test]
    fn stuck_legs_lose_turn() {
        let mut found = false;
        for seed in 0..50 {
            let mut s = new_game(seed);
            s.body.part_mut(Slot::Legs).corrosion = 100;
            let d = walkable_dir(&s);
            let before = s.player;
            let ev = apply_action(&mut s, Action::Move { dir: d }).unwrap();
            if ev.contains(&Event::PlayerStuck) {
                assert_eq!(s.turn, 1);
                assert_eq!(s.player, before);
                assert!(s
                    .log
                    .contains(&"Tus piernas se traban. Pierdes el turno.".to_string()));
                found = true;
                break;
            }
        }
        assert!(found);
    }

    #[test]
    fn optimal_legs_never_roll() {
        let mut a = new_game(22);
        let mut b = new_game(22);
        // Sin enemigos, así que ninguna tirada ajena toca el generador.
        a.entities.clear();
        b.entities.clear();
        let d = walkable_dir(&a);
        apply_action(&mut a, Action::Move { dir: d }).unwrap();
        a.player = a.stairs.unwrap();
        b.player = b.stairs.unwrap();
        apply_action(&mut a, Action::Descend).unwrap();
        apply_action(&mut b, Action::Descend).unwrap();
        assert_eq!(a.map, b.map);
    }

    #[test]
    fn puddle_corrodes_legs() {
        let mut s = new_game(23);
        let d = walkable_dir(&s);
        let dest = target(&s, d);
        s.map.set(dest, Tile::Puddle);
        let ev = apply_action(&mut s, Action::Move { dir: d }).unwrap();
        assert_eq!(ev, vec![Event::PlayerMoved, Event::PartDegraded]);
        assert_eq!(s.body.legs.corrosion, 3);
        assert!(s.log.contains(&"Pisas un charco.".to_string()));
        assert_eq!(s.log.last().unwrap(), "Piernas +3.");
    }

    #[test]
    fn sensors_shrink_vision() {
        let mut s = new_game(24);
        s.body.part_mut(Slot::Sensors).corrosion = 75;
        apply_action(&mut s, Action::Wait).unwrap();
        assert!(s.visible[s.player.y as usize][s.player.x as usize]);
        for (y, row) in s.visible.iter().enumerate() {
            for (x, v) in row.iter().enumerate() {
                if *v {
                    let (dx, dy) = (x as i32 - s.player.x, y as i32 - s.player.y);
                    assert!(dx * dx + dy * dy <= 4);
                }
            }
        }
    }

    #[test]
    fn core_at_100_loses() {
        let mut s = new_game(25);
        s.body.part_mut(Slot::Core).corrosion = 99;
        let mut last = vec![];
        for _ in 0..10 {
            last = apply_action(&mut s, Action::Wait).unwrap();
        }
        assert_eq!(s.status, Status::Lost);
        assert!(last.contains(&Event::GameOver));
        assert_eq!(
            s.log.last().unwrap(),
            "Tu núcleo se ha oxidado por completo. Fin de la partida."
        );
        assert_eq!(
            apply_action(&mut s, Action::Wait),
            Err(InvalidMove("La partida ha terminado.".to_string()))
        );
    }

    #[test]
    fn invalid_move_does_not_roll() {
        let mut s = new_game(26);
        let mut reference = new_game(26);
        let (w, h) = (s.map.width as i32, s.map.height as i32);
        let mut pos = s.player;
        'search: for y in 0..h {
            for x in 0..w {
                s.player = Pos { x, y };
                if s.map.is_walkable(s.player) && wall_dir(&s).is_some() {
                    pos = s.player;
                    break 'search;
                }
            }
        }
        s.player = pos;
        s.body.part_mut(Slot::Legs).corrosion = 100;
        let d = wall_dir(&s).unwrap();
        assert!(apply_action(&mut s, Action::Move { dir: d }).is_err());
        assert_eq!(s.turn, 0);
        assert_eq!(s.rng.random::<u64>(), reference.rng.random::<u64>());
    }

    #[test]
    fn blocked_part_logs_and_transfers() {
        let mut s = new_game(27);
        let mut ev = vec![];
        s.body.part_mut(Slot::Sensors).corrosion = 98;
        apply_corrosion(&mut s, Slot::Sensors, 5, &mut ev, "");
        assert!(s.log.contains(&"Sensores +2.".to_string()));
        assert!(s
            .log
            .contains(&"Sensores bloqueados por el óxido.".to_string()));
        apply_corrosion(&mut s, Slot::Sensors, 5, &mut ev, "");
        assert_eq!(s.body.core.corrosion, 5);
        assert_eq!(
            s.log.last().unwrap(),
            "Sensores ya están bloqueados: el óxido pasa al núcleo. Núcleo +5."
        );
        assert_eq!(
            ev,
            vec![Event::PartDegraded, Event::PartBlocked, Event::PartDegraded]
        );
    }

    #[test]
    fn blocked_legs_use_feminine_and_arms_masculine() {
        let mut s = new_game(28);
        let mut ev = vec![];
        s.body.part_mut(Slot::Legs).corrosion = 99;
        apply_corrosion(&mut s, Slot::Legs, 1, &mut ev, "");
        assert_eq!(s.log.last().unwrap(), "Piernas bloqueadas por el óxido.");
        apply_corrosion(&mut s, Slot::Legs, 4, &mut ev, "");
        assert_eq!(
            s.log.last().unwrap(),
            "Piernas ya están bloqueadas: el óxido pasa al núcleo. Núcleo +4."
        );
        s.body.part_mut(Slot::Arms).corrosion = 99;
        apply_corrosion(&mut s, Slot::Arms, 1, &mut ev, "");
        assert_eq!(s.log.last().unwrap(), "Brazos bloqueados por el óxido.");
    }

    // --- Combate, IA y objetos ---

    /// Partida con un salón abierto de 20x10 sin entidades y el robot en (10, 10).
    fn arena(seed: u64) -> GameState {
        let mut s = new_game(seed);
        for y in 0..s.map.height as i32 {
            for x in 0..s.map.width as i32 {
                s.map.set(Pos { x, y }, Tile::Wall);
            }
        }
        for y in 5..15 {
            for x in 5..25 {
                s.map.set(Pos { x, y }, Tile::Floor);
            }
        }
        s.player = Pos { x: 10, y: 10 };
        s.stairs = None;
        s.entities.clear();
        refresh_vision(&mut s);
        s
    }

    fn add_enemy(s: &mut GameState, kind: entities::EnemyKind, x: i32, y: i32) -> u32 {
        let id = s.next_id;
        s.next_id += 1;
        let kind = entities::EntityKind::Enemy(entities::Enemy::new(kind, s.floor));
        s.entities.push(entities::Entity {
            id,
            pos: Pos { x, y },
            kind,
        });
        id
    }

    fn add_item(s: &mut GameState, x: i32, y: i32) {
        let id = s.next_id;
        s.next_id += 1;
        s.entities.push(entities::Entity {
            id,
            pos: Pos { x, y },
            kind: entities::EntityKind::Item(entities::ItemKind::OilCan),
        });
    }

    fn enemy_pos(s: &GameState, id: u32) -> Pos {
        s.entities.iter().find(|e| e.id == id).unwrap().pos
    }

    fn cheb(a: Pos, b: Pos) -> i32 {
        (a.x - b.x).abs().max((a.y - b.y).abs())
    }

    #[test]
    fn bump_attacks_and_destroys() {
        use entities::EnemyKind::RustMite;
        let mut s = arena(1);
        add_enemy(&mut s, RustMite, 11, 10);
        let r = apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
        assert!(r.contains(&Event::EnemyHit));
        assert_eq!(s.player, Pos { x: 10, y: 10 });
        assert_eq!(
            s.log
                .iter()
                .filter(|l| l.as_str() == "Golpeas al ácaro de óxido (−10).")
                .count(),
            1
        );
        s.body = Body::new();
        let r = apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
        assert!(r.contains(&Event::EnemyHit) && r.contains(&Event::EnemyDestroyed));
        assert_eq!(s.score, 20);
        assert!(s.entities.is_empty());
        assert!(s
            .log
            .contains(&"Destruyes al ácaro de óxido. +20 puntos.".to_string()));
    }

    #[test]
    fn blocked_arms_do_no_damage() {
        use entities::EnemyKind::RustMite;
        let mut s = arena(1);
        s.body.arms.corrosion = 100;
        add_enemy(&mut s, RustMite, 11, 10);
        let r = apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
        assert!(!r.contains(&Event::EnemyHit));
        assert!(s
            .log
            .contains(&"Tus brazos bloqueados no hacen daño.".to_string()));
        assert_eq!(s.turn, 1);
        assert!(matches!(&s.entities[0].kind, entities::EntityKind::Enemy(e) if e.integrity == 15));
    }

    #[test]
    fn attack_ignores_legs_and_visibility() {
        use entities::EnemyKind::Drone;
        for seed in 0..20 {
            let mut s = arena(seed);
            s.body.legs.corrosion = 100;
            s.body.sensors.corrosion = 100;
            add_enemy(&mut s, Drone, 11, 10);
            let r = apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
            assert!(r.contains(&Event::EnemyHit), "semilla {seed}");
            assert!(!r.contains(&Event::PlayerStuck));
        }
    }

    #[test]
    fn enemy_adjacent_hits_random_part() {
        use entities::EnemyKind::RustMite;
        let mut s = arena(2);
        add_enemy(&mut s, RustMite, 11, 10);
        let r = apply_action(&mut s, Action::Wait).unwrap();
        assert!(r.contains(&Event::PlayerHit));
        assert!(HIT_SLOTS.iter().any(|sl| s.body.part(*sl).corrosion == 6));
        let last = s.log.last().unwrap();
        assert!(last.starts_with("El ácaro de óxido te muerde. "), "{last}");
    }

    #[test]
    fn blocked_part_hit_goes_to_core() {
        use entities::EnemyKind::RustMite;
        let mut s = arena(2);
        for sl in HIT_SLOTS {
            s.body.part_mut(sl).corrosion = 100;
        }
        add_enemy(&mut s, RustMite, 11, 10);
        apply_action(&mut s, Action::Wait).unwrap();
        assert_eq!(s.body.core.corrosion, 6);
    }

    #[test]
    fn death_mid_turn_stops_play() {
        use entities::EnemyKind::RustMite;
        let mut s = arena(2);
        for sl in HIT_SLOTS {
            s.body.part_mut(sl).corrosion = 100;
        }
        s.body.core.corrosion = 94;
        add_enemy(&mut s, RustMite, 11, 10);
        add_enemy(&mut s, RustMite, 9, 10);
        let r = apply_action(&mut s, Action::Wait).unwrap();
        assert_eq!(s.body.core.corrosion, 100);
        assert_eq!(s.status, Status::Lost);
        assert!(r.contains(&Event::GameOver));
        assert_eq!(r.iter().filter(|e| **e == Event::PlayerHit).count(), 1);
    }

    #[test]
    fn mite_chases_within_8() {
        use entities::EnemyKind::RustMite;
        let mut s = arena(3);
        let id = add_enemy(&mut s, RustMite, 15, 10);
        apply_action(&mut s, Action::Wait).unwrap();
        assert_eq!(cheb(enemy_pos(&s, id), s.player), 4);
        let far = add_enemy(&mut s, RustMite, 24, 14);
        assert!(cheb(enemy_pos(&s, far), s.player) > 8);
        let before = enemy_pos(&s, far);
        // A más de 8 vaga: nunca se acerca en línea recta de golpe.
        apply_action(&mut s, Action::Wait).unwrap();
        assert!(cheb(enemy_pos(&s, far), before) <= 1);
    }

    #[test]
    fn drone_wanders_until_seen_then_chases() {
        use entities::EnemyKind::Drone;
        let mut s = arena(4);
        s.body.sensors.corrosion = 100;
        let id = add_enemy(&mut s, Drone, 13, 10);
        apply_action(&mut s, Action::Wait).unwrap();
        let awake = |s: &GameState| {
            s.entities.iter().any(|e| {
                e.id == id && matches!(&e.kind, entities::EntityKind::Enemy(en) if en.awake)
            })
        };
        assert!(!awake(&s));
        s.body.sensors.corrosion = 0;
        s.entities.iter_mut().find(|e| e.id == id).unwrap().pos = Pos { x: 15, y: 10 };
        apply_action(&mut s, Action::Wait).unwrap();
        assert!(awake(&s));
        assert_eq!(cheb(enemy_pos(&s, id), s.player), 4);
        // Despierto para siempre: persigue aunque deje de verse.
        s.body.sensors.corrosion = 100;
        apply_action(&mut s, Action::Wait).unwrap();
        assert_eq!(cheb(enemy_pos(&s, id), s.player), 3);
    }

    #[test]
    fn enemies_never_stack_or_enter_player() {
        use entities::EnemyKind::{Drone, RustMite};
        let mut s = arena(5);
        for (i, k) in [RustMite, Drone, RustMite, Drone, RustMite, Drone]
            .into_iter()
            .enumerate()
        {
            add_enemy(&mut s, k, 14 + i as i32, 6 + 2 * (i as i32 % 3));
        }
        for _ in 0..200 {
            s.body = Body::new();
            apply_action(&mut s, Action::Wait).unwrap();
            let mut seen = std::collections::HashSet::new();
            for e in &s.entities {
                assert!(seen.insert(e.pos), "dos entidades en {:?}", e.pos);
                assert_ne!(e.pos, s.player);
            }
        }
    }

    #[test]
    fn turret_shoots_in_line_within_5() {
        use entities::EnemyKind::Turret;
        // Recto a 5, diagonal a 3 y adyacente: dispara.
        for (x, y) in [(15, 10), (13, 13), (11, 10)] {
            let mut s = arena(2);
            add_enemy(&mut s, Turret, x, y);
            let r = apply_action(&mut s, Action::Wait).unwrap();
            assert!(r.contains(&Event::PlayerHit), "({x},{y})");
            let last = s.log.last().unwrap();
            assert!(last.starts_with("La torreta te dispara. "), "{last}");
            assert!(HIT_SLOTS.iter().any(|sl| s.body.part(*sl).corrosion == 5));
        }
        // A 6 casillas, o fuera de las ocho líneas, no dispara.
        for (x, y) in [(16, 10), (12, 13)] {
            let mut s = arena(2);
            add_enemy(&mut s, Turret, x, y);
            let r = apply_action(&mut s, Action::Wait).unwrap();
            assert!(!r.contains(&Event::PlayerHit), "({x},{y})");
        }
    }

    #[test]
    fn turret_blocked_by_wall_or_enemy() {
        use entities::EnemyKind::{RustMite, Turret};
        let mut s = arena(2);
        add_enemy(&mut s, Turret, 15, 10);
        s.map.set(Pos { x: 13, y: 10 }, Tile::Wall);
        let r = apply_action(&mut s, Action::Wait).unwrap();
        assert!(!r.contains(&Event::PlayerHit));
        let mut s = arena(2);
        add_enemy(&mut s, Turret, 15, 10);
        add_enemy(&mut s, RustMite, 13, 10);
        apply_action(&mut s, Action::Wait).unwrap();
        assert!(!s.log.iter().any(|l| l.contains("torreta")));
    }

    #[test]
    fn turret_never_moves() {
        use entities::EnemyKind::Turret;
        let mut s = arena(3);
        let id = add_enemy(&mut s, Turret, 20, 7);
        for _ in 0..40 {
            s.body = Body::new();
            apply_action(&mut s, Action::Wait).unwrap();
            assert_eq!(enemy_pos(&s, id), Pos { x: 20, y: 7 });
        }
    }

    #[test]
    fn rusty_robot_acts_every_other_turn() {
        use entities::EnemyKind::RustyRobot;
        let mut s = arena(3);
        let id = add_enemy(&mut s, RustyRobot, 18, 10);
        let mut dists = Vec::new();
        for _ in 0..4 {
            apply_action(&mut s, Action::Wait).unwrap();
            dists.push(cheb(enemy_pos(&s, id), s.player));
        }
        assert_eq!(dists, vec![7, 7, 6, 6]);
        // Adyacente: golpea solo en turnos alternos.
        let mut s = arena(3);
        add_enemy(&mut s, RustyRobot, 11, 10);
        let hits: Vec<bool> = (0..4)
            .map(|_| {
                apply_action(&mut s, Action::Wait)
                    .unwrap()
                    .contains(&Event::PlayerHit)
            })
            .collect();
        assert_eq!(hits, vec![true, false, true, false]);
    }

    #[test]
    fn rusty_robot_drops_part_on_death() {
        use entities::EnemyKind::RustyRobot;
        let mut s = arena(4);
        let id = add_enemy(&mut s, RustyRobot, 11, 10);
        if let Some(entities::EntityKind::Enemy(e)) = s
            .entities
            .iter_mut()
            .find(|e| e.id == id)
            .map(|e| &mut e.kind)
        {
            e.integrity = 1;
        }
        let next = s.next_id;
        apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
        let part = s
            .entities
            .iter()
            .find(|e| e.pos == Pos { x: 11, y: 10 })
            .expect("pieza en la casilla");
        assert_eq!(part.id, next);
        assert_eq!(s.next_id, next + 1);
        let entities::EntityKind::Part { slot, part: p } = &part.kind else {
            panic!("no es una pieza");
        };
        assert!((30..=70).contains(&p.corrosion));
        let label = corrosion::part_label(*slot, p.model).to_lowercase();
        let n = s.log.len();
        assert_eq!(s.log[n - 1], format!("El robot oxidado suelta {label}."));
        assert!(s.log[n - 2].starts_with("Destruyes al robot oxidado."));
    }

    #[test]
    fn leak_is_indestructible_and_costs_no_turn() {
        use entities::EnemyKind::Leak;
        let mut s = arena(5);
        add_enemy(&mut s, Leak, 11, 10);
        let mut twin = arena(5);
        add_enemy(&mut twin, Leak, 11, 10);
        let r = apply_action(&mut s, Action::Move { dir: Dir::Right });
        assert_eq!(
            r,
            Err(InvalidMove("La gotera es indestructible.".to_string()))
        );
        assert_eq!(s.turn, 0);
        assert_eq!(s.log.len(), 1);
        assert_eq!(s.rng.random::<u64>(), twin.rng.random::<u64>());
    }

    #[test]
    fn leak_drips_every_6_turns() {
        use entities::EnemyKind::Leak;
        let puddles = |s: &GameState| {
            (0..s.map.height as i32)
                .flat_map(|y| (0..s.map.width as i32).map(move |x| Pos { x, y }))
                .filter(|p| s.map.get(*p) == Tile::Puddle)
                .collect::<Vec<_>>()
        };
        let mut s = arena(6);
        add_enemy(&mut s, Leak, 20, 8);
        for _ in 0..5 {
            apply_action(&mut s, Action::Wait).unwrap();
        }
        assert!(puddles(&s).is_empty());
        apply_action(&mut s, Action::Wait).unwrap();
        let p = puddles(&s);
        assert_eq!(p.len(), 1);
        assert_eq!(cheb(p[0], Pos { x: 20, y: 8 }), 1);
        // Sin vecinas de suelo (muros y escalera), no hace nada.
        let mut s = arena(6);
        add_enemy(&mut s, Leak, 20, 8);
        for dy in -1..=1 {
            for dx in -1..=1 {
                if (dx, dy) != (0, 0) {
                    s.map.set(
                        Pos {
                            x: 20 + dx,
                            y: 8 + dy,
                        },
                        Tile::Wall,
                    );
                }
            }
        }
        s.map.set(Pos { x: 21, y: 8 }, Tile::Stairs);
        for _ in 0..6 {
            apply_action(&mut s, Action::Wait).unwrap();
        }
        assert!(puddles(&s).is_empty());
    }

    #[test]
    fn pick_and_full_slots() {
        let mut s = arena(6);
        assert_eq!(
            apply_action(&mut s, Action::Pick),
            Err(InvalidMove("No hay ningún objeto aquí.".to_string()))
        );
        add_item(&mut s, 11, 10);
        apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
        assert!(s.allowed_actions().contains(&"pick"));
        s.items = [Some(entities::ItemKind::OilCan); 3];
        assert!(!s.allowed_actions().contains(&"pick"));
        let turn = s.turn;
        assert_eq!(
            apply_action(&mut s, Action::Pick),
            Err(InvalidMove(
                "No tienes espacio: los 3 espacios están llenos.".to_string()
            ))
        );
        assert_eq!(s.turn, turn);
        assert_eq!(s.entities.len(), 1);
        s.items[1] = None;
        let r = apply_action(&mut s, Action::Pick).unwrap();
        assert!(r.contains(&Event::ItemPicked));
        assert_eq!(s.items[1], Some(entities::ItemKind::OilCan));
        assert!(s.entities.is_empty());
        assert!(s.log.contains(&"Recoges una lata de aceite.".to_string()));
    }

    #[test]
    fn use_oil_can_rules() {
        let mut s = arena(7);
        let use_ = |slot, target| Action::Use { slot, target };
        let err = |m: &str| Err(InvalidMove(m.to_string()));
        assert_eq!(
            apply_action(&mut s, use_(3, None)),
            err("Ese espacio no existe.")
        );
        assert_eq!(
            apply_action(&mut s, use_(0, None)),
            err("Ese espacio está vacío.")
        );
        s.items[0] = Some(entities::ItemKind::OilCan);
        assert_eq!(
            apply_action(&mut s, use_(0, None)),
            err("Indica qué pieza quieres aceitar.")
        );
        assert_eq!(s.turn, 0);
        // Una pieza sin óxido se rechaza sin gastar la lata, el turno ni el azar.
        let mut twin = arena(7);
        assert_eq!(
            apply_action(&mut s, use_(0, Some(Slot::Legs))),
            err("Esa pieza no tiene óxido.")
        );
        assert_eq!(s.items[0], Some(entities::ItemKind::OilCan));
        assert_eq!(s.turn, 0);
        assert_eq!(s.rng.random::<u64>(), twin.rng.random::<u64>());
        s.body.legs.corrosion = 50;
        let r = apply_action(&mut s, use_(0, Some(Slot::Legs))).unwrap();
        assert!(r.contains(&Event::ItemUsed));
        assert_eq!(s.body.legs.corrosion, 20);
        assert_eq!(s.items[0], None);
        assert!(s.log.contains(&"Aceitas piernas. Piernas −30.".to_string()));
        assert_eq!(s.turn, 1);
    }

    #[test]
    fn descend_populates_new_floor() {
        let mut s = on_stairs(8);
        apply_action(&mut s, Action::Descend).unwrap();
        assert!(s
            .entities
            .iter()
            .any(|e| matches!(e.kind, entities::EntityKind::Enemy(_))));
        assert!(s.entities.iter().all(|e| e.pos != s.player));
    }

    // --- Piezas con rasgo, cambio de pieza, spray y grasa ---

    use corrosion::{Part, PartModel};
    use entities::{EnemyKind, EntityKind, ItemKind};

    fn add_part(s: &mut GameState, pos: Pos, slot: Slot, model: PartModel, corrosion: u8) {
        let id = s.next_id;
        s.next_id += 1;
        s.entities.push(entities::Entity {
            id,
            pos,
            kind: EntityKind::Part {
                slot,
                part: Part { model, corrosion },
            },
        });
    }

    fn set_legs(s: &mut GameState, model: PartModel, corrosion: u8) {
        s.body.legs = Part { model, corrosion };
    }

    fn p(x: i32, y: i32) -> Pos {
        Pos { x, y }
    }

    #[test]
    fn swap_exchanges_parts() {
        let mut s = arena(10);
        s.body.legs.corrosion = 20;
        s.jump_cooldown = 4;
        let here = s.player;
        add_part(&mut s, here, Slot::Legs, PartModel::Tracked, 55);
        let ev = apply_action(&mut s, Action::Swap).unwrap();
        assert!(ev.contains(&Event::PartSwapped));
        assert_eq!(
            s.body.legs,
            Part {
                model: PartModel::Tracked,
                corrosion: 55
            }
        );
        let left = s.entities.iter().find(|e| e.pos == s.player).unwrap();
        assert_eq!(
            left.kind,
            EntityKind::Part {
                slot: Slot::Legs,
                part: Part {
                    model: PartModel::Basic,
                    corrosion: 20
                }
            }
        );
        assert_eq!(
            s.log.last().unwrap(),
            "Cambias tus piernas básicas (20) por piernas de oruga (55)."
        );
        assert_eq!((s.turn, s.jump_cooldown), (1, 3));
    }

    #[test]
    fn swap_without_part_fails() {
        let mut s = arena(10);
        let mut twin = arena(10);
        add_item(&mut s, 10, 10);
        add_item(&mut twin, 10, 10);
        assert_eq!(
            apply_action(&mut s, Action::Swap),
            Err(InvalidMove("No hay ninguna pieza aquí.".to_string()))
        );
        assert_eq!(s.turn, 0);
        assert_eq!(s.rng.random::<u64>(), twin.rng.random::<u64>());
    }

    #[test]
    fn pick_and_swap_coexist() {
        let mut s = arena(10);
        add_item(&mut s, 10, 10);
        add_part(&mut s, p(10, 10), Slot::Arms, PartModel::Drill, 10);
        let a = s.allowed_actions();
        assert!(a.contains(&"pick") && a.contains(&"swap"));
        apply_action(&mut s, Action::Swap).unwrap();
        assert_eq!(s.body.arms.model, PartModel::Drill);
        assert!(combat::item_at(&s.entities, s.player).is_some());
        apply_action(&mut s, Action::Pick).unwrap();
        assert_eq!(s.items[0], Some(ItemKind::OilCan));
        assert_eq!(s.entities.len(), 1);
    }

    #[test]
    fn spray_rules() {
        let mut s = arena(11);
        s.items[0] = Some(ItemKind::LubricantSpray);
        let mut twin = arena(11);
        assert_eq!(
            apply_action(
                &mut s,
                Action::Use {
                    slot: 0,
                    target: None
                }
            ),
            Err(InvalidMove("Ninguna pieza tiene óxido.".to_string()))
        );
        assert_eq!((s.turn, s.items[0]), (0, Some(ItemKind::LubricantSpray)));
        assert_eq!(s.rng.random::<u64>(), twin.rng.random::<u64>());
        s.body.legs.corrosion = 5;
        s.body.arms.corrosion = 30;
        s.body.core.corrosion = 50;
        // El target se ignora.
        let ev = apply_action(
            &mut s,
            Action::Use {
                slot: 0,
                target: Some(Slot::Legs),
            },
        )
        .unwrap();
        assert!(ev.contains(&Event::ItemUsed));
        assert_eq!(
            [
                s.body.legs.corrosion,
                s.body.arms.corrosion,
                s.body.sensors.corrosion,
                s.body.core.corrosion
            ],
            [0, 20, 0, 40]
        );
        assert_eq!(s.items[0], None);
        assert!(s
            .log
            .contains(&"Rocías el spray lubricante. Todas las piezas −10.".to_string()));
    }

    #[test]
    fn grease_blocks_all_corrosion_for_10_turns() {
        // Regla: `use` fija 10; end_turn baja 1 DESPUÉS de las comprobaciones de
        // corrosión del turno. Protegen el turno del uso y los 9 siguientes (10 en
        // total); el turno 11 vuelve el óxido.
        let mut s = arena(12);
        s.body.arms.corrosion = 80; // crítico: activaría la propagación del turno 5/10
        s.map.set(p(11, 10), Tile::Puddle);
        add_enemy(&mut s, EnemyKind::RustMite, 9, 10);
        s.items[0] = Some(ItemKind::ProtectiveGrease);
        let snapshot = s.body.clone();
        let ev = apply_action(
            &mut s,
            Action::Use {
                slot: 0,
                target: None,
            },
        )
        .unwrap();
        assert!(ev.contains(&Event::ItemUsed));
        assert!(s
            .log
            .contains(&"Te untas grasa protectora: 10 turnos sin óxido.".to_string()));
        assert!(s.log.contains(
            &"El ácaro de óxido te muerde. La grasa protectora evita el óxido.".to_string()
        ));
        for turn in 1..=10 {
            if turn > 1 {
                let act = if turn == 2 {
                    Action::Move { dir: Dir::Right }
                } else {
                    Action::Wait
                };
                let ev = apply_action(&mut s, act).unwrap();
                assert!(!ev.contains(&Event::PartDegraded), "turno {turn}");
                if turn == 2 {
                    assert!(!s.log.contains(&"Pisas un charco.".to_string()));
                }
            }
            assert_eq!(s.body, snapshot, "turno {turn}");
            assert_eq!(s.turn, turn);
        }
        assert_eq!(s.player, p(11, 10));
        assert_eq!(s.grease_turns, 0);
        let ev = apply_action(&mut s, Action::Wait).unwrap();
        assert!(ev.contains(&Event::PartDegraded));
        assert_ne!(s.body, snapshot);
    }

    #[test]
    fn grease_resets_to_10() {
        let mut s = arena(12);
        s.items[0] = Some(ItemKind::ProtectiveGrease);
        s.items[1] = Some(ItemKind::ProtectiveGrease);
        let use_ = |slot| Action::Use { slot, target: None };
        apply_action(&mut s, use_(0)).unwrap();
        apply_action(&mut s, Action::Wait).unwrap();
        assert_eq!(s.grease_turns, 8);
        apply_action(&mut s, use_(1)).unwrap();
        assert_eq!(s.grease_turns, 9);
    }

    #[test]
    fn spring_jumps_when_charged() {
        let mut s = arena(13);
        set_legs(&mut s, PartModel::Spring, 0);
        let ev = apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
        assert_eq!(ev, vec![Event::PlayerMoved, Event::PlayerJumped]);
        assert_eq!(s.player, p(12, 10));
        assert!(s
            .log
            .contains(&"Saltas dos casillas con las piernas de resorte.".to_string()));
        // 10 al saltar y baja 1 en el mismo turno.
        assert_eq!(s.jump_cooldown, 9);
    }

    #[test]
    fn spring_attacks_if_enemy_adjacent() {
        let mut s = arena(13);
        set_legs(&mut s, PartModel::Spring, 0);
        add_enemy(&mut s, EnemyKind::Drone, 11, 10);
        let ev = apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
        assert!(ev.contains(&Event::EnemyHit) && !ev.contains(&Event::PlayerJumped));
        assert_eq!((s.player, s.jump_cooldown), (p(10, 10), 0));
    }

    #[test]
    fn spring_moves_one_if_second_tile_blocked() {
        for blocker in ["wall", "enemy"] {
            let mut s = arena(13);
            set_legs(&mut s, PartModel::Spring, 0);
            if blocker == "wall" {
                s.map.set(p(12, 10), Tile::Wall);
            } else {
                add_enemy(&mut s, EnemyKind::Turret, 12, 10);
            }
            let ev = apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
            assert!(!ev.contains(&Event::PlayerJumped), "{blocker}");
            assert_eq!(s.player, p(11, 10), "{blocker}");
            assert_eq!(s.jump_cooldown, 0, "{blocker}");
        }
    }

    #[test]
    fn spring_jump_only_counts_landing_puddle() {
        let mut s = arena(13);
        set_legs(&mut s, PartModel::Spring, 0);
        s.map.set(p(11, 10), Tile::Puddle);
        let ev = apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
        assert!(!ev.contains(&Event::PartDegraded));
        assert_eq!(s.body.legs.corrosion, 0);
        let mut t = arena(13);
        set_legs(&mut t, PartModel::Spring, 0);
        t.map.set(p(12, 10), Tile::Puddle);
        let ev = apply_action(&mut t, Action::Move { dir: Dir::Right }).unwrap();
        assert!(ev.contains(&Event::PartDegraded));
        // 3 × 1.5 de resistencia, redondeado.
        assert_eq!(t.body.legs.corrosion, 5);
    }

    #[test]
    fn spring_cooldown_10() {
        let mut s = arena(14);
        set_legs(&mut s, PartModel::Spring, 0);
        apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
        assert_eq!(s.player, p(12, 10));
        for _ in 2..=9 {
            apply_action(&mut s, Action::Wait).unwrap();
        }
        assert_eq!(s.jump_cooldown, 1);
        // Turno 10: aún sin carga, se mueve una casilla.
        apply_action(&mut s, Action::Move { dir: Dir::Left }).unwrap();
        assert_eq!(s.player, p(11, 10));
        assert_eq!(s.jump_cooldown, 0);
        // Turno 11: salta de nuevo.
        let ev = apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
        assert!(ev.contains(&Event::PlayerJumped));
        assert_eq!(s.player, p(13, 10));
    }

    #[test]
    fn blocked_spring_never_jumps() {
        let mut s = arena(15);
        set_legs(&mut s, PartModel::Spring, 100);
        assert_eq!(traits::try_jump(&s, Dir::Right, p(11, 10)), None);
        set_legs(&mut s, PartModel::Spring, 99);
        assert_eq!(traits::try_jump(&s, Dir::Right, p(11, 10)), Some(p(12, 10)));
        set_legs(&mut s, PartModel::Spring, 0);
        s.jump_cooldown = 1;
        assert_eq!(traits::try_jump(&s, Dir::Right, p(11, 10)), None);
        for seed in 0..30 {
            let mut s = arena(seed);
            set_legs(&mut s, PartModel::Spring, 100);
            let ev = apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
            assert!(!ev.contains(&Event::PlayerJumped));
            assert!(s.player.x <= 11);
        }
    }

    #[test]
    fn tracked_ignore_puddles() {
        for corrosion in [0, 100] {
            let mut moved = 0;
            for seed in 0..30 {
                let mut s = arena(seed);
                set_legs(&mut s, PartModel::Tracked, corrosion);
                s.map.set(p(11, 10), Tile::Puddle);
                let ev = apply_action(&mut s, Action::Move { dir: Dir::Right }).unwrap();
                assert!(!ev.contains(&Event::PartDegraded));
                assert_eq!(s.body.legs.corrosion, corrosion);
                assert_eq!(s.body.core.corrosion, 0);
                assert!(!s.log.contains(&"Pisas un charco.".to_string()));
                moved += usize::from(s.player == p(11, 10));
            }
            assert!(moved > 0, "corrosión {corrosion}");
        }
    }

    #[test]
    fn magnetic_pulls_items_within_3() {
        let mut s = arena(16);
        s.body.arms = Part {
            model: PartModel::Magnetic,
            corrosion: 0,
        };
        add_item(&mut s, 13, 10);
        add_item(&mut s, 14, 10);
        add_part(&mut s, p(10, 7), Slot::Arms, PartModel::Drill, 20);
        add_item(&mut s, 11, 11);
        // Detrás de un muro: no es visible, no se atrae.
        s.map.set(p(8, 10), Tile::Wall);
        add_item(&mut s, 7, 10);
        refresh_vision(&mut s);
        apply_action(&mut s, Action::Wait).unwrap();
        // Cada uno avanza una casilla (Chebyshev) hacia el robot; los lejanos y los
        // ocultos tras el muro se quedan.
        let dists: Vec<i32> = s.entities.iter().map(|e| cheb(e.pos, s.player)).collect();
        assert_eq!(dists, vec![2, 4, 2, 0, 3]);
        // Con los brazos bloqueados no atraen.
        let mut b = arena(16);
        b.body.arms = Part {
            model: PartModel::Magnetic,
            corrosion: 100,
        };
        add_item(&mut b, 13, 10);
        apply_action(&mut b, Action::Wait).unwrap();
        assert!(b.entities.iter().any(|e| e.pos == p(13, 10)));
        let mut c = arena(16);
        add_item(&mut c, 13, 10);
        apply_action(&mut c, Action::Wait).unwrap();
        assert!(c.entities.iter().any(|e| e.pos == p(13, 10)));
    }

    #[test]
    fn thermal_detects_through_walls_only_enemies() {
        let mut s = arena(17);
        for y in 5..15 {
            s.map.set(p(12, y), Tile::Wall);
        }
        let near = add_enemy(&mut s, EnemyKind::Turret, 14, 10);
        let far = add_enemy(&mut s, EnemyKind::Turret, 20, 10);
        add_item(&mut s, 14, 12);
        refresh_vision(&mut s);
        let get = |s: &GameState, id| s.entities.iter().find(|e| e.id == id).unwrap().clone();
        assert!(!s.visible[10][14]);
        assert!(!s.detected(&get(&s, near)));
        s.body.sensors.model = PartModel::Thermal;
        assert!(s.detected(&get(&s, near)));
        assert!(!s.detected(&get(&s, far)), "fuera del radio de visión");
        let item = s.entities.iter().find(|e| e.pos == p(14, 12)).unwrap();
        assert!(!s.detected(item));
        s.body.sensors.corrosion = 100;
        assert!(!s.detected(&get(&s, near)));
    }

    #[test]
    fn long_range_sees_further() {
        let mut s = arena(18);
        s.player = p(6, 10);
        refresh_vision(&mut s);
        assert!(!s.visible[10][15]);
        s.body.sensors.model = PartModel::LongRange;
        refresh_vision(&mut s);
        assert!(s.visible[10][15]);
        s.body.sensors.corrosion = 100;
        refresh_vision(&mut s);
        assert!(!s.visible[10][15] && !s.visible[10][8]);
    }
}
