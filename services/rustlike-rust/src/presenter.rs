// Convierte el estado de una partida en el JSON del contrato común.
use crate::logic::corrosion::Part;
use crate::logic::entities::{Entity, EntityKind};
use crate::logic::{Event, GameState};
use serde_json::{json, Value};

/// Pieza del robot tal como la ve el cliente.
fn part_json(p: &Part) -> Value {
    json!({"name": p.model.id(), "corrosion": p.corrosion, "condition": p.condition().id()})
}

/// Entidades en casillas visibles; el cliente no recibe las que no ve.
fn entities_json(s: &GameState) -> Vec<Value> {
    let seen = |e: &&Entity| s.visible[e.pos.y as usize][e.pos.x as usize];
    s.entities
        .iter()
        .filter(seen)
        .map(|e| match &e.kind {
            EntityKind::Enemy(en) if en.kind.indestructible() => json!({
                "id": e.id, "kind": en.kind.id(), "x": e.pos.x, "y": e.pos.y,
                "elite": null, "integrity": null, "maxIntegrity": null,
            }),
            EntityKind::Enemy(en) => json!({
                "id": e.id, "kind": en.kind.id(), "x": e.pos.x, "y": e.pos.y,
                "elite": null, "integrity": en.integrity, "maxIntegrity": en.max_integrity,
            }),
            EntityKind::Part { slot, part } => json!({
                "id": e.id, "kind": "part", "slot": slot.id(), "name": part.model.id(),
                "corrosion": part.corrosion, "x": e.pos.x, "y": e.pos.y,
            }),
            EntityKind::Item(k) => json!({"id": e.id, "kind": k.id(), "x": e.pos.x, "y": e.pos.y}),
        })
        .collect()
}

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
            "entities": entities_json(s),
            "items": s.items.iter().map(|i| i.map(|k| k.id())).collect::<Vec<_>>(),
            "log": s.log,
            "events": event_ids,
            "allowedActions": s.allowed_actions(),
            "score": s.score,
            "parts": {
                "legs": part_json(&s.body.legs),
                "arms": part_json(&s.body.arms),
                "sensors": part_json(&s.body.sensors),
                "core": part_json(&s.body.core),
            },
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logic::corrosion::{Part, PartModel, Slot};
    use crate::logic::entities::{Entity, EntityKind};
    use crate::logic::{new_game, GameState};

    /// Partida con una sola entidad colocada sobre una casilla visible.
    fn with_entity(kind: EntityKind) -> (GameState, u32) {
        let mut s = new_game(1);
        s.entities.clear();
        let id = 77;
        s.entities.push(Entity {
            id,
            pos: s.player,
            kind,
        });
        (s, id)
    }

    #[test]
    fn part_entity_shape() {
        let part = Part {
            model: PartModel::Drill,
            corrosion: 40,
        };
        let (s, id) = with_entity(EntityKind::Part {
            slot: Slot::Arms,
            part,
        });
        let v = present("abc123", &s, &[]);
        assert_eq!(
            v["data"]["entities"][0],
            json!({"id": id, "kind": "part", "slot": "arms", "name": "drill",
                   "corrosion": 40, "x": s.player.x, "y": s.player.y})
        );
    }

    #[test]
    fn leak_entity_has_null_integrity() {
        use crate::logic::entities::{Enemy, EnemyKind};
        let (s, _) = with_entity(EntityKind::Enemy(Enemy::new(EnemyKind::Leak, 1)));
        let e = &present("abc123", &s, &[])["data"]["entities"][0];
        assert_eq!(e["kind"], "leak");
        assert!(e["integrity"].is_null() && e["maxIntegrity"].is_null());
    }
}
