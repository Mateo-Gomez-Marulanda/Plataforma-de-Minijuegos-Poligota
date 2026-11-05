// Campo de visión por shadowcasting recursivo en 8 octantes.
// Los muros reciben luz (se ven) pero cortan el haz.
use super::map::{Map, Pos, Tile};

/// Calcula las casillas visibles desde `origin` hasta `radius`; indexado `[y][x]`.
pub fn compute(map: &Map, origin: Pos, radius: i32) -> Vec<Vec<bool>> {
    let mut grid = vec![vec![false; map.width]; map.height];
    mark(map, &mut grid, origin);
    for octant in 0..8 {
        scan(map, &mut grid, origin, radius, octant, 1, 1.0, 0.0);
    }
    grid
}

/// Marca una casilla como visible si está dentro del mapa.
fn mark(map: &Map, grid: &mut [Vec<bool>], p: Pos) {
    if map.in_bounds(p) {
        grid[p.y as usize][p.x as usize] = true;
    }
}

/// Convierte (fila, columna) del octante a un desplazamiento (dx, dy) del mapa.
fn transform(octant: u8, row: i32, col: i32) -> (i32, i32) {
    match octant {
        0 => (col, -row),
        1 => (row, -col),
        2 => (row, col),
        3 => (col, row),
        4 => (-col, row),
        5 => (-row, col),
        6 => (-row, -col),
        _ => (-col, -row),
    }
}

/// Barre un octante fila a fila entre dos pendientes, recursando al toparse con muros.
#[allow(clippy::too_many_arguments)]
fn scan(
    map: &Map,
    grid: &mut [Vec<bool>],
    origin: Pos,
    radius: i32,
    octant: u8,
    start_row: i32,
    mut start: f32,
    end: f32,
) {
    if start < end {
        return;
    }
    let mut new_start = start;
    let mut blocked = false;
    for row in start_row..=radius {
        if blocked {
            break;
        }
        let mut col = row;
        while col >= 0 {
            let l_slope = (col as f32 + 0.5) / (row as f32 - 0.5);
            let r_slope = (col as f32 - 0.5) / (row as f32 + 0.5);
            if start < r_slope {
                col -= 1;
                continue;
            }
            if end > l_slope {
                break;
            }
            let (dx, dy) = transform(octant, row, col);
            let p = Pos {
                x: origin.x + dx,
                y: origin.y + dy,
            };
            if dx * dx + dy * dy <= radius * radius {
                mark(map, grid, p);
            }
            let wall = map.get(p) == Tile::Wall;
            if blocked {
                if wall {
                    new_start = r_slope;
                } else {
                    blocked = false;
                    start = new_start;
                }
            } else if wall && row < radius {
                blocked = true;
                scan(map, grid, origin, radius, octant, row + 1, start, l_slope);
                new_start = r_slope;
            }
            col -= 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_room(w: usize, h: usize) -> Map {
        let mut m = Map::filled(w, h, Tile::Floor);
        for x in 0..w as i32 {
            m.set(Pos { x, y: 0 }, Tile::Wall);
            m.set(Pos { x, y: h as i32 - 1 }, Tile::Wall);
        }
        for y in 0..h as i32 {
            m.set(Pos { x: 0, y }, Tile::Wall);
            m.set(Pos { x: w as i32 - 1, y }, Tile::Wall);
        }
        m
    }

    fn vis(g: &[Vec<bool>], x: usize, y: usize) -> bool {
        g[y][x]
    }

    #[test]
    fn origin_is_visible() {
        let m = open_room(21, 21);
        let g = compute(&m, Pos { x: 10, y: 10 }, 8);
        assert!(vis(&g, 10, 10));
    }

    #[test]
    fn open_room_lights_circle() {
        let m = Map::filled(21, 21, Tile::Floor);
        let g = compute(&m, Pos { x: 10, y: 10 }, 8);
        assert!(vis(&g, 10, 2));
        assert!(vis(&g, 18, 10));
        assert!(!vis(&g, 10, 1));
        assert!(!vis(&g, 16, 16));
    }

    #[test]
    fn walls_are_visible_but_block() {
        let mut m = Map::filled(12, 3, Tile::Wall);
        for x in 1..5 {
            m.set(Pos { x, y: 1 }, Tile::Floor);
        }
        let g = compute(&m, Pos { x: 1, y: 1 }, 8);
        assert!(vis(&g, 5, 1));
        assert!(!vis(&g, 6, 1));
    }

    #[test]
    fn pillar_casts_shadow() {
        let mut m = Map::filled(21, 21, Tile::Floor);
        m.set(Pos { x: 12, y: 10 }, Tile::Wall);
        let g = compute(&m, Pos { x: 10, y: 10 }, 8);
        assert!(!vis(&g, 14, 10));
        assert!(vis(&g, 12, 9));
        assert!(vis(&g, 12, 10));
    }

    #[test]
    fn grid_has_map_shape() {
        let m = Map::filled(60, 30, Tile::Floor);
        let g = compute(&m, Pos { x: 5, y: 5 }, 8);
        assert_eq!(g.len(), 30);
        assert!(g.iter().all(|r| r.len() == 60));
    }
}
