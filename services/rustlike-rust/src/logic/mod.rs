// Lógica pura del juego, sin dependencias de red: partida nueva y aplicación de acciones.
pub mod action;
pub mod fov;
pub mod map;
pub mod score;
pub mod state;

pub use action::{Action, Dir, Event, InvalidMove};
pub use state::{GameState, Status};

use map::generator::generate;
use map::zones::Zone;
use rand::rngs::StdRng;
use rand::SeedableRng;

/// Radio de visión del robot (estado Óptimo).
pub const VISION_RADIUS: i32 = 8;
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
            state.player = dest;
            state.turn += 1;
            refresh_vision(state);
            Ok(vec![Event::PlayerMoved])
        }
        Action::Wait => {
            state.turn += 1;
            Ok(vec![])
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
    refresh_vision(state);
    push_log(state, format!("Bajas al piso {next}."));
    Ok(vec![Event::FloorDescended])
}

/// Recalcula la visión actual y acumula lo visto en `seen`.
fn refresh_vision(state: &mut GameState) {
    state.visible = fov::compute(&state.map, state.player, VISION_RADIUS);
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
            (255, 40),
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
}
