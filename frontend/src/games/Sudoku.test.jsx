// Pruebas del componente Sudoku con un servidor simulado (fetch falso): carga, jugadas, conflictos, victoria y errores.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sudoku from './Sudoku.jsx';

// Estado como lo devolvería el servicio: la celda (0,0) es una pista con un 1.
const estado = (extra = {}) => {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  board[0][0] = 1;
  const givens = Array.from({ length: 9 }, () => Array(9).fill(false));
  givens[0][0] = true;
  return { id: 'abc', game: 'sudoku', status: 'playing', board, message: null, data: { difficulty: 'medium', givens, conflicts: [], remaining: 80 }, ...extra };
};

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

// Llamadas a fetch que coinciden con un método y un final de ruta.
const llamadas = (metodo, fin) => fetchFalso.mock.calls.filter(([u, o]) => o?.method === metodo && u.endsWith(fin));

test('carga una partida y dibuja las 81 celdas', async () => {
  render(<Sudoku />);
  expect(screen.getByText('Generando tablero…')).toBeTruthy();
  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Fila/ })).toHaveLength(81));
  expect(JSON.parse(llamadas('POST', '/games')[0][1].body)).toEqual({ options: { difficulty: 'medium' } });
  expect(screen.getByText('Celdas vacías: 80')).toBeTruthy();
});

test('seleccionar una celda y pulsar un número envía la jugada y muestra la respuesta', async () => {
  render(<Sudoku />);
  const celda = await screen.findByRole('button', { name: 'Fila 1, columna 2, vacía' });
  fetchFalso.mockImplementationOnce(() => json(estado({ board: [[1, 5, ...Array(7).fill(0)], ...Array(8).fill(Array(9).fill(0))] })));
  fireEvent.click(celda);
  fireEvent.click(screen.getByRole('button', { name: '5' }));
  await screen.findByRole('button', { name: 'Fila 1, columna 2, 5' });
  expect(JSON.parse(llamadas('POST', '/move')[0][1].body)).toEqual({ action: { type: 'place', row: 0, col: 1, value: 5 } });
});

test('el teclado escribe, borra y mueve la selección', async () => {
  render(<Sudoku />);
  const celda = await screen.findByRole('button', { name: 'Fila 1, columna 2, vacía' });
  fireEvent.click(celda);
  fireEvent.keyDown(celda, { key: '7' });
  fireEvent.keyDown(celda, { key: 'Delete' });
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(2));
  expect(JSON.parse(llamadas('POST', '/move')[1][1].body).action).toEqual({ type: 'clear', row: 0, col: 1 });
  fireEvent.keyDown(celda, { key: 'ArrowDown' });
  expect(screen.getByRole('button', { name: 'Fila 2, columna 2, vacía' }).getAttribute('aria-pressed')).toBe('true');
});

test('una pista no se puede modificar y no se envía nada', async () => {
  render(<Sudoku />);
  fireEvent.click(await screen.findByRole('button', { name: 'Fila 1, columna 1, 1, pista' }));
  fireEvent.click(screen.getByRole('button', { name: '5' }));
  expect(llamadas('POST', '/move')).toHaveLength(0);
});

test('los conflictos que informa el servidor se marcan en el tablero', async () => {
  const conflicto = estado();
  conflicto.data.conflicts = [[0, 0]];
  fetchFalso.mockImplementationOnce(() => json(conflicto, 201));
  render(<Sudoku />);
  const celda = await screen.findByRole('button', { name: 'Fila 1, columna 1, 1, pista' });
  expect(celda.className).toContain('celda--conflicto');
});

test('al ganar se muestra el mensaje y se bloquea el teclado numérico', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ status: 'won' }), 201));
  render(<Sudoku />);
  expect(await screen.findByText('¡Sudoku resuelto!')).toBeTruthy();
  expect(screen.getByRole('button', { name: '5' }).disabled).toBe(true);
});

test('cambiar la dificultad crea otra partida con esa dificultad', async () => {
  render(<Sudoku />);
  await screen.findByRole('button', { name: /^Fila 1, columna 1/ });
  fireEvent.click(screen.getByRole('button', { name: 'Difícil' }));
  await waitFor(() => expect(llamadas('POST', '/games')).toHaveLength(2));
  expect(JSON.parse(llamadas('POST', '/games')[1][1].body).options.difficulty).toBe('hard');
});

test('sin conexión muestra el error y permite reintentar', async () => {
  fetchFalso.mockImplementationOnce(() => Promise.reject(new TypeError('fallo de red')));
  render(<Sudoku />);
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo conectar');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByRole('button', { name: /^Fila 1, columna 1/ });
});

test('un 422 del servidor se muestra sin perder el tablero', async () => {
  render(<Sudoku />);
  fireEvent.click(await screen.findByRole('button', { name: 'Fila 1, columna 2, vacía' }));
  fetchFalso.mockImplementationOnce(() => json({ error: 'INVALID_MOVE', message: 'Jugada inválida' }, 422));
  fireEvent.click(screen.getByRole('button', { name: '3' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Jugada inválida');
  expect(screen.getAllByRole('button', { name: /^Fila/ })).toHaveLength(81);
});

// ---- Cronómetro ----

const tiempo = () => screen.getByLabelText('Tiempo de partida').textContent;
// Avanza el reloj simulado. Antes deja que React ejecute los efectos pendientes (con relojes simulados tardan en correr),
// para que el cronómetro ya haya empezado a contar cuando pasa el tiempo.
const pasar = async (ms) => {
  await act(async () => {});
  act(() => vi.advanceTimersByTime(ms));
};

test('el cronómetro empieza en 00:00 y cuenta el tiempo de partida', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    render(<Sudoku />);
    await screen.findByRole('button', { name: /^Fila 1, columna 1/ });
    expect(tiempo()).toBe('00:00');
    await pasar(125000);
    expect(tiempo()).toBe('02:05');
  } finally {
    vi.useRealTimers();
  }
});

test('al resolver el sudoku el cronómetro se detiene con el tiempo final', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    render(<Sudoku />);
    const celda = await screen.findByRole('button', { name: 'Fila 1, columna 2, vacía' });
    await pasar(45000);
    fetchFalso.mockImplementationOnce(() => json(estado({ status: 'won' })));
    fireEvent.click(celda);
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    await screen.findByText('¡Sudoku resuelto!');
    expect(tiempo()).toBe('00:45');
    await pasar(30000);
    expect(tiempo()).toBe('00:45');
  } finally {
    vi.useRealTimers();
  }
});

test('cambiar la dificultad o crear otra partida reinicia el cronómetro', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    render(<Sudoku />);
    await screen.findByRole('button', { name: /^Fila 1, columna 1/ });
    await pasar(70000);
    expect(tiempo()).toBe('01:10');
    fireEvent.click(screen.getByRole('button', { name: 'Difícil' }));
    await waitFor(() => expect(llamadas('POST', '/games')).toHaveLength(2));
    await waitFor(() => expect(tiempo()).toBe('00:00'));
  } finally {
    vi.useRealTimers();
  }
});
