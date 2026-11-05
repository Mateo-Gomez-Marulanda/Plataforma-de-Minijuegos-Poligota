// Turnos de los enemigos: ataque, persecución con BFS y vagabundeo.
use super::action::Event;
use super::apply_corrosion;
use super::combat::enemy_at;
use super::corrosion::HIT_SLOTS;
use super::entities::{EnemyKind, EntityKind};
use super::map::Pos;
use super::pathfinding::next_step;
use super::state::{GameState, Status};
use rand::RngExt;

/// Las ocho direcciones de vagabundeo, en el orden que indexa el azar.
const WANDER: [(i32, i32); 8] = [
    (0, -1),
    (0, 1),
    (-1, 0),
    (1, 0),
    (-1, -1),
    (1, -1),
    (-1, 1),
    (1, 1),
];

/// Distancia de Chebyshev entre dos casillas.
fn distance(a: Pos, b: Pos) -> i32 {
    (a.x - b.x).abs().max((a.y - b.y).abs())
}

/// Hace actuar a cada enemigo por id ascendente; se detiene si la partida termina.
pub fn enemy_turns(state: &mut GameState, events: &mut Vec<Event>) {
    let mut ids: Vec<u32> = state
        .entities
        .iter()
        .filter(|e| matches!(e.kind, EntityKind::Enemy(_)))
        .map(|e| e.id)
        .collect();
    ids.sort_unstable();
    for id in ids {
        if state.status != Status::Playing {
            break;
        }
        act(state, id, events);
    }
}

/// Turno de un enemigo concreto.
fn act(state: &mut GameState, id: u32, events: &mut Vec<Event>) {
    let Some(idx) = state.entities.iter().position(|e| e.id == id) else {
        return;
    };
    let pos = state.entities[idx].pos;
    let player = state.player;
    let visible = state.visible[pos.y as usize][pos.x as usize];
    let EntityKind::Enemy(enemy) = &mut state.entities[idx].kind else {
        return;
    };
    // El dron despierta al entrar en el campo de visión del jugador y ya no duerme.
    if enemy.kind == EnemyKind::Drone && visible {
        enemy.awake = true;
    }
    let (kind, awake, hit) = (enemy.kind, enemy.awake, enemy.hit);
    let dist = distance(pos, player);
    // Las nuevas criaturas se implementan en una tarea posterior.
    if matches!(
        kind,
        EnemyKind::Turret | EnemyKind::RustyRobot | EnemyKind::Leak
    ) {
        return;
    }
    if dist <= 1 {
        let slot = HIT_SLOTS[state.rng.random_range(0..HIT_SLOTS.len())];
        events.push(Event::PlayerHit);
        let prefix = format!("{} {}. ", capitalize(kind.name()), kind.bite());
        apply_corrosion(state, slot, hit, events, &prefix);
        return;
    }
    let chase = match kind {
        EnemyKind::Turret | EnemyKind::RustyRobot | EnemyKind::Leak => false,
        EnemyKind::RustMite => dist <= 8,
        EnemyKind::Drone => awake,
    };
    let dest = if chase {
        let blocked = |p: Pos| p == player || enemy_at(&state.entities, p).is_some();
        next_step(&state.map, pos, player, blocked, 20)
    } else {
        let (dx, dy) = WANDER[state.rng.random_range(0..WANDER.len())];
        Some(Pos {
            x: pos.x + dx,
            y: pos.y + dy,
        })
    };
    if let Some(d) = dest {
        let free =
            state.map.is_walkable(d) && d != player && enemy_at(&state.entities, d).is_none();
        if free {
            state.entities[idx].pos = d;
        }
    }
}

/// Pone en mayúscula la primera letra.
fn capitalize(text: &str) -> String {
    let mut chars = text.chars();
    chars
        .next()
        .map(|c| c.to_uppercase().collect::<String>() + chars.as_str())
        .unwrap_or_default()
}
