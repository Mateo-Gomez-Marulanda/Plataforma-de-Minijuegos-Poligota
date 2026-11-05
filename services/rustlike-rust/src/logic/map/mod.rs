// Tipos básicos del mapa: casillas, posiciones, cuadrícula y nivel generado.
pub mod generator;
pub mod zones;

/// Tipo de casilla del mapa.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tile {
    Wall,
    Floor,
    Stairs,
}

impl Tile {
    /// Identificador de la casilla tal como lo ve el cliente.
    pub fn id(self) -> &'static str {
        match self {
            Tile::Wall => "wall",
            Tile::Floor => "floor",
            Tile::Stairs => "stairs",
        }
    }
}

/// Posición en la cuadrícula (x columna, y fila).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Pos {
    pub x: i32,
    pub y: i32,
}

/// Cuadrícula rectangular de casillas.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Map {
    pub width: usize,
    pub height: usize,
    tiles: Vec<Tile>,
}

impl Map {
    /// Crea un mapa lleno de una misma casilla.
    pub fn filled(width: usize, height: usize, tile: Tile) -> Map {
        Map {
            width,
            height,
            tiles: vec![tile; width * height],
        }
    }

    /// Indica si la posición cae dentro del mapa.
    pub fn in_bounds(&self, pos: Pos) -> bool {
        pos.x >= 0 && pos.y >= 0 && (pos.x as usize) < self.width && (pos.y as usize) < self.height
    }

    /// Casilla en la posición; fuera de los límites cuenta como muro.
    pub fn get(&self, pos: Pos) -> Tile {
        if self.in_bounds(pos) {
            self.tiles[pos.y as usize * self.width + pos.x as usize]
        } else {
            Tile::Wall
        }
    }

    /// Cambia la casilla; ignora posiciones fuera de los límites.
    pub fn set(&mut self, pos: Pos, tile: Tile) {
        if self.in_bounds(pos) {
            self.tiles[pos.y as usize * self.width + pos.x as usize] = tile;
        }
    }

    /// Se puede pisar el suelo y la escalera.
    pub fn is_walkable(&self, pos: Pos) -> bool {
        matches!(self.get(pos), Tile::Floor | Tile::Stairs)
    }
}

/// Piso generado: mapa, punto de inicio, escalera (ausente en el último piso) y habitaciones.
#[derive(Debug, Clone)]
pub struct Level {
    pub map: Map,
    pub start: Pos,
    pub stairs: Option<Pos>,
    pub rooms: Vec<generator::Room>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn out_of_bounds_is_wall_and_not_walkable() {
        let map = Map::filled(3, 3, Tile::Floor);
        let outside = Pos { x: -1, y: 0 };
        assert!(!map.in_bounds(outside));
        assert_eq!(map.get(outside), Tile::Wall);
        assert!(!map.is_walkable(Pos { x: 3, y: 1 }));
    }

    #[test]
    fn set_and_get_roundtrip() {
        let mut map = Map::filled(4, 4, Tile::Wall);
        let p = Pos { x: 2, y: 1 };
        map.set(p, Tile::Stairs);
        assert_eq!(map.get(p), Tile::Stairs);
        assert!(map.is_walkable(p));
        assert_eq!(Tile::Stairs.id(), "stairs");
    }
}
