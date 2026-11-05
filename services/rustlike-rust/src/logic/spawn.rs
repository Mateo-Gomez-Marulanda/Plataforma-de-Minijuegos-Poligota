// Aparición de enemigos y objetos al crear un piso.
use super::entities::{Enemy, EnemyKind, Entity, EntityKind, ItemKind};
use super::map::generator::Room;
use super::map::{Level, Pos, Tile};
use rand::rngs::StdRng;
use rand::RngExt;
use std::collections::HashSet;

/// Coloca ácaros en grupos, drones y latas en salas distintas de la inicial.
pub fn populate(floor: u8, level: &Level, rng: &mut StdRng, next_id: &mut u32) -> Vec<Entity> {
    if floor == 255 || level.rooms.len() < 2 {
        return Vec::new();
    }
    let mut out: Vec<Entity> = Vec::new();
    // Casillas ocupadas: las ya usadas por entidades y la escalera.
    let mut taken: HashSet<Pos> = level.stairs.into_iter().collect();
    // Casillas de suelo libres dentro de una sala.
    let free_in = |room: &Room, taken: &HashSet<Pos>| -> Vec<Pos> {
        let mut v = Vec::new();
        for y in room.y..room.y + room.h {
            for x in room.x..room.x + room.w {
                let p = Pos { x, y };
                if level.map.get(p) == Tile::Floor && !taken.contains(&p) {
                    v.push(p);
                }
            }
        }
        v
    };
    let groups = (1 + usize::from(floor) / 20).min(4);
    for _ in 0..groups {
        let room = &level.rooms[rng.random_range(1..level.rooms.len())];
        let mut free = free_in(room, &taken);
        // Los ácaros ocupan las casillas libres más cercanas al centro.
        let c = room.center();
        free.sort_by_key(|p| (p.x - c.x).abs().max((p.y - c.y).abs()));
        for _ in 0..rng.random_range(2..=3) {
            if free.is_empty() {
                break;
            }
            let pos = free.remove(0);
            taken.insert(pos);
            let kind = EntityKind::Enemy(Enemy::new(EnemyKind::RustMite, floor));
            out.push(Entity {
                id: *next_id,
                pos,
                kind,
            });
            *next_id += 1;
        }
    }
    let drones = rng.random_range(1..=2);
    let cans = rng.random_range(2..=4);
    for i in 0..drones + cans {
        let room = &level.rooms[rng.random_range(1..level.rooms.len())];
        let free = free_in(room, &taken);
        if free.is_empty() {
            continue;
        }
        let pos = free[rng.random_range(0..free.len())];
        taken.insert(pos);
        let kind = if i < drones {
            EntityKind::Enemy(Enemy::new(EnemyKind::Drone, floor))
        } else {
            EntityKind::Item(ItemKind::OilCan)
        };
        out.push(Entity {
            id: *next_id,
            pos,
            kind,
        });
        *next_id += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logic::map::generator::generate;
    use rand::SeedableRng;
    use std::collections::HashSet;

    fn count(es: &[Entity], f: impl Fn(&EntityKind) -> bool) -> usize {
        es.iter().filter(|e| f(&e.kind)).count()
    }
    fn mite(k: &EntityKind) -> bool {
        matches!(k, EntityKind::Enemy(e) if e.kind == EnemyKind::RustMite)
    }
    fn drone(k: &EntityKind) -> bool {
        matches!(k, EntityKind::Enemy(e) if e.kind == EnemyKind::Drone)
    }

    #[test]
    fn populate_respects_rules() {
        for seed in 0..100u64 {
            let mut rng = StdRng::seed_from_u64(seed);
            let level = generate(5, &mut rng);
            let mut next = 1;
            let es = populate(5, &level, &mut rng, &mut next);
            let start = &level.rooms[0];
            let mut seen = HashSet::new();
            let mut last = 0;
            for e in &es {
                let inside = e.pos.x >= start.x
                    && e.pos.x < start.x + start.w
                    && e.pos.y >= start.y
                    && e.pos.y < start.y + start.h;
                assert!(!inside, "seed {seed}: entidad en la sala de inicio");
                assert_ne!(Some(e.pos), level.stairs);
                assert_eq!(level.map.get(e.pos), Tile::Floor);
                assert!(seen.insert(e.pos), "seed {seed}: casilla repetida");
                assert!(e.id > last);
                last = e.id;
            }
            assert_eq!(next, last + 1);
        }
    }

    #[test]
    fn populate_counts() {
        for seed in 0..100u64 {
            let mut rng = StdRng::seed_from_u64(seed);
            let level = generate(1, &mut rng);
            let mut next = 1;
            let es = populate(1, &level, &mut rng, &mut next);
            assert!((2..=3).contains(&count(&es, mite)), "seed {seed}");
            assert!((1..=2).contains(&count(&es, drone)));
            assert!((2..=4).contains(&count(&es, |k| matches!(
                k,
                EntityKind::Item(ItemKind::OilCan)
            ))));

            let mut rng = StdRng::seed_from_u64(seed);
            let level = generate(60, &mut rng);
            let es = populate(60, &level, &mut rng, &mut next);
            assert!((8..=12).contains(&count(&es, mite)), "seed {seed}");
        }
    }

    #[test]
    fn populate_last_floor_is_empty() {
        let mut rng = StdRng::seed_from_u64(1);
        let level = generate(255, &mut rng);
        let mut next = 1;
        assert!(populate(255, &level, &mut rng, &mut next).is_empty());
    }
}
