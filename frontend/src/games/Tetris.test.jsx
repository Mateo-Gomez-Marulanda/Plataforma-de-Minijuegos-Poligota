// Pruebas del componente Tetris con un WebSocket falso: conexión, inicio, teclas, pausa, fin de partida y errores.
import { act } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Tetris from './Tetris.jsx';

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

// Mensaje `state` de ejemplo: una T cayendo arriba, su sombra abajo y una L fijada.
const estado = (data = {}) => {
  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  for (const [f, c] of [[0, 4], [1, 3], [1, 4], [1, 5]]) board[f][c] = 3; // T que cae
  for (const [f, c] of [[18, 4], [19, 3], [19, 4], [19, 5]]) board[f][c] = 8; // sombra
  for (const [f, c] of [[19, 0], [19, 1], [19, 2], [18, 2]]) board[f][c] = 7; // L fijada
  return { type: 'state', tick: 1, status: 'playing', board, data: { score: 0, level: 1, lines: 0, next: 'S', paused: false, interval_ms: 1000, ...data } };
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
function jugar(data) {
  render(<Tetris />);
  ws().abrir();
  fireEvent.click(screen.getByRole('button', { name: 'Jugar' }));
  ws().recibir(estado(data));
}

const enviados = () => ws().enviados.slice(1); // sin el `start`

test('se conecta al gateway y permite jugar cuando la conexión se abre', () => {
  render(<Tetris />);
  expect(ws().url).toBe('ws://localhost:3000/ws/tetris');
  expect(screen.getByText('Conectando…')).toBeTruthy();
  ws().abrir();
  expect(screen.getByRole('button', { name: 'Jugar' })).toBeTruthy();
});

test('Jugar envía start y dibuja la pieza, la sombra y lo fijado en un tablero de 10x20', () => {
  jugar();
  expect(ws().enviados).toEqual([{ type: 'start' }]);
  const tablero = screen.getByRole('img', { name: 'Tablero de Tetris' });
  expect(tablero.children).toHaveLength(200);
  expect(tablero.querySelectorAll('.cuadro--T')).toHaveLength(4);
  expect(tablero.querySelectorAll('.cuadro--sombra')).toHaveLength(4);
  expect(tablero.querySelectorAll('.cuadro--L')).toHaveLength(4);
});

test('muestra puntaje, nivel, líneas y la pieza siguiente', () => {
  jugar({ score: 1250, level: 3, lines: 21, next: 'Z' });
  expect(screen.getByText('1250')).toBeTruthy();
  expect(screen.getByText('21')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
  const siguiente = screen.getByRole('img', { name: 'Pieza siguiente: Z' });
  expect(siguiente.querySelectorAll('.cuadro--Z')).toHaveLength(4);
});

test('las flechas, WASD y el espacio envían la tecla del contrato; otras no', () => {
  jugar();
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'd', 'w', 's', 'x', 'q']) {
    fireEvent.keyDown(window, { key });
  }
  expect(enviados().map((m) => m.key)).toEqual([
    'left', 'right', 'rotate', 'soft_drop', 'hard_drop', 'left', 'right', 'rotate', 'soft_drop', 'rotate',
  ]);
  expect(enviados().every((m) => m.type === 'input')).toBe(true);
});

test('mantener pulsada una tecla repite mover y bajar, pero no girar ni la caída rápida', () => {
  jugar();
  fireEvent.keyDown(window, { key: 'ArrowLeft', repeat: true });
  fireEvent.keyDown(window, { key: 'ArrowDown', repeat: true });
  fireEvent.keyDown(window, { key: 'ArrowUp', repeat: true });
  fireEvent.keyDown(window, { key: ' ', repeat: true });
  expect(enviados().map((m) => m.key)).toEqual(['left', 'soft_drop']);
});

test('las flechas y el espacio no desplazan la página', () => {
  jugar();
  expect(fireEvent.keyDown(window, { key: 'ArrowDown' })).toBe(false); // false = se llamó a preventDefault
  expect(fireEvent.keyDown(window, { key: ' ' })).toBe(false);
  expect(fireEvent.keyDown(window, { key: 'q' })).toBe(true);
});

test('P y Esc pausan y reanudan según el estado que informa el servidor; en pausa no se juega', () => {
  jugar();
  fireEvent.keyDown(window, { key: 'p' });
  expect(ws().enviados.at(-1)).toEqual({ type: 'pause' });
  ws().recibir(estado({ paused: true }));
  expect(screen.getByText('En pausa')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  expect(ws().enviados.at(-1)).toEqual({ type: 'pause' }); // la tecla se ignoró
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(ws().enviados.at(-1)).toEqual({ type: 'resume' });
  fireEvent.click(screen.getByRole('button', { name: 'Reanudar' }));
  expect(ws().enviados.at(-1)).toEqual({ type: 'resume' });
});

test('game_over muestra el mensaje y el resultado final, y permite jugar de nuevo', () => {
  jugar({ score: 40 });
  ws().recibir({ type: 'game_over', data: { score: 980, level: 2, lines: 12, reason: 'top_out', tick: 30 } });
  expect(screen.getByText('La pila llegó arriba.')).toBeTruthy();
  expect(screen.getByText('980')).toBeTruthy();
  expect(screen.getByText('12')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Jugar de nuevo' }));
  expect(ws().enviados.at(-1)).toEqual({ type: 'start' });
  // Mientras llega el primer estado de la partida nueva no hay mensaje de fin.
  expect(screen.queryByText('La pila llegó arriba.')).toBeNull();
});

test('sin conexión muestra el error y Reintentar abre otra conexión', () => {
  render(<Tetris />);
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
  render(<Tetris />);
  ws().abrir();
  ws().recibir({ type: 'error', error: 'NOT_STARTED', message: 'Envía primero un mensaje start' });
  expect(screen.getByRole('alert').textContent).toBe('Envía primero un mensaje start');
});

test('los botones táctiles envían las teclas', () => {
  jugar();
  for (const nombre of ['Izquierda', 'Girar', 'Derecha', 'Bajar', 'Caída rápida']) {
    fireEvent.click(screen.getByRole('button', { name: nombre }));
  }
  expect(enviados().map((m) => m.key)).toEqual(['left', 'rotate', 'right', 'soft_drop', 'hard_drop']);
});

test('al salir de la pantalla se cierra la conexión', () => {
  const { unmount } = render(<Tetris />);
  const conexion = ws();
  unmount();
  expect(conexion.cerrado).toBe(true);
});
