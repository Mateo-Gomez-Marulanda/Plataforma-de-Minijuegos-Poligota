// Convierte el estado de una partida en el JSON del contrato común.
use crate::logic::{Event, GameState};
use serde_json::{json, Value};

/// Construye la respuesta; las casillas nunca vistas salen como "unknown".
pub fn present(id: &str, s: &GameState, events: &[Event]) -> Value {
    let board: Vec<Vec<&str>> = (0..s.map.height)
        .map(|y| {
            (0..s.map.width)
                .map(|x| {
                    let pos = crate::logic::map::Pos {
                        x: x as i32,
                        y: y as i32,
                    };
                    s.known_tile(pos).map_or("unknown", |t| t.id())
                })
                .collect()
        })
        .collect();
    let event_ids: Vec<&str> = events.iter().map(|e| e.id()).collect();
    json!({
        "id": id,
        "game": "rustlike",
        "status": s.status.id(),
        "message": null,
        "board": board,
        "data": {
            "floor": s.floor,
            "zone": s.zone.id(),
            "turn": s.turn,
            "seed": s.seed,
            "width": s.map.width,
            "height": s.map.height,
            "player": {"x": s.player.x, "y": s.player.y},
            "visible": s.visible,
            "entities": [],
            "log": s.log,
            "events": event_ids,
            "allowedActions": s.allowed_actions(),
            "score": s.score,
        }
    })
}
