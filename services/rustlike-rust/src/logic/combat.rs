// Reglas de combate del jugador y búsqueda de entidades por casilla.
use super::corrosion::Body;
use super::entities::{Entity, EntityKind};
use super::map::Pos;

/// Daño de un golpe del jugador: daño base de los brazos por su multiplicador.
pub fn player_damage(body: &Body) -> u32 {
    let base = body.arms.model.arms_base_damage() as f64;
    (base * body.arms.condition().arms_multiplier()).round() as u32
}

/// Índice del enemigo que ocupa la casilla, si hay uno.
pub fn enemy_at(entities: &[Entity], pos: Pos) -> Option<usize> {
    entities
        .iter()
        .position(|e| e.pos == pos && matches!(e.kind, EntityKind::Enemy(_)))
}

/// Índice del objeto que hay en la casilla, si hay uno.
pub fn item_at(entities: &[Entity], pos: Pos) -> Option<usize> {
    entities
        .iter()
        .position(|e| e.pos == pos && matches!(e.kind, EntityKind::Item(_)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn damage_follows_arms_condition() {
        let mut body = Body::new();
        assert_eq!(player_damage(&body), 10);
        body.arms.corrosion = 30;
        assert_eq!(player_damage(&body), 8);
        body.arms.corrosion = 60;
        assert_eq!(player_damage(&body), 5);
        body.arms.corrosion = 80;
        assert_eq!(player_damage(&body), 3);
        body.arms.corrosion = 100;
        assert_eq!(player_damage(&body), 0);
    }
}
