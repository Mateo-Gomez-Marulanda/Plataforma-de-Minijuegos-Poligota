// Regla de puntaje: cuánto vale destruir un enemigo o completar un piso.

/// Puntos de un piso: 20, más 5 por cada 50 pisos completos anteriores (1–50: 20, 51–100: 25… 251–255: 45).
pub fn points_for_floor(floor: u8) -> u32 {
    20 + 5 * ((floor as u32 - 1) / 50)
}
