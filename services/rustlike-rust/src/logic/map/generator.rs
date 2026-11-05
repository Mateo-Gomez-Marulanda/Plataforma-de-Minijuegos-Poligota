// Generador de pisos: habitaciones rectangulares sin solaparse unidas por pasillos en L.
use super::zones::Zone;
use super::{Level, Map, Pos, Tile};
use rand::rngs::StdRng;
use rand::RngExt;

const MAX_ATTEMPTS: usize = 80;
const MAX_ROOMS: usize = 12;
const LAST_FLOOR: u8 = 255;
const MAX_PUDDLE_ATTEMPTS: usize = 200;

/// Habitación rectangular (esquina superior izquierda y tamaño).
#[derive(Debug, Clone)]
pub struct Room {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Room {
    /// Centro de la habitación.
    pub fn center(&self) -> Pos {
        Pos {
            x: self.x + self.w / 2,
            y: self.y + self.h / 2,
        }
    }

    /// Indica si este rectángulo, agrandado 1 casilla por lado, se cruza con otro.
    fn touches(&self, other: &Room) -> bool {
        self.x - 1 < other.x + other.w + 1
            && other.x - 1 < self.x + self.w + 1
            && self.y - 1 < other.y + other.h + 1
            && other.y - 1 < self.y + self.h + 1
    }
}

/// Intenta colocar habitaciones aleatorias sin solapamiento.
fn place_rooms(width: usize, height: usize, rng: &mut StdRng) -> Vec<Room> {
    let mut rooms: Vec<Room> = Vec::new();
    for _ in 0..MAX_ATTEMPTS {
        if rooms.len() >= MAX_ROOMS {
            break;
        }
        let w = rng.random_range(5..=12);
        let h = rng.random_range(4..=8);
        let x = rng.random_range(1..width as i32 - w - 1);
        let y = rng.random_range(1..height as i32 - h - 1);
        let room = Room { x, y, w, h };
        if rooms.iter().all(|r| !room.touches(r)) {
            rooms.push(room);
        }
    }
    rooms
}

/// Talla el interior de una habitación como suelo.
fn carve_room(map: &mut Map, room: &Room) {
    for y in room.y..room.y + room.h {
        for x in room.x..room.x + room.w {
            map.set(Pos { x, y }, Tile::Floor);
        }
    }
}

/// Talla un tramo horizontal de pasillo.
fn carve_h(map: &mut Map, x1: i32, x2: i32, y: i32) {
    for x in x1.min(x2)..=x1.max(x2) {
        map.set(Pos { x, y }, Tile::Floor);
    }
}

/// Talla un tramo vertical de pasillo.
fn carve_v(map: &mut Map, y1: i32, y2: i32, x: i32) {
    for y in y1.min(y2)..=y1.max(y2) {
        map.set(Pos { x, y }, Tile::Floor);
    }
}

/// Une dos puntos con un pasillo en L, eligiendo al azar el sentido del codo.
fn carve_corridor(map: &mut Map, a: Pos, b: Pos, rng: &mut StdRng) {
    if rng.random_bool(0.5) {
        carve_h(map, a.x, b.x, a.y);
        carve_v(map, a.y, b.y, b.x);
    } else {
        carve_v(map, a.y, b.y, a.x);
        carve_h(map, a.x, b.x, b.y);
    }
}

/// Reparte entre 4 y 6 charcos en casillas de suelo de habitaciones al azar, sin tocar inicio ni escalera.
fn place_puddles(map: &mut Map, rooms: &[Room], start: Pos, rng: &mut StdRng) {
    let count = rng.random_range(4..=6);
    let mut placed = 0;
    for _ in 0..MAX_PUDDLE_ATTEMPTS {
        if placed >= count {
            break;
        }
        let room = &rooms[rng.random_range(0..rooms.len())];
        let pos = Pos {
            x: rng.random_range(room.x..room.x + room.w),
            y: rng.random_range(room.y..room.y + room.h),
        };
        // Solo suelo libre: excluye escalera y charcos ya puestos.
        if pos != start && map.get(pos) == Tile::Floor {
            map.set(pos, Tile::Puddle);
            placed += 1;
        }
    }
}

/// Genera el piso indicado de forma determinista según el estado de `rng`.
pub fn generate(floor: u8, rng: &mut StdRng) -> Level {
    let (width, height) = Zone::for_floor(floor).size();
    // Se repite hasta tener al menos 2 habitaciones (casi nunca hace falta).
    let rooms = loop {
        let rooms = place_rooms(width, height, rng);
        if rooms.len() >= 2 {
            break rooms;
        }
    };

    let mut map = Map::filled(width, height, Tile::Wall);
    for room in &rooms {
        carve_room(&mut map, room);
    }
    for i in 1..rooms.len() {
        carve_corridor(&mut map, rooms[i - 1].center(), rooms[i].center(), rng);
    }

    let start = rooms[0].center();
    let stairs = if floor == LAST_FLOOR {
        None
    } else {
        let pos = rooms[rooms.len() - 1].center();
        map.set(pos, Tile::Stairs);
        Some(pos)
    };
    // Los charcos van al final para no alterar la disposición de habitaciones de una semilla.
    place_puddles(&mut map, &rooms, start, rng);
    Level {
        map,
        start,
        stairs,
        rooms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use std::collections::{HashSet, VecDeque};

    fn rng(seed: u64) -> StdRng {
        StdRng::seed_from_u64(seed)
    }

    fn count_stairs(map: &Map) -> usize {
        let mut n = 0;
        for y in 0..map.height as i32 {
            for x in 0..map.width as i32 {
                if map.get(Pos { x, y }) == Tile::Stairs {
                    n += 1;
                }
            }
        }
        n
    }

    // BFS en 8 direcciones por casillas transitables.
    fn reachable(map: &Map, from: Pos, to: Pos) -> bool {
        let mut seen = HashSet::from([from]);
        let mut queue = VecDeque::from([from]);
        while let Some(p) = queue.pop_front() {
            if p == to {
                return true;
            }
            for dy in -1..=1 {
                for dx in -1..=1 {
                    let n = Pos {
                        x: p.x + dx,
                        y: p.y + dy,
                    };
                    if map.is_walkable(n) && seen.insert(n) {
                        queue.push_back(n);
                    }
                }
            }
        }
        false
    }

    #[test]
    fn same_seed_same_level() {
        let a = generate(1, &mut rng(42));
        let b = generate(1, &mut rng(42));
        assert_eq!(a.map, b.map);
        assert_eq!(a.start, b.start);
        assert_eq!(a.stairs, b.stairs);
    }

    #[test]
    fn different_seeds_differ() {
        assert_ne!(generate(1, &mut rng(1)).map, generate(1, &mut rng(2)).map);
    }

    #[test]
    fn level_has_zone_size() {
        let l1 = generate(1, &mut rng(3));
        assert_eq!((l1.map.width, l1.map.height), (60, 30));
        let l60 = generate(60, &mut rng(3));
        assert_eq!((l60.map.width, l60.map.height), (56, 28));
    }

    #[test]
    fn border_is_wall() {
        let map = generate(1, &mut rng(5)).map;
        for y in 0..map.height as i32 {
            for x in 0..map.width as i32 {
                if x == 0 || y == 0 || x == map.width as i32 - 1 || y == map.height as i32 - 1 {
                    assert_eq!(map.get(Pos { x, y }), Tile::Wall);
                }
            }
        }
    }

    #[test]
    fn stairs_reachable_and_apart() {
        for seed in 0..300 {
            let level = generate(1, &mut rng(seed));
            let stairs = level.stairs.expect("debe haber escalera");
            assert_ne!(stairs, level.start, "seed {seed}");
            assert_eq!(level.map.get(level.start), Tile::Floor, "seed {seed}");
            assert_eq!(level.map.get(stairs), Tile::Stairs, "seed {seed}");
            assert!(reachable(&level.map, level.start, stairs), "seed {seed}");
        }
    }

    #[test]
    fn level_exposes_rooms() {
        for seed in 0..50 {
            let level = generate(1, &mut rng(seed));
            assert!(level.rooms.len() >= 2, "seed {seed}");
            assert_eq!(level.start, level.rooms[0].center(), "seed {seed}");
            assert_eq!(
                level.stairs,
                level.rooms.last().map(|r| r.center()),
                "seed {seed}"
            );
        }
    }

    #[test]
    fn exactly_one_stairs() {
        for floor in 1..=254u8 {
            let level = generate(floor, &mut rng(7));
            assert_eq!(count_stairs(&level.map), 1, "piso {floor}");
        }
    }

    #[test]
    fn last_floor_has_no_stairs() {
        let level = generate(255, &mut rng(7));
        assert_eq!(level.stairs, None);
        assert_eq!(count_stairs(&level.map), 0);
    }

    fn puddles(level: &Level) -> Vec<Pos> {
        let mut out = Vec::new();
        for y in 0..level.map.height as i32 {
            for x in 0..level.map.width as i32 {
                if level.map.get(Pos { x, y }) == Tile::Puddle {
                    out.push(Pos { x, y });
                }
            }
        }
        out
    }

    #[test]
    fn puddles_per_floor() {
        for seed in 0..100 {
            let n = puddles(&generate(1, &mut rng(seed))).len();
            assert!((4..=6).contains(&n), "seed {seed}: {n} charcos");
        }
        assert!((4..=6).contains(&puddles(&generate(255, &mut rng(7))).len()));
    }

    #[test]
    fn puddles_avoid_start_and_stairs() {
        for seed in 0..100 {
            let level = generate(1, &mut rng(seed));
            for p in puddles(&level) {
                assert_ne!(p, level.start, "seed {seed}");
                assert_ne!(Some(p), level.stairs, "seed {seed}");
            }
        }
    }

    #[test]
    fn puddles_are_inside_rooms() {
        for seed in 0..100 {
            let level = generate(1, &mut rng(seed));
            for p in puddles(&level) {
                assert!(
                    level
                        .rooms
                        .iter()
                        .any(|r| p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h),
                    "seed {seed}"
                );
            }
        }
    }
}
