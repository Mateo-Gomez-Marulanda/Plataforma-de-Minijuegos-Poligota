// Aparición de enemigos y objetos al crear un piso.
use super::corrosion::{trait_models, Part, PartModel, Slot, HIT_SLOTS};
use super::entities::{Enemy, EnemyKind, Entity, EntityKind, ItemKind};
use super::map::generator::Room;
use super::map::{Level, Pos, Tile};
use rand::rngs::StdRng;
use rand::RngExt;
use std::collections::HashSet;
use std::ops::RangeInclusive;

/// Pieza al azar para el suelo: hueco, corrosión y modelo según el piso.
pub fn random_part(floor: u8, rng: &mut StdRng, corrosion: RangeInclusive<u8>) -> (Slot, Part) {
    let slot = HIT_SLOTS[rng.random_range(0..HIT_SLOTS.len())];
    let corrosion = rng.random_range(corrosion);
    let model = random_model(floor, slot, rng);
    (slot, Part { model, corrosion })
}

/// Modelo al azar para un hueco: básico salvo desde el piso 11; sin rasgos (núcleo) es básico.
fn random_model(floor: u8, slot: Slot, rng: &mut StdRng) -> PartModel {
    let models = trait_models(slot);
    if floor < 11 || rng.random_bool(0.5) || models.is_empty() {
        PartModel::Basic
    } else {
        models[rng.random_range(0..models.len())]
    }
}

