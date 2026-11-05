// Lógica pura del juego, sin dependencias de red: partida nueva y aplicación de acciones.
pub mod action;
pub mod corrosion;
pub mod entities;
pub mod fov;
pub mod map;
pub mod pathfinding;
pub mod score;
pub mod spawn;
pub mod state;

pub use action::{Action, Dir, Event, InvalidMove};
pub use state::{GameState, Status};

use corrosion::{corrode, Body, Slot, HIT_SLOTS};
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
            let mut events = Vec::new();
            // La tirada solo ocurre si la jugada es válida y la probabilidad es positiva.
            let chance = state.body.legs.condition().legs_fail_chance();
            if chance > 0.0 && state.rng.random_bool(chance) {
                events.push(Event::PlayerStuck);
                push_log(
                    state,
                    "Tus piernas se traban. Pierdes el turno.".to_string(),
                );
            } else {
                state.player = dest;
                events.push(Event::PlayerMoved);
                if state.map.get(dest) == map::Tile::Puddle {
                    push_log(state, "Pisas un charco.".to_string());
                    apply_corrosion(state, Slot::Legs, 3, &mut events);
                }
            }
            state.turn += 1;
            end_turn(state, &mut events);
            Ok(events)
        }
        Action::Wait => {
            let mut events = Vec::new();
            state.turn += 1;
            end_turn(state, &mut events);
            Ok(events)
        }
        Action::Descend => descend(state),
    }
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
    state.score += score::points_for_floor(state.floor);
    state.floor = next;
    state.zone = Zone::for_floor(next);
    state.seen = vec![vec![false; level.map.width]; level.map.height];
    state.player = level.start;
    state.stairs = level.stairs;
    state.map = level.map;
    state.turn += 1;
    push_log(state, format!("Bajas al piso {next}."));
    let mut events = vec![Event::FloorDescended];
    end_turn(state, &mut events);
    Ok(events)
}

/// Aplica corrosión a una pieza, la anota en el registro y emite los eventos.
fn apply_corrosion(state: &mut GameState, slot: Slot, base: u32, events: &mut Vec<Event>) {
    let Some(hit) = corrode(&mut state.body, slot, base) else {
        return;
    };
    events.push(Event::PartDegraded);
    if hit.transferred {
        let text = format!(
            "{} ya {}: el óxido pasa al núcleo. Núcleo +{}.",
            slot.name(),
            blocked_word(slot).replace("bloquea", "están bloquea"),
            hit.amount
        );
        push_log(state, text);
    } else {
        push_log(state, format!("{} +{}.", hit.slot.name(), hit.amount));
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
    if core_gain > 0 && corrode(&mut state.body, Slot::Core, core_gain).is_some() {
        events.push(Event::PartDegraded);
    }
    check_core(state, events);
    refresh_vision(state);
}

/// Recalcula la visión actual y acumula lo visto en `seen`.
fn refresh_vision(state: &mut GameState) {
    state.visible = fov::compute(
        &state.map,
        state.player,
        state.body.sensors.condition().vision_radius(),
    );
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
        apply_corrosion(&mut s, Slot::Sensors, 5, &mut ev);
        assert!(s.log.contains(&"Sensores +2.".to_string()));
        assert!(s
            .log
            .contains(&"Sensores bloqueados por el óxido.".to_string()));
        apply_corrosion(&mut s, Slot::Sensors, 5, &mut ev);
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
        apply_corrosion(&mut s, Slot::Legs, 1, &mut ev);
        assert_eq!(s.log.last().unwrap(), "Piernas bloqueadas por el óxido.");
        apply_corrosion(&mut s, Slot::Legs, 4, &mut ev);
        assert_eq!(
            s.log.last().unwrap(),
            "Piernas ya están bloqueadas: el óxido pasa al núcleo. Núcleo +4."
        );
        s.body.part_mut(Slot::Arms).corrosion = 99;
        apply_corrosion(&mut s, Slot::Arms, 1, &mut ev);
        assert_eq!(s.log.last().unwrap(), "Brazos bloqueados por el óxido.");
    }
}
