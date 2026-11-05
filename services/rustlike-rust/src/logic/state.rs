// Estado completo de una partida: piso, mapa, visión, puntaje y registro.
use super::combat::item_at;
use super::corrosion::{Body, PartModel};
use super::entities::{Entity, EntityKind, ItemKind};
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
    /// Turnos que faltan para que el resorte pueda saltar otra vez.
    pub jump_cooldown: u32,
    /// Turnos restantes de inmunidad a la corrosión por la grasa protectora.
    pub grease_turns: u32,
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

    /// Si el jugador detecta a la entidad con sus sensores térmicos sin verla.
    pub fn detected(&self, e: &Entity) -> bool {
        let dx = e.pos.x - self.player.x;
        let dy = e.pos.y - self.player.y;
        let radius = self.body.vision_radius();
        matches!(e.kind, EntityKind::Enemy(_))
            && self.body.sensors.has_trait(PartModel::Thermal)
            && dx * dx + dy * dy <= radius * radius
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
        let on_part = self
            .entities
            .iter()
            .any(|e| e.pos == self.player && matches!(e.kind, EntityKind::Part { .. }));
        if on_part {
            actions.push("swap");
        }
        if self.items.iter().any(Option::is_some) {
            actions.push("use");
        }
        actions
    }
}
