// Convierte el estado de una partida en el JSON del contrato común.
use crate::logic::corrosion::{Part, PartModel};
use crate::logic::entities::{Entity, EntityKind};
use crate::logic::{Event, GameState};
use serde_json::{json, Value};

/// Pieza del robot tal como la ve el cliente.
fn part_json(p: &Part) -> Value {
    json!({"name": p.model.id(), "corrosion": p.corrosion, "condition": p.condition().id()})
}

/// Entidades en casillas visibles; el cliente no recibe las que no ve.
fn entities_json(s: &GameState) -> Vec<Value> {
    let shown = |e: &&Entity| s.visible[e.pos.y as usize][e.pos.x as usize] || s.detected(e);
    s.entities
        .iter()
        .filter(shown)
        .map(|e| (e, s.visible[e.pos.y as usize][e.pos.x as usize]))
        .map(|(e, visible)| {
            (
                visible,
                match &e.kind {
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
                    EntityKind::Item(k) => {
                        json!({"id": e.id, "kind": k.id(), "x": e.pos.x, "y": e.pos.y})
                    }
                },
            )
        })
        .map(|(visible, mut v)| {
            // Lo que solo detectan los sensores térmicos va marcado.
            if !visible {
                v["detected"] = json!(true);
            }
            v
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
            "effects": {
                "grease": s.grease_turns,
                "jumpCooldown": if s.body.legs.has_trait(PartModel::Spring) {
                    json!(s.jump_cooldown)
                } else {
                    Value::Null
                },
            },
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
    fn thermal_marks_detected_enemies_only() {
        use crate::logic::entities::{Enemy, EnemyKind, ItemKind};
        use crate::logic::map::{Pos, Tile};
        let mut s = new_game(1);
        s.entities.clear();
        // Muro entre el robot y un punto del mismo suelo: casilla no visible.
        let hidden = (0..s.map.height as i32)
            .flat_map(|y| (0..s.map.width as i32).map(move |x| Pos { x, y }))
            .find(|p| {
                s.map.get(*p) != Tile::Wall
                    && !s.visible[p.y as usize][p.x as usize]
                    && (p.x - s.player.x).pow(2) + (p.y - s.player.y).pow(2) <= 64
            })
            .expect("casilla oculta cercana");
        for (id, kind) in [
            (1, EntityKind::Enemy(Enemy::new(EnemyKind::Turret, 1))),
            (2, EntityKind::Item(ItemKind::OilCan)),
        ] {
            s.entities.push(Entity {
                id,
                pos: hidden,
                kind,
            });
        }
        assert!(present("a", &s, &[])["data"]["entities"]
            .as_array()
            .unwrap()
            .is_empty());
        s.body.sensors.model = PartModel::Thermal;
        let v = present("a", &s, &[]);
        let list = v["data"]["entities"].as_array().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["kind"], "turret");
        assert_eq!(list[0]["detected"], true);
    }

    #[test]
    fn effects_shape() {
        let mut s = new_game(1);
        let v = present("a", &s, &[]);
        assert_eq!(
            v["data"]["effects"],
            json!({"grease": 0, "jumpCooldown": null})
        );
        s.body.legs.model = PartModel::Spring;
        s.grease_turns = 4;
        s.jump_cooldown = 7;
        let v = present("a", &s, &[]);
        assert_eq!(
            v["data"]["effects"],
            json!({"grease": 4, "jumpCooldown": 7})
        );
        // Resorte bloqueado: no salta, así que no hay cuenta atrás.
        s.body.legs.corrosion = 100;
        let v = present("a", &s, &[]);
        assert_eq!(v["data"]["effects"]["jumpCooldown"], Value::Null);
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
