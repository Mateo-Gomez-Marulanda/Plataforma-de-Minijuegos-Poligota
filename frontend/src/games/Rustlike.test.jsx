// Pruebas del componente Rustlike con un servidor simulado (fetch falso): tablero, teclado, botón Bajar, errores y limpieza.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Rustlike from './Rustlike.jsx';

// Estado de 3x3 como lo devolvería el servicio: hay un muro, suelo, escalera y una casilla sin ver.
const estado = (data = {}, extra = {}) => ({
  id: 'abc',
  game: 'rustlike',
  status: 'playing',
  message: null,
  board: [
    ['wall', 'floor', 'stairs'],
    ['floor', 'floor', 'unknown'],
    ['unknown', 'unknown', 'unknown'],
  ],
  data: {
    floor: 1, zone: 'warehouse', turn: 3, seed: 7, width: 3, height: 3,
    player: { x: 1, y: 1 },
    visible: [[true, true, true], [true, true, false], [false, false, false]],
    entities: [], log: ['Bienvenido al almacén.'], events: [], allowedActions: ['move', 'wait'], score: 45,
    ...data,
  },
  ...extra,
});

// Respuesta JSON de fetch.
const json = (cuerpo, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) });

let fetchFalso;

beforeEach(() => {
  fetchFalso = vi.fn((url, opciones = {}) => {
    if (opciones.method === 'POST' && url.endsWith('/games')) return json(estado(), 201);
    if (opciones.method === 'DELETE') return Promise.resolve({ ok: true, status: 204 });
    return json(estado());
  });
  vi.stubGlobal('fetch', fetchFalso);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const llamadas = (metodo, fin) => fetchFalso.mock.calls.filter(([u, o]) => o?.method === metodo && u.endsWith(fin));
const cuerpoDe = (llamada) => JSON.parse(llamada[1].body);

// Abre la pantalla y espera al tablero.
async function abrir() {
  render(<Rustlike />);
  await screen.findByRole('img', { name: 'Piso 1' });
}

// Pulsa una tecla y espera a que se envíe la acción; devuelve la acción enviada.
async function tecla(key, respuesta = estado()) {
  const antes = llamadas('POST', '/move').length;
  fetchFalso.mockImplementationOnce(() => json(respuesta));
  fireEvent.keyDown(window, { key });
  await waitFor(() => expect(llamadas('POST', '/move').length).toBe(antes + 1));
  const accion = cuerpoDe(llamadas('POST', '/move').at(-1)).action;
  await waitFor(() => expect(screen.getByText(/Turno/).textContent).toContain(String(respuesta.data.turn)));
  return accion;
}

test('crea la partida al entrar y dibuja el piso', async () => {
  await abrir();
  expect(llamadas('POST', '/games')).toHaveLength(1);
  expect(screen.getByRole('img', { name: 'Piso 1' })).toBeTruthy();
  expect(screen.getByLabelText('Puntaje').textContent).toBe('45');
});

test('las flechas y WASD envían movimientos', async () => {
  await abrir();
  expect(await tecla('ArrowRight', estado({ turn: 4 }))).toEqual({ type: 'move', dir: 'right' });
  expect(await tecla('w', estado({ turn: 5 }))).toEqual({ type: 'move', dir: 'up' });
});

test('Q, E, Z y C envían las diagonales', async () => {
  await abrir();
  expect((await tecla('q', estado({ turn: 4 }))).dir).toBe('up_left');
  expect((await tecla('E', estado({ turn: 5 }))).dir).toBe('up_right');
  expect((await tecla('z', estado({ turn: 6 }))).dir).toBe('down_left');
  expect((await tecla('c', estado({ turn: 7 }))).dir).toBe('down_right');
});

test('espacio espera y Enter baja', async () => {
  await abrir();
  expect(await tecla(' ', estado({ turn: 4 }))).toEqual({ type: 'wait' });
  expect(await tecla('Enter', estado({ turn: 5 }))).toEqual({ type: 'descend' });
});

test('el botón Bajar solo aparece con descend permitido', async () => {
  await abrir();
  expect(screen.queryByRole('button', { name: 'Bajar' })).toBeNull();
  fetchFalso.mockImplementationOnce(() => json(estado({ turn: 4, allowedActions: ['move', 'wait', 'descend'] })));
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  fetchFalso.mockImplementationOnce(() => json(estado({ floor: 2, turn: 5 })));
  fireEvent.click(await screen.findByRole('button', { name: 'Bajar' }));
  await screen.findByRole('img', { name: 'Piso 2' });
  expect(cuerpoDe(llamadas('POST', '/move').at(-1)).action).toEqual({ type: 'descend' });
  expect(screen.queryByRole('button', { name: 'Bajar' })).toBeNull();
});

test('ignora teclas mientras espera la respuesta', async () => {
  await abrir();
  let resolver;
  fetchFalso.mockImplementationOnce(() => new Promise((r) => { resolver = r; }));
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(llamadas('POST', '/move')).toHaveLength(1);
  resolver({ ok: true, status: 200, json: () => Promise.resolve(estado({ turn: 4 })) });
  await waitFor(() => expect(screen.getByText(/Turno/).textContent).toContain('4'));
});

test('un 422 muestra el mensaje y conserva el tablero', async () => {
  await abrir();
  fetchFalso.mockImplementationOnce(() => json({ error: 'INVALID_MOVE', message: 'Un muro bloquea el paso.' }, 422));
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  expect((await screen.findByRole('alert')).textContent).toBe('Un muro bloquea el paso.');
  expect(screen.getByRole('img', { name: 'Piso 1' })).toBeTruthy();
  expect(screen.getByLabelText('Puntaje').textContent).toBe('45');
});

test('las casillas unknown no se dibujan', async () => {
  await abrir();
  // 5 casillas conocidas de 9
  expect(document.querySelectorAll('rect.casilla')).toHaveLength(5);
});

test('muestra las últimas 5 líneas del log', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ log: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'] }, {}), 201));
  render(<Rustlike />);
  await screen.findByRole('img', { name: 'Piso 1' });
  expect(screen.queryByText('a2')).toBeNull();
  expect(screen.getByText('a3')).toBeTruthy();
  expect(screen.getByText('a7')).toBeTruthy();
});

test('borra la partida al salir', async () => {
  const { unmount } = render(<Rustlike />);
  await screen.findByRole('img', { name: 'Piso 1' });
  unmount();
  expect(llamadas('DELETE', '/games/abc')).toHaveLength(1);
});
