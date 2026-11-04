// Pruebas del componente Snake con un WebSocket falso: conexión, inicio, teclas, pausa, fin de partida y errores.
import { act } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Snake from './Snake.jsx';

// WebSocket de mentira: guarda lo que se envía y deja simular lo que haría el servidor.
class WsFalso {
  static OPEN = 1;
  static instancias = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.enviados = [];
    this.cerrado = false;
    WsFalso.instancias.push(this);
  }
  send(texto) { this.enviados.push(JSON.parse(texto)); }
  close() { this.cerrado = true; }
  // Simula que el servidor acepta la conexión.
  abrir() { this.readyState = 1; act(() => this.onopen?.()); }
  // Simula un mensaje del servidor.
  recibir(msg) { act(() => this.onmessage?.({ data: JSON.stringify(msg) })); }
  // Simula que la conexión se cae.
  caer() { this.readyState = 3; act(() => this.onclose?.()); }
}

// Mensaje `state` de ejemplo: cabeza en (2,1), cuerpo en (1,1) y comida en (4,3).
const estado = (data = {}) => {
  const board = Array.from({ length: 20 }, () => Array(20).fill(0));
  board[1][2] = 2;
  board[1][1] = 1;
  board[3][4] = 3;
  return { type: 'state', tick: 1, status: 'playing', board, data: { score: 0, paused: false, interval_ms: 150, ...data } };
};

const ws = () => WsFalso.instancias.at(-1);

beforeEach(() => {
  WsFalso.instancias = [];
  vi.stubGlobal('WebSocket', WsFalso);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Abre la conexión y empieza una partida con un primer estado.
function jugar() {
  render(<Snake />);
  ws().abrir();
  fireEvent.click(screen.getByRole('button', { name: 'Jugar' }));
  ws().recibir(estado());
}

test('se conecta al gateway y permite jugar cuando la conexión se abre', () => {
  render(<Snake />);
  expect(ws().url).toBe('ws://localhost:5173/ws/snake');
  expect(screen.getByText('Conectando…')).toBeTruthy();
  ws().abrir();
  expect(screen.getByRole('button', { name: 'Jugar' })).toBeTruthy();
});

test('Jugar envía start y dibuja cabeza, cuerpo y comida del estado recibido', () => {
  jugar();
  expect(ws().enviados).toEqual([{ type: 'start' }]);
  const tablero = screen.getByRole('img', { name: 'Tablero de Snake' });
  expect(tablero.children).toHaveLength(400);
  expect(tablero.querySelectorAll('.pieza--cabeza')).toHaveLength(1);
  expect(tablero.querySelectorAll('.pieza--cuerpo')).toHaveLength(1);
  expect(tablero.querySelectorAll('.pieza--comida')).toHaveLength(1);
});

test('muestra el puntaje que envía el servidor', () => {
  jugar();
  ws().recibir(estado({ score: 30 }));
  expect(screen.getByText('30')).toBeTruthy();
});

test('las flechas y WASD envían la dirección; otras teclas no', () => {
  jugar();
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  fireEvent.keyDown(window, { key: 'w' });
  fireEvent.keyDown(window, { key: 'x' });
  expect(ws().enviados.slice(1)).toEqual([
    { type: 'input', key: 'left' },
    { type: 'input', key: 'up' },
  ]);
});

test('P y Esc pausan y reanudan según el estado del servidor; la barra espaciadora ya no pausa', () => {
  jugar();
  fireEvent.keyDown(window, { key: ' ' });
  expect(ws().enviados).toEqual([{ type: 'start' }]); // nada: el espacio no hace nada
  fireEvent.keyDown(window, { key: 'p' });
  expect(ws().enviados.at(-1)).toEqual({ type: 'pause' });
  ws().recibir(estado({ paused: true }));
  expect(screen.getByText('En pausa')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'ArrowUp' }); // en pausa no gira
  expect(ws().enviados.at(-1)).toEqual({ type: 'pause' });
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(ws().enviados.at(-1)).toEqual({ type: 'resume' });
  fireEvent.click(screen.getByRole('button', { name: 'Reanudar' }));
  expect(ws().enviados.at(-1)).toEqual({ type: 'resume' });
});

test('game_over muestra el motivo y permite jugar de nuevo', () => {
  jugar();
  ws().recibir({ type: 'game_over', data: { score: 40, reason: 'wall', result: 'lost', tick: 9 } });
  expect(screen.getByText('Chocaste con la pared.')).toBeTruthy();
  expect(screen.getByText('40')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Jugar de nuevo' }));
  expect(ws().enviados.at(-1)).toEqual({ type: 'start' });
  // Mientras llega el primer estado de la partida nueva no hay mensaje de fin ni botón de jugar.
  expect(screen.queryByText('Chocaste con la pared.')).toBeNull();
  expect(screen.getByText('0')).toBeTruthy();
});

test('llenar el tablero se muestra como victoria', () => {
  jugar();
  ws().recibir({ type: 'game_over', data: { score: 3970, reason: 'board_full', result: 'won', tick: 500 } });
  expect(screen.getByText('¡Llenaste todo el tablero!').className).toContain('snake__victoria');
});

test('sin conexión muestra el error y Reintentar abre otra conexión', () => {
  render(<Snake />);
  ws().caer();
  expect(screen.getByRole('alert').textContent).toContain('No se pudo conectar');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(WsFalso.instancias).toHaveLength(2);
  ws().abrir();
  expect(screen.getByRole('button', { name: 'Jugar' })).toBeTruthy();
});

test('si la conexión se cae a mitad de partida avisa de que se perdió', () => {
  jugar();
  ws().caer();
  expect(screen.getByRole('alert').textContent).toContain('Se perdió la conexión');
});

test('un mensaje de error del servidor se muestra', () => {
  render(<Snake />);
  ws().abrir();
  ws().recibir({ type: 'error', error: 'INVALID_OPTIONS', message: 'Opciones inválidas' });
  expect(screen.getByRole('alert').textContent).toBe('Opciones inválidas');
});

test('al salir de la pantalla se cierra la conexión', () => {
  const { unmount } = render(<Snake />);
  const conexion = ws();
  unmount();
  expect(conexion.cerrado).toBe(true);
});