/// Vecinas transitables (8 direcciones) de una casilla.
fn walkable_neighbours(level: &Level, p: Pos) -> usize {
    let mut n = 0;
    for dy in -1..=1 {
        for dx in -1..=1 {
            let q = Pos {
                x: p.x + dx,
                y: p.y + dy,
            };
            if (dx, dy) != (0, 0) && level.map.is_walkable(q) {
                n += 1;
            }
        }
    }
    n
}

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
    // Fase 4: goteras, torretas, robots oxidados, piezas, sprays y grasas (después de lo anterior).
    let leaks = rng.random_range(1..=2);
    let turrets = match floor {
        0..=1 => 0,
        2..=14 => rng.random_range(0..=1),
        _ => rng.random_range(1..=2),
    };
    let robots = if floor >= 3 {
        rng.random_range(0..=1)
    } else {
        0
    };
    let parts = rng.random_range(1..=2);
    let sprays = rng.random_range(0..=1);
    let greases = rng.random_range(0..=1);
    let plan = std::iter::repeat_n(0u8, leaks)
        .chain(std::iter::repeat_n(1, turrets))
        .chain(std::iter::repeat_n(2, robots))
        .chain(std::iter::repeat_n(3, parts))
        .chain(std::iter::repeat_n(4, sprays))
        .chain(std::iter::repeat_n(5, greases));
    for what in plan {
        let room = &level.rooms[rng.random_range(1..level.rooms.len())];
        let mut free = free_in(room, &taken);
        // Una gotera nunca tapa un pasillo: exige 3 vecinas transitables.
        // Y nunca queda pegada a otra gotera (Chebyshev 1).
        if what == 0 {
            let others: Vec<Pos> = out
                .iter()
                .filter(|e| matches!(&e.kind, EntityKind::Enemy(en) if en.kind == EnemyKind::Leak))
                .map(|e| e.pos)
                .collect();
            free.retain(|p| {
                walkable_neighbours(level, *p) >= 3
                    && others
                        .iter()
                        .all(|o| (o.x - p.x).abs().max((o.y - p.y).abs()) > 1)
            });
        }
        if free.is_empty() {
            continue;
        }
        let pos = free[rng.random_range(0..free.len())];
        taken.insert(pos);
        let kind = match what {
            0 => EntityKind::Enemy(Enemy::new(EnemyKind::Leak, floor)),
            1 => EntityKind::Enemy(Enemy::new(EnemyKind::Turret, floor)),
            2 => EntityKind::Enemy(Enemy::new(EnemyKind::RustyRobot, floor)),
            3 => {
                let (slot, part) = random_part(floor, rng, 10..=60);
                EntityKind::Part { slot, part }
            }
            4 => EntityKind::Item(ItemKind::LubricantSpray),
            _ => EntityKind::Item(ItemKind::ProtectiveGrease),
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

    fn kind_count(es: &[Entity], k: EnemyKind) -> usize {
        count(es, |x| matches!(x, EntityKind::Enemy(e) if e.kind == k))
    }
    fn item_count(es: &[Entity], k: ItemKind) -> usize {
        count(es, |x| matches!(x, EntityKind::Item(i) if *i == k))
    }

    #[test]
    fn random_part_before_11_is_basic() {
        for seed in 0..200u64 {
            let mut rng = StdRng::seed_from_u64(seed);
            let (slot, part) = random_part(5, &mut rng, 10..=60);
            assert_eq!(part.model, PartModel::Basic);
            assert!(HIT_SLOTS.contains(&slot));
            assert!((10..=60).contains(&part.corrosion));
        }
    }

    #[test]
    fn random_model_core_falls_back_to_basic() {
        for seed in 0..50u64 {
            let mut rng = StdRng::seed_from_u64(seed);
            assert_eq!(random_model(15, Slot::Core, &mut rng), PartModel::Basic);
        }
    }

    #[test]
    fn random_part_from_11_mixes() {
        let (mut basic, mut special) = (0, 0);
        for seed in 0..200u64 {
            let mut rng = StdRng::seed_from_u64(seed);
            let (slot, part) = random_part(11, &mut rng, 30..=70);
            assert!(part.model.fits(slot));
            assert!((30..=70).contains(&part.corrosion));
            if part.model == PartModel::Basic {
                basic += 1;
            } else {
                special += 1;
            }
        }
        assert!(basic > 0 && special > 0);
    }

    #[test]
    fn populate_phase4_counts() {
        for floor in [1u8, 2, 3, 15] {
            for seed in 0..100u64 {
                let mut rng = StdRng::seed_from_u64(seed);
                let level = generate(floor, &mut rng);
                let mut next = 1;
                let es = populate(floor, &level, &mut rng, &mut next);
                let leaks = kind_count(&es, EnemyKind::Leak);
                let turrets = kind_count(&es, EnemyKind::Turret);
                let robots = kind_count(&es, EnemyKind::RustyRobot);
                let parts = count(&es, |k| matches!(k, EntityKind::Part { .. }));
                assert!((1..=2).contains(&leaks), "floor {floor} seed {seed}");
                match floor {
                    1 => assert_eq!(turrets, 0),
                    2 => assert!(turrets <= 1),
                    15 => assert!((1..=2).contains(&turrets)),
                    _ => {}
                }
                if floor < 3 {
                    assert_eq!(robots, 0);
                } else {
                    assert!(robots <= 1);
                }
                assert!((1..=2).contains(&parts), "floor {floor} seed {seed}");
                assert!(item_count(&es, ItemKind::LubricantSpray) <= 1);
                assert!(item_count(&es, ItemKind::ProtectiveGrease) <= 1);
            }
        }
    }

    #[test]
    fn leak_never_blocks_path() {
        use std::collections::VecDeque;
        for (floor, seed) in [1u8, 2, 5, 11, 15, 30]
            .into_iter()
            .flat_map(|f| (0..100u64).map(move |s| (f, s)))
        {
            let mut rng = StdRng::seed_from_u64(seed);
            let level = generate(floor, &mut rng);
            let mut next = 1;
            let es = populate(floor, &level, &mut rng, &mut next);
            let leaks: HashSet<Pos> = es
                .iter()
                .filter(|e| matches!(&e.kind, EntityKind::Enemy(en) if en.kind == EnemyKind::Leak))
                .map(|e| e.pos)
                .collect();
            let goal = level.stairs.unwrap();
            let mut seen = HashSet::from([level.start]);
            let mut q = VecDeque::from([level.start]);
            while let Some(c) = q.pop_front() {
                for dy in -1..=1 {
                    for dx in -1..=1 {
                        let n = Pos {
                            x: c.x + dx,
                            y: c.y + dy,
                        };
                        if level.map.is_walkable(n) && !leaks.contains(&n) && seen.insert(n) {
                            q.push_back(n);
                        }
                    }
                }
            }
            assert!(
                seen.contains(&goal),
                "piso {floor} seed {seed}: gotera bloquea el camino"
            );
            let v: Vec<&Pos> = leaks.iter().collect();
            for (i, a) in v.iter().enumerate() {
                for b in &v[i + 1..] {
                    assert!(
                        (a.x - b.x).abs().max((a.y - b.y).abs()) > 1,
                        "piso {floor} seed {seed}: goteras pegadas"
                    );
                }
            }
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
