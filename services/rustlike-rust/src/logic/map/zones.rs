// Zonas de la torre: qué zona corresponde a cada piso, su tamaño y su id.

/// Zona de la torre.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Zone {
    Warehouse,
    TreatmentPlant,
    Foundry,
    ServerRoom,
    VacuumChambers,
    Core,
}

impl Zone {
    /// Zona a la que pertenece un piso (1 a 255).
    pub fn for_floor(floor: u8) -> Zone {
        match floor {
            0..=50 => Zone::Warehouse,
            51..=100 => Zone::TreatmentPlant,
            101..=150 => Zone::Foundry,
            151..=200 => Zone::ServerRoom,
            201..=254 => Zone::VacuumChambers,
            255 => Zone::Core,
        }
    }

    /// Tamaño (ancho, alto) de los mapas de la zona.
    pub fn size(self) -> (usize, usize) {
        match self {
            Zone::Warehouse => (60, 30),
            Zone::TreatmentPlant => (56, 28),
            Zone::Foundry => (50, 26),
            Zone::ServerRoom => (46, 24),
            Zone::VacuumChambers => (40, 20),
            Zone::Core => (40, 20),
        }
    }

    /// Identificador de la zona para el cliente.
    pub fn id(self) -> &'static str {
        match self {
            Zone::Warehouse => "warehouse",
            Zone::TreatmentPlant => "treatment_plant",
            Zone::Foundry => "foundry",
            Zone::ServerRoom => "server_room",
            Zone::VacuumChambers => "vacuum_chambers",
            Zone::Core => "core",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn floors_map_to_zones() {
        assert_eq!(Zone::for_floor(1), Zone::Warehouse);
        assert_eq!(Zone::for_floor(50), Zone::Warehouse);
        assert_eq!(Zone::for_floor(51), Zone::TreatmentPlant);
        assert_eq!(Zone::for_floor(150), Zone::Foundry);
        assert_eq!(Zone::for_floor(200), Zone::ServerRoom);
        assert_eq!(Zone::for_floor(254), Zone::VacuumChambers);
        assert_eq!(Zone::for_floor(255), Zone::Core);
    }

    #[test]
    fn sizes_match_design() {
        assert_eq!(Zone::Warehouse.size(), (60, 30));
        assert_eq!(Zone::TreatmentPlant.size(), (56, 28));
        assert_eq!(Zone::Foundry.size(), (50, 26));
        assert_eq!(Zone::ServerRoom.size(), (46, 24));
        assert_eq!(Zone::VacuumChambers.size(), (40, 20));
        assert_eq!(Zone::Core.size(), (40, 20));
    }

    #[test]
    fn ids() {
        assert_eq!(Zone::Warehouse.id(), "warehouse");
        assert_eq!(Zone::TreatmentPlant.id(), "treatment_plant");
        assert_eq!(Zone::Foundry.id(), "foundry");
        assert_eq!(Zone::ServerRoom.id(), "server_room");
        assert_eq!(Zone::VacuumChambers.id(), "vacuum_chambers");
        assert_eq!(Zone::Core.id(), "core");
    }
}
