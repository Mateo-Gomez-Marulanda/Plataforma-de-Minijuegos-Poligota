// Estado completo de una partida: piso, mapa, visión, puntaje y registro.
use super::combat::item_at;
use super::corrosion::Body;
use super::entities::{Entity, ItemKind};
use super::map::zones::Zone;
use super::map::{Map, Pos, Tile};
use rand::rngs::StdRng;

/// Situación general de la partida.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Playing,
    Won,
    Lost,
}

impl Status {
    /// Identificador del estado tal como lo ve el cliente.
    pub fn id(self) -> &'static str {
        match self {
            Status::Playing => "playing",
            Status::Won => "won",
            Status::Lost => "lost",
        }
    }
}

/// Partida en curso; `StdRng` no es `Clone`, así que se modifica en el sitio.
pub struct GameState {
    pub seed: u64,
    pub floor: u8,
    pub zone: Zone,
    pub turn: u32,
    pub map: Map,
    pub stairs: Option<Pos>,
    pub player: Pos,
    pub seen: Vec<Vec<bool>>,
    pub visible: Vec<Vec<bool>>,
    pub status: Status,
    pub log: Vec<String>,
    pub score: u32,
    pub body: Body,
    pub entities: Vec<Entity>,
    pub next_id: u32,
    pub items: [Option<ItemKind>; 3],
    pub rng: StdRng,
}

impl GameState {
    /// Casilla conocida por el jugador; `None` si nunca se vio.
    pub fn known_tile(&self, pos: Pos) -> Option<Tile> {
        if self.map.in_bounds(pos) && self.seen[pos.y as usize][pos.x as usize] {
            Some(self.map.get(pos))
        } else {
            None
        }
    }

    /// Acciones que el jugador puede intentar ahora.
    pub fn allowed_actions(&self) -> Vec<&'static str> {
        let mut actions = vec!["move", "wait"];
        if self.map.get(self.player) == Tile::Stairs {
            actions.push("descend");
        }
        if item_at(&self.entities, self.player).is_some() && self.items.iter().any(Option::is_none)
        {
            actions.push("pick");
        }
        if self.items.iter().any(Option::is_some) {
            actions.push("use");
        }
        actions
    }
}
