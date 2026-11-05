// Piezas del robot, estados de corrosión y las reglas para aplicarla y repararla.
use serde::Deserialize;

/// Ranura del cuerpo del robot.
#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Slot {
    Legs,
    Arms,
    Sensors,
    Core,
}

/// Ranuras que pueden recibir un golpe enemigo.
pub const HIT_SLOTS: [Slot; 3] = [Slot::Legs, Slot::Arms, Slot::Sensors];

impl Slot {
    /// Identificador estable para el contrato.
    pub fn id(self) -> &'static str {
        match self {
            Slot::Legs => "legs",
            Slot::Arms => "arms",
            Slot::Sensors => "sensors",
            Slot::Core => "core",
        }
    }

    /// Nombre en español para los mensajes.
    pub fn name(self) -> &'static str {
        match self {
            Slot::Legs => "Piernas",
            Slot::Arms => "Brazos",
            Slot::Sensors => "Sensores",
            Slot::Core => "Núcleo",
        }
    }
}

/// Estado de una pieza según su corrosión.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Condition {
    Optimal,
    Light,
    Severe,
    Critical,
    Blocked,
}

impl Condition {
    /// Estado que corresponde a un nivel de corrosión (0-100).
    pub fn from_corrosion(c: u8) -> Condition {
        match c {
            0..=24 => Condition::Optimal,
            25..=49 => Condition::Light,
            50..=74 => Condition::Severe,
            75..=99 => Condition::Critical,
            _ => Condition::Blocked,
        }
    }

    /// Identificador estable para el contrato.
    pub fn id(self) -> &'static str {
        match self {
            Condition::Optimal => "optimal",
            Condition::Light => "light",
            Condition::Severe => "severe",
            Condition::Critical => "critical",
            Condition::Blocked => "blocked",
        }
    }

    /// Probabilidad de que las piernas fallen al desplazarse.
    pub fn legs_fail_chance(self) -> f64 {
        match self {
            Condition::Optimal => 0.0,
            Condition::Light => 0.10,
            Condition::Severe => 0.25,
            Condition::Critical => 0.50,
            Condition::Blocked => 0.75,
        }
    }

    /// Multiplicador del daño de los brazos.
    pub fn arms_multiplier(self) -> f64 {
        match self {
            Condition::Optimal => 1.0,
            Condition::Light => 0.75,
            Condition::Severe => 0.50,
            Condition::Critical => 0.25,
            Condition::Blocked => 0.0,
        }
    }

    /// Radio de visión de los sensores.
    pub fn vision_radius(self) -> i32 {
        match self {
            Condition::Optimal => 8,
            Condition::Light => 6,
            Condition::Severe => 4,
            Condition::Critical => 2,
            Condition::Blocked => 1,
        }
    }
}

/// Modelo de pieza; la fase 4 añadirá más variantes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PartModel {
    Basic,
}

impl PartModel {
    /// Identificador estable para el contrato.
    pub fn id(self) -> &'static str {
        match self {
            PartModel::Basic => "basic",
        }
    }

    /// Factor que multiplica la corrosión recibida.
    pub fn resistance(self) -> f64 {
        match self {
            PartModel::Basic => 1.0,
        }
    }

    /// Daño base de los brazos con este modelo.
    pub fn arms_base_damage(self) -> u32 {
        match self {
            PartModel::Basic => 10,
        }
    }
}

/// Una pieza instalada con su nivel de corrosión.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Part {
    pub model: PartModel,
    pub corrosion: u8,
}

impl Part {
    /// Estado actual de la pieza.
    pub fn condition(&self) -> Condition {
        Condition::from_corrosion(self.corrosion)
    }
}

/// Las cuatro piezas del robot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Body {
    pub legs: Part,
    pub arms: Part,
    pub sensors: Part,
    pub core: Part,
}

impl Body {
    /// Cuerpo nuevo: piezas básicas sin corrosión.
    pub fn new() -> Body {
        let fresh = Part {
            model: PartModel::Basic,
            corrosion: 0,
        };
        Body {
            legs: fresh,
            arms: fresh,
            sensors: fresh,
            core: fresh,
        }
    }

    /// Pieza de una ranura.
    pub fn part(&self, slot: Slot) -> &Part {
        match slot {
            Slot::Legs => &self.legs,
            Slot::Arms => &self.arms,
            Slot::Sensors => &self.sensors,
            Slot::Core => &self.core,
        }
    }

