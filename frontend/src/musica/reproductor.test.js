// Pruebas del reproductor con un Audio falso: bucle, volumen, cambio de pista, parada y reintento tras un bloqueo.
import { beforeEach, expect, test } from 'vitest';
import { crearReproductor } from './reproductor.js';

// Audio de mentira: cuenta las reproducciones y puede rechazar `play()` como hace un navegador sin permiso.
class AudioFalso {
  static instancias = [];
  static bloqueado = false;
  constructor(src) {
    this.src = src;
    this.paused = true;
    this.loop = false;
    this.volume = 1;
    this.reproducciones = 0;
    AudioFalso.instancias.push(this);
  }
  play() {
    this.reproducciones++;
    if (AudioFalso.bloqueado) return Promise.reject(new Error('NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

const ultimo = () => AudioFalso.instancias.at(-1);
const microtareas = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  AudioFalso.instancias = [];
  AudioFalso.bloqueado = false;
});

test('reproduce la pista en bucle y con volumen moderado', () => {
  const r = crearReproductor(AudioFalso);
  r.reproducir('/musica/a.mp3');
  expect(ultimo().src).toBe('/musica/a.mp3');
  expect(ultimo().loop).toBe(true);
  expect(ultimo().volume).toBeGreaterThan(0);
  expect(ultimo().volume).toBeLessThan(1);
  expect(ultimo().paused).toBe(false);
});

test('pedir la misma pista otra vez no la reinicia', () => {
  const r = crearReproductor(AudioFalso);
  r.reproducir('/musica/a.mp3');
  r.reproducir('/musica/a.mp3');
  expect(AudioFalso.instancias).toHaveLength(1);
  expect(ultimo().reproducciones).toBe(1);
});

test('cambiar de pista detiene la anterior y empieza la nueva', () => {
  const r = crearReproductor(AudioFalso);
  r.reproducir('/musica/a.mp3');
  const primera = ultimo();
  r.reproducir('/musica/b.mp3');
  expect(primera.paused).toBe(true);
  expect(ultimo().src).toBe('/musica/b.mp3');
  expect(ultimo().paused).toBe(false);
});

test('detener calla la pista y permite volver a empezarla desde cero', () => {
  const r = crearReproductor(AudioFalso);
  r.reproducir('/musica/a.mp3');
  const primera = ultimo();
  r.detener();
  expect(primera.paused).toBe(true);
  r.detener(); // detener sin pista no falla
  r.reproducir('/musica/a.mp3');
  expect(AudioFalso.instancias).toHaveLength(2);
  expect(ultimo().paused).toBe(false);
});

test('pausar conserva la posición: al reproducir la misma pista sigue en el mismo audio', () => {
  const r = crearReproductor(AudioFalso);
  r.reproducir('/musica/a.mp3');
  const primera = ultimo();
  r.pausar();
  expect(primera.paused).toBe(true);
  r.reproducir('/musica/a.mp3');
  expect(AudioFalso.instancias).toHaveLength(1); // no se crea un audio nuevo
  expect(primera.paused).toBe(false);
  expect(primera.loop).toBe(true);
  crearReproductor(AudioFalso).pausar(); // pausar sin pista no falla
});

test('si el navegador bloquea el sonido, reintenta en el siguiente gesto del usuario', async () => {
  AudioFalso.bloqueado = true;
  const r = crearReproductor(AudioFalso);
  r.reproducir('/musica/a.mp3');
  await microtareas();
  expect(ultimo().paused).toBe(true);
  AudioFalso.bloqueado = false;
  window.dispatchEvent(new Event('pointerdown'));
  expect(ultimo().reproducciones).toBe(2);
  expect(ultimo().paused).toBe(false);
  window.dispatchEvent(new Event('pointerdown')); // el reintento era de una sola vez
  expect(ultimo().reproducciones).toBe(2);
});

test('detener cancela el reintento pendiente', async () => {
  AudioFalso.bloqueado = true;
  const r = crearReproductor(AudioFalso);
  r.reproducir('/musica/a.mp3');
  await microtareas();
  const bloqueada = ultimo();
  r.detener();
  AudioFalso.bloqueado = false;
  window.dispatchEvent(new Event('keydown'));
  expect(bloqueada.reproducciones).toBe(1);
});
