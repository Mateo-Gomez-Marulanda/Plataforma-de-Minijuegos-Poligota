// Búsqueda de caminos por BFS en 8 direcciones para los enemigos.
use super::map::{Map, Pos};
use std::collections::VecDeque;

/// Primera casilla del camino más corto de `from` a `to`, o `None` si no hay dentro de `max_depth`.
pub fn next_step(
    map: &Map,
    from: Pos,
    to: Pos,
    blocked: impl Fn(Pos) -> bool,
    max_depth: u32,
) -> Option<Pos> {
    if from == to {
        return None;
    }
    let (w, h) = (map.width, map.height);
    let idx = |p: Pos| p.y as usize * w + p.x as usize;
    // Para cada casilla visitada guarda la primera casilla del camino hacia ella.
    let mut first: Vec<Option<Pos>> = vec![None; w * h];
    let mut visited = vec![false; w * h];
    visited[idx(from)] = true;
    let mut queue = VecDeque::new();
    queue.push_back((from, 0u32));
    while let Some((cur, depth)) = queue.pop_front() {
        if depth >= max_depth {
            continue;
        }
        for dy in -1..=1 {
            for dx in -1..=1 {
                let next = Pos {
                    x: cur.x + dx,
                    y: cur.y + dy,
                };
                if (dx == 0 && dy == 0) || !map.in_bounds(next) || visited[idx(next)] {
                    continue;
                }
                if !map.is_walkable(next) || (next != to && blocked(next)) {
                    continue;
                }
                visited[idx(next)] = true;
                let step = if cur == from { next } else { first[idx(cur)]? };
                if next == to {
                    return Some(step);
                }
                first[idx(next)] = Some(step);
                queue.push_back((next, depth + 1));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logic::map::Tile;

    fn open(w: usize, h: usize) -> Map {
        let mut m = Map::filled(w, h, Tile::Wall);
        for y in 1..h as i32 - 1 {
            for x in 1..w as i32 - 1 {
                m.set(Pos { x, y }, Tile::Floor);
            }
        }
        m
    }
    fn p(x: i32, y: i32) -> Pos {
        Pos { x, y }
    }

    #[test]
    fn next_step_goes_around_wall() {
        let mut m = open(9, 7);
        for y in 1..5 {
            m.set(p(4, y), Tile::Wall);
        }
        // El muro obliga a subir o bajar; el paso inicial es válido y alcanza la meta.
        let mut cur = p(2, 2);
        for _ in 0..20 {
            if cur == p(6, 2) {
                break;
            }
            cur = next_step(&m, cur, p(6, 2), |_| false, 50).unwrap();
            assert!(m.is_walkable(cur));
        }
        assert_eq!(cur, p(6, 2));
        assert_eq!(next_step(&m, p(2, 3), p(3, 3), |_| false, 5), Some(p(3, 3)));
    }

    #[test]
    fn next_step_respects_blocked() {
        let m = open(7, 5);
        let step = next_step(&m, p(1, 2), p(5, 2), |q| q == p(2, 2), 20).unwrap();
        assert_ne!(step, p(2, 2));
        // La meta ocupada sigue permitida.
        assert_eq!(
            next_step(&m, p(1, 2), p(2, 2), |q| q == p(2, 2), 5),
            Some(p(2, 2))
        );
    }

    #[test]
    fn next_step_none_when_unreachable() {
        let mut m = open(9, 5);
        for y in 0..5 {
            m.set(p(4, y), Tile::Wall);
        }
        assert_eq!(next_step(&m, p(1, 2), p(7, 2), |_| false, 50), None);
    }

    #[test]
    fn next_step_depth_limit() {
        let m = open(12, 5);
        assert!(next_step(&m, p(1, 2), p(9, 2), |_| false, 8).is_some());
        assert_eq!(next_step(&m, p(1, 2), p(9, 2), |_| false, 7), None);
    }
}
