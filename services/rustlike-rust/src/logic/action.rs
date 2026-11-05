// Acciones del jugador, direcciones, eventos del turno y el error de jugada inválida.
use super::corrosion::Slot;
use serde::Deserialize;

/// Acción que el jugador puede pedir en su turno.
#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Move { dir: Dir },
    Wait,
    Descend,
    Pick,
    Swap,
    Use { slot: u8, target: Option<Slot> },
}

/// Una de las ocho direcciones de movimiento.
#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Dir {
    Up,
    Down,
    Left,
    Right,
    UpLeft,
    UpRight,
    DownLeft,
    DownRight,
}

impl Dir {
    /// Desplazamiento (dx, dy) de la dirección; `Up` es `(0, -1)`.
    pub fn delta(self) -> (i32, i32) {
        match self {
            Dir::Up => (0, -1),
            Dir::Down => (0, 1),
            Dir::Left => (-1, 0),
            Dir::Right => (1, 0),
            Dir::UpLeft => (-1, -1),
            Dir::UpRight => (1, -1),
            Dir::DownLeft => (-1, 1),
            Dir::DownRight => (1, 1),
        }
    }
}

/// Suceso ocurrido en un turno, usado por el cliente para animaciones.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    PlayerMoved,
    PlayerJumped,
    PartSwapped,
    FloorDescended,
    PlayerStuck,
    PartDegraded,
    PartBlocked,
    EnemyHit,
    EnemyDestroyed,
    PlayerHit,
    ItemPicked,
    ItemUsed,
    GameOver,
}

impl Event {
    /// Identificador del evento tal como lo recibe el cliente.
    pub fn id(self) -> &'static str {
        match self {
            Event::PlayerMoved => "player_moved",
            Event::PlayerJumped => "player_jumped",
            Event::PartSwapped => "part_swapped",
            Event::FloorDescended => "floor_descended",
            Event::PlayerStuck => "player_stuck",
            Event::PartDegraded => "part_degraded",
            Event::PartBlocked => "part_blocked",
            Event::EnemyHit => "enemy_hit",
            Event::EnemyDestroyed => "enemy_destroyed",
            Event::PlayerHit => "player_hit",
            Event::ItemPicked => "item_picked",
            Event::ItemUsed => "item_used",
            Event::GameOver => "game_over",
        }
    }
}

/// Jugada que las reglas no permiten, con el motivo para el jugador.
#[derive(Debug, PartialEq, Eq)]
pub struct InvalidMove(pub String);
