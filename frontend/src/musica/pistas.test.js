// Pruebas del catálogo de música: cada juego de la web debe tener su entrada (aunque todavía sea null).
import { existsSync } from 'node:fs';
import { expect, test } from 'vitest';
import { JUEGOS } from '../config.js';
import { FUENTES, PISTAS } from './pistas.js';

test('todos los juegos tienen una entrada en el catálogo', () => {
  for (const juego of JUEGOS) expect(Object.keys(PISTAS), juego.id).toContain(juego.id);
});

test('el catálogo no tiene entradas de juegos que no existen', () => {
  const ids = JUEGOS.map((j) => j.id);
  for (const clave of Object.keys(PISTAS)) expect(ids, clave).toContain(clave);
});

test('cada pista es una ruta pública dentro de /musica/ y el archivo existe', () => {
  for (const [juego, ruta] of Object.entries(PISTAS)) {
    if (ruta === null) continue; // sin música todavía
    expect(ruta, juego).toMatch(/^\/musica\/.+\.(mp3|ogg|wav|m4a)$/);
    expect(existsSync(`public${ruta}`), ruta).toBe(true);
  }
});

test('cada juego tiene el enlace de su soundtrack', () => {
  for (const juego of JUEGOS.filter((j) => PISTAS[j.id] !== null)) expect(FUENTES[juego.id], juego.id).toMatch(/^https:\/\//);
});
