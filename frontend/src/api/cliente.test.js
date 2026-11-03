// Pruebas del cliente HTTP: las llamadas van al mismo origen que la página (sin dirección fija), para que
// la web funcione también cuando se abre desde otro equipo y no solo desde la máquina del servidor.
import { afterEach, expect, test, vi } from 'vitest';
import { API_URL, ErrorApi, pedir } from './cliente.js';
import { abrirJuego } from './websocket.js';

afterEach(() => vi.unstubAllGlobals());

test('no hay dirección fija: las peticiones usan rutas relativas al origen de la página', async () => {
  const fetchFalso = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: 1 }) }));
  vi.stubGlobal('fetch', fetchFalso);
  expect(API_URL).toBe('');
  await pedir('/api/sudoku/games', { method: 'POST', cuerpo: { a: 1 } });
  expect(fetchFalso.mock.calls[0][0]).toBe('/api/sudoku/games');
  expect(fetchFalso.mock.calls[0][0]).not.toContain('localhost');
});

test('un fallo de red se convierte en un ErrorApi legible', async () => {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fallo')));
  await expect(pedir('/api/x')).rejects.toBeInstanceOf(ErrorApi);
});

test('el WebSocket se abre contra el mismo host que la página (ws para http)', () => {
  const abiertas = [];
  vi.stubGlobal('WebSocket', class { constructor(url) { abiertas.push(url); } });
  abrirJuego('/ws/snake', {});
  expect(abiertas).toEqual([`${window.location.origin.replace(/^http/, 'ws')}/ws/snake`]);
});
