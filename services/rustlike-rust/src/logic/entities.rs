// Enemigos, objetos y entidades del piso, con el escalado de estadísticas por piso.
use super::map::Pos;

/// Tipo de enemigo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnemyKind {
    RustMite,
    Drone,
}

impl EnemyKind {
    /// Identificador estable para el contrato.
    pub fn id(self) -> &'static str {
        match self {
            EnemyKind::RustMite => "rust_mite",
            EnemyKind::Drone => "drone",
        }
    }
    /// Nombre con artículo para el registro.
    pub fn name(self) -> &'static str {
        match self {
            EnemyKind::RustMite => "el ácaro de óxido",
            EnemyKind::Drone => "el dron de limpieza",
        }
    }
    /// Verbo del ataque para el registro.
    pub fn bite(self) -> &'static str {
        match self {
            EnemyKind::RustMite => "te muerde",
            EnemyKind::Drone => "te golpea",
        }
    }
    /// Integridad base (piso 1).
    pub fn base_integrity(self) -> u32 {
        match self {
            EnemyKind::RustMite => 15,
            EnemyKind::Drone => 30,
        }
    }
    /// Golpe base (piso 1).
    pub fn base_hit(self) -> u32 {
        6
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
}

impl ItemKind {
    /// Identificador estable para el contrato.
    pub fn id(self) -> &'static str {
        "oil_can"
    }
    /// Nombre con artículo para el registro.
    pub fn name(self) -> &'static str {
        "una lata de aceite"
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
        }
    }
}

/// Contenido de una entidad.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EntityKind {
    Enemy(Enemy),
    Item(ItemKind),
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
}