    /// Pieza mutable de una ranura.
    pub fn part_mut(&mut self, slot: Slot) -> &mut Part {
        match slot {
            Slot::Legs => &mut self.legs,
            Slot::Arms => &mut self.arms,
            Slot::Sensors => &mut self.sensors,
            Slot::Core => &mut self.core,
        }
    }
}

impl Default for Body {
    fn default() -> Self {
        Body::new()
    }
}

/// Resultado de aplicar corrosión.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Corroded {
    pub slot: Slot,
    pub amount: u8,
    pub blocked_now: bool,
    pub transferred: bool,
}

/// Aplica corrosión a una pieza; si ya está a 100 pasa al núcleo.
pub fn corrode(body: &mut Body, slot: Slot, base: u32) -> Option<Corroded> {
    let transferred = slot != Slot::Core && body.part(slot).corrosion >= 100;
    let target = if transferred { Slot::Core } else { slot };
    let part = body.part_mut(target);
    if part.corrosion >= 100 {
        return None;
    }
    let amount = (base as f64 * part.model.resistance()).round() as u32;
    if amount == 0 {
        return None;
    }
    let new = (part.corrosion as u32 + amount).min(100) as u8;
    part.corrosion = new;
    Some(Corroded {
        slot: target,
        amount: amount.min(100) as u8,
        blocked_now: new == 100,
        transferred,
    })
}

/// Resta corrosión con mínimo 0 y devuelve lo que restó de verdad.
pub fn repair(part: &mut Part, amount: u8) -> u8 {
    let removed = amount.min(part.corrosion);
    part.corrosion -= removed;
    removed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn condition_thresholds() {
        let cases = [
            (0, Condition::Optimal),
            (24, Condition::Optimal),
            (25, Condition::Light),
            (49, Condition::Light),
            (50, Condition::Severe),
            (74, Condition::Severe),
            (75, Condition::Critical),
            (99, Condition::Critical),
            (100, Condition::Blocked),
        ];
        for (c, expected) in cases {
            assert_eq!(Condition::from_corrosion(c), expected, "corrosion {c}");
        }
    }

    #[test]
    fn table_values() {
        use Condition::*;
        let rows = [
            (Optimal, 0.0, 1.0, 8),
            (Light, 0.10, 0.75, 6),
            (Severe, 0.25, 0.50, 4),
            (Critical, 0.50, 0.25, 2),
            (Blocked, 0.75, 0.0, 1),
        ];
        for (c, legs, arms, vision) in rows {
            assert_eq!(c.legs_fail_chance(), legs);
            assert_eq!(c.arms_multiplier(), arms);
            assert_eq!(c.vision_radius(), vision);
        }
        assert_eq!(Optimal.id(), "optimal");
        assert_eq!(Blocked.id(), "blocked");
    }

    #[test]
    fn slot_names_and_model() {
        assert_eq!(Slot::Core.id(), "core");
        assert_eq!(Slot::Core.name(), "Núcleo");
        assert_eq!(Slot::Legs.name(), "Piernas");
        assert_eq!(HIT_SLOTS, [Slot::Legs, Slot::Arms, Slot::Sensors]);
        assert_eq!(PartModel::Basic.id(), "basic");
        assert_eq!(PartModel::Basic.resistance(), 1.0);
        assert_eq!(PartModel::Basic.arms_base_damage(), 10);
    }

    #[test]
    fn corrode_applies_and_caps() {
        let mut body = Body::new();
        body.legs.corrosion = 90;
        let r = corrode(&mut body, Slot::Legs, 15).unwrap();
        assert_eq!(body.legs.corrosion, 100);
        assert!(r.blocked_now && !r.transferred);
        assert_eq!((r.slot, r.amount), (Slot::Legs, 15));
    }

    #[test]
    fn blocked_part_transfers_to_core() {
        let mut body = Body::new();
        body.legs.corrosion = 100;
        let r = corrode(&mut body, Slot::Legs, 6).unwrap();
        assert_eq!(body.core.corrosion, 6);
        assert_eq!(body.legs.corrosion, 100);
        assert!(r.transferred);
        assert_eq!((r.slot, r.amount), (Slot::Core, 6));
    }

    #[test]
    fn full_core_returns_none() {
        let mut body = Body::new();
        body.core.corrosion = 100;
        assert_eq!(corrode(&mut body, Slot::Core, 3), None);
        body.legs.corrosion = 100;
        assert_eq!(corrode(&mut body, Slot::Legs, 3), None);
    }

    #[test]
    fn repair_floors_at_zero() {
        let mut part = Part {
            model: PartModel::Basic,
            corrosion: 10,
        };
        assert_eq!(repair(&mut part, 30), 10);
        assert_eq!(part.corrosion, 0);
    }
}
