// Rasgos de las piezas: salto del resorte e imán de los brazos magnéticos.
use super::action::Dir;
use super::combat::enemy_at;
use super::corrosion::PartModel;
use super::entities::EntityKind;
use super::map::Pos;
use super::pathfinding::next_step;
use super::state::GameState;

/// Turnos de recarga del salto del resorte.
pub(crate) const JUMP_COOLDOWN: u32 = 10;

/// Casilla de llegada si el resorte salta al moverse en `dir` hacia `dest`: piernas de
/// resorte sin bloquear, carga lista y la casilla siguiente libre (sin muro ni enemigo).
pub(crate) fn try_jump(state: &GameState, dir: Dir, dest: Pos) -> Option<Pos> {
    if !state.body.legs.has_trait(PartModel::Spring) || state.jump_cooldown > 0 {
        return None;
    }
    let (dx, dy) = dir.delta();
    let landing = Pos {
        x: dest.x + dx,
        y: dest.y + dy,
    };
    let free = state.map.is_walkable(landing)
        && landing != state.player
        && enemy_at(&state.entities, landing).is_none();
    free.then_some(landing)
}

/// Los brazos magnéticos acercan una casilla los objetos y piezas a 3 o menos
/// casillas (Chebyshev) que estén en casillas visibles; solo los muros los frenan.
pub(crate) fn magnet_pull(state: &mut GameState) {
    if !state.body.arms.has_trait(PartModel::Magnetic) {
        return;
    }
    let player = state.player;
    for i in 0..state.entities.len() {
        let pos = state.entities[i].pos;
        let dist = (pos.x - player.x).abs().max((pos.y - player.y).abs());
        let loose = !matches!(state.entities[i].kind, EntityKind::Enemy(_));
        if !loose || dist == 0 || dist > 3 || !state.visible[pos.y as usize][pos.x as usize] {
            continue;
        }
        if let Some(step) = next_step(&state.map, pos, player, |_| false, 3) {
            state.entities[i].pos = step;
        }
    }
}
