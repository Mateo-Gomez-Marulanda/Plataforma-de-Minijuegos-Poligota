// Enemigos, objetos y entidades del piso, con el escalado de estadísticas por piso.
use super::corrosion::{Part, Slot};
use super::map::Pos;

/// Tipo de enemigo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnemyKind {
    RustMite,
    Drone,
    Turret,
    RustyRobot,
    Leak,
}

impl EnemyKind {
    /// Identificador estable para el contrato.
    pub fn id(self) -> &'static str {
        match self {
            EnemyKind::RustMite => "rust_mite",
            EnemyKind::Drone => "drone",
            EnemyKind::Turret => "turret",
            EnemyKind::RustyRobot => "rusty_robot",
            EnemyKind::Leak => "leak",
        }
    }
    /// Nombre con artículo para el registro.
    pub fn name(self) -> &'static str {
        match self {
            EnemyKind::RustMite => "el ácaro de óxido",
            EnemyKind::Drone => "el dron de limpieza",
            EnemyKind::Turret => "la torreta",
            EnemyKind::RustyRobot => "el robot oxidado",
            EnemyKind::Leak => "la gotera",
        }
    }
    /// Verbo del ataque para el registro.
    pub fn bite(self) -> &'static str {
        match self {
            EnemyKind::RustMite => "te muerde",
            EnemyKind::Drone | EnemyKind::RustyRobot => "te golpea",
            EnemyKind::Turret => "te dispara",
            EnemyKind::Leak => "",
        }
    }
    /// Integridad base (piso 1).
    pub fn base_integrity(self) -> u32 {
        match self {
            EnemyKind::RustMite => 15,
            EnemyKind::Drone => 30,
            EnemyKind::Turret => 25,
            EnemyKind::RustyRobot => 60,
            EnemyKind::Leak => 0,
        }
    }
    /// Golpe base (piso 1).
    pub fn base_hit(self) -> u32 {
        match self {
            EnemyKind::RustMite | EnemyKind::Drone => 6,
            EnemyKind::Turret => 5,
            EnemyKind::RustyRobot => 10,
            EnemyKind::Leak => 0,
        }
    }
    /// Si no se puede destruir (solo la gotera).
    pub fn indestructible(self) -> bool {
        self == EnemyKind::Leak
    }
}

/// Escala un valor base: +10 % por cada 10 pisos completos.
pub fn scaled(base: u32, floor: u8) -> u32 {
    base + base * (u32::from(floor).saturating_sub(1) / 10) / 10
}

/// Tipo de objeto recogible.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemKind {
    OilCan,
    LubricantSpray,
    ProtectiveGrease,
}

impl ItemKind {
    /// Identificador estable para el contrato.
    pub fn id(self) -> &'static str {
        match self {
            ItemKind::OilCan => "oil_can",
            ItemKind::LubricantSpray => "lubricant_spray",
            ItemKind::ProtectiveGrease => "protective_grease",
        }
    }
    /// Nombre con artículo para el registro.
    pub fn name(self) -> &'static str {
        match self {
            ItemKind::OilCan => "una lata de aceite",
            ItemKind::LubricantSpray => "un spray lubricante",
            ItemKind::ProtectiveGrease => "una grasa protectora",
        }
    }
}

/// Enemigo con sus estadísticas ya escaladas.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Enemy {
    pub kind: EnemyKind,
    pub integrity: u32,
    pub max_integrity: u32,
    pub hit: u32,
    pub awake: bool,
    /// El robot oxidado alterna turnos: true si descansa en el siguiente.
    pub rested: bool,
}

impl Enemy {
    /// Crea un enemigo dormido con las estadísticas del piso.
    pub fn new(kind: EnemyKind, floor: u8) -> Enemy {
        let integrity = scaled(kind.base_integrity(), floor);
        Enemy {
            kind,
            integrity,
            max_integrity: integrity,
            hit: scaled(kind.base_hit(), floor),
            awake: false,
            rested: false,
        }
    }
}

/// Contenido de una entidad.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EntityKind {
    Enemy(Enemy),
    Item(ItemKind),
    /// Pieza del robot tirada en el suelo.
    Part {
        slot: Slot,
        part: Part,
    },
}

/// Entidad colocada en el piso.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entity {
    pub id: u32,
    pub pos: Pos,
    pub kind: EntityKind,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scaled_values() {
        assert_eq!(scaled(15, 1), 15);
        assert_eq!(scaled(15, 11), 16);
        assert_eq!(scaled(30, 21), 36);
        assert_eq!(scaled(6, 50), 8);
    }

    #[test]
    fn enemy_new_uses_scaling() {
        let e = Enemy::new(EnemyKind::Drone, 21);
        assert_eq!(
            (e.integrity, e.max_integrity, e.hit, e.awake),
            (36, 36, 7, false)
        );
        let m = Enemy::new(EnemyKind::RustMite, 1);
        assert_eq!((m.integrity, m.hit), (15, 6));
    }

    #[test]
    fn new_enemy_stats() {
        let t = Enemy::new(EnemyKind::Turret, 1);
        assert_eq!((t.integrity, t.hit), (25, 5));
        let r = Enemy::new(EnemyKind::RustyRobot, 1);
        assert_eq!((r.integrity, r.hit), (60, 10));
        let r = Enemy::new(EnemyKind::RustyRobot, 21);
        assert_eq!((r.integrity, r.hit), (72, 12));
        let l = Enemy::new(EnemyKind::Leak, 1);
        assert_eq!((l.integrity, l.hit), (0, 0));
        assert!(EnemyKind::Leak.indestructible());
        assert!(!EnemyKind::Turret.indestructible());
        assert!(!l.rested);
    }
}
