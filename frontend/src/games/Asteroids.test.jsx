// Pruebas del componente Asteroids con un WebSocket falso: conexión, dibujo, teclas mantenidas, pausa, fin y errores.
import { act } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Asteroids from './Asteroids.jsx';

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
  abrir() { this.readyState = 1; act(() => this.onopen?.()); }
  recibir(msg) { act(() => this.onmessage?.({ data: JSON.stringify(msg) })); }
  caer() { this.readyState = 3; act(() => this.onclose?.()); }
}

// Mensaje `state` de ejemplo: la nave, dos asteroides y una bala.
const estado = (data = {}, events = []) => ({
  type: 'state',
  tick: 2,
  status: 'playing',
  board: null,
  data: {
    ship: { x: 400, y: 300, angle: 1.57, thrusting: true, invulnerable: false },
    asteroids: [
      { id: 1, x: 100, y: 80, size: 'large', r: 40 },
      { id: 2, x: 600, y: 400, size: 'small', r: 12 },
    ],
    bullets: [{ x: 410, y: 280 }],
    score: 0, combo: 1, lives: 3, wave: 1, paused: false,
    ...data,
  },
  events,
});

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
function jugar(data, events) {
  render(<Asteroids />);
  ws().abrir();
  fireEvent.click(screen.getByRole('button', { name: 'Jugar' }));
  ws().recibir(estado(data, events));
}

const enviados = () => ws().enviados.slice(1); // sin el `start`

test('se conecta al gateway y permite jugar cuando la conexión se abre', () => {
  render(<Asteroids />);
  expect(ws().url).toBe('ws://localhost:5173/ws/asteroids');
  expect(screen.getByText('Conectando…')).toBeTruthy();
  ws().abrir();
  expect(screen.getByRole('button', { name: 'Jugar' })).toBeTruthy();
});

test('Jugar envía start y dibuja la nave, los asteroides y las balas', () => {
  jugar();
  expect(ws().enviados).toEqual([{ type: 'start' }]);
  const mundo = screen.getByRole('img', { name: 'Mundo de Asteroids' });
  expect(mundo.getAttribute('viewBox')).toBe('0 0 800 600');
  expect(mundo.querySelectorAll('.asteroids__roca')).toHaveLength(2);
  expect(mundo.querySelectorAll('.asteroids__bala')).toHaveLength(1);
  const nave = screen.getByTestId('nave');
  expect(nave.getAttribute('transform')).toContain('translate(400 300)');
  expect(nave.querySelector('.asteroids__llama')).toBeTruthy(); // thrusting: se ve la llama
});

test('la nave invulnerable parpadea y sin empuje no tiene llama', () => {
  jugar({ ship: { x: 1, y: 2, angle: 0, thrusting: false, invulnerable: true } });
  const nave = screen.getByTestId('nave');
  expect(nave.querySelector('.asteroids__nave--parpadea')).toBeTruthy();
  expect(nave.querySelector('.asteroids__llama')).toBeNull();
});

test('muestra puntaje, oleada, vidas y combo', () => {
  jugar({ score: 4250, wave: 4, lives: 2, combo: 3 });
  expect(screen.getByText('4250')).toBeTruthy();
  expect(screen.getByText('4')).toBeTruthy();
  expect(screen.getByLabelText('Vidas').textContent).toBe('2');
  expect(screen.getByText('x3')).toBeTruthy();
});

test('las teclas se envían al pulsar y al soltar, sin repetir el aviso mientras se mantienen', () => {
  jugar();
  fireEvent.keyDown(window, { key: 'ArrowUp' });
  fireEvent.keyDown(window, { key: 'ArrowUp', repeat: true });
  fireEvent.keyDown(window, { key: 'ArrowUp', repeat: true });
  fireEvent.keyDown(window, { key: ' ' });
  fireEvent.keyUp(window, { key: 'ArrowUp' });
  fireEvent.keyUp(window, { key: ' ' });
  expect(enviados()).toEqual([
    { type: 'input', key: 'thrust', pressed: true },
    { type: 'input', key: 'fire', pressed: true },
    { type: 'input', key: 'thrust', pressed: false },
    { type: 'input', key: 'fire', pressed: false },
  ]);
});

test('flechas y WASD se traducen a las teclas del contrato; otras no envían nada', () => {
  jugar();
  for (const key of ['ArrowLeft', 'ArrowRight', 'a', 'd', 'w', 'q']) {
    fireEvent.keyDown(window, { key });
    fireEvent.keyUp(window, { key });
  }
  expect(enviados().filter((m) => m.pressed).map((m) => m.key)).toEqual([
    'rotate_left', 'rotate_right', 'rotate_left', 'rotate_right', 'thrust',
  ]);
});

test('soltar una tecla que no estaba pulsada no envía nada', () => {
  jugar();
  fireEvent.keyUp(window, { key: 'ArrowLeft' });
  expect(enviados()).toEqual([]);
});

test('las flechas y el espacio no desplazan la página', () => {
  jugar();
  expect(fireEvent.keyDown(window, { key: 'ArrowUp' })).toBe(false); // false = se llamó a preventDefault
  expect(fireEvent.keyDown(window, { key: ' ' })).toBe(false);
  expect(fireEvent.keyDown(window, { key: 'q' })).toBe(true);
});

test('perder el foco suelta las teclas pulsadas para que no se queden atascadas', () => {
  jugar();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  fireEvent.keyDown(window, { key: 'ArrowUp' });
  fireEvent(window, new Event('blur'));
  expect(enviados().slice(2)).toEqual([
    { type: 'input', key: 'rotate_right', pressed: false },
    { type: 'input', key: 'thrust', pressed: false },
  ]);
});

test('P y Esc pausan y reanudan; al pausar se sueltan las teclas y en pausa no se juega', () => {
  jugar();
  fireEvent.keyDown(window, { key: 'ArrowUp' });
  fireEvent.keyDown(window, { key: 'p' });
  expect(enviados().slice(1)).toEqual([{ type: 'input', key: 'thrust', pressed: false }, { type: 'pause' }]);
  ws().recibir(estado({ paused: true }));
  expect(screen.getByText('En pausa')).toBeTruthy();
  const antes = ws().enviados.length;
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  expect(ws().enviados).toHaveLength(antes); // ignorada
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(ws().enviados.at(-1)).toEqual({ type: 'resume' });
  fireEvent.click(screen.getByRole('button', { name: 'Reanudar' }));
  expect(ws().enviados.at(-1)).toEqual({ type: 'resume' });
});

test('los eventos del servidor activan los efectos: sacudida al perder la nave y pulso al subir el combo', () => {
  jugar();
  const mundo = () => screen.getByRole('img', { name: 'Mundo de Asteroids' });
  expect(mundo().getAttribute('class')).not.toContain('sacude');
  ws().recibir(estado({ combo: 2 }, ['asteroid_destroyed', 'combo_up']));
  expect(screen.getByText('x2').getAttribute('class')).toContain('asteroids__combo--sube');
  expect(mundo().getAttribute('class')).not.toContain('sacude');
  ws().recibir(estado({ lives: 2 }, ['ship_destroyed']));
  expect(mundo().getAttribute('class')).toContain('asteroids__mundo--sacude');
});

test('game_over muestra el mensaje y el resultado final, y permite jugar de nuevo', () => {
  jugar({ score: 40 });
  ws().recibir({ type: 'game_over', data: { score: 9800, wave: 7, reason: 'no_lives', tick: 3000 } });
  expect(screen.getByText('Te quedaste sin vidas.')).toBeTruthy();
  expect(screen.getByText('9800')).toBeTruthy();
  expect(screen.getByText('7')).toBeTruthy();
  expect(screen.queryByTestId('nave')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Jugar de nuevo' }));
  expect(ws().enviados.at(-1)).toEqual({ type: 'start' });
  expect(screen.queryByText('Te quedaste sin vidas.')).toBeNull();
});

test('sin conexión muestra el error y Reintentar abre otra conexión', () => {
  render(<Asteroids />);
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
  render(<Asteroids />);
  ws().abrir();
  ws().recibir({ type: 'error', error: 'NOT_STARTED', message: 'Envía primero un mensaje start' });
  expect(screen.getByRole('alert').textContent).toBe('Envía primero un mensaje start');
});

test('los botones táctiles mantienen la tecla mientras están pulsados', () => {
  jugar();
  const acelerar = screen.getByRole('button', { name: 'Acelerar' });
  fireEvent.pointerDown(acelerar);
  fireEvent.pointerUp(acelerar);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Disparar' }));
  fireEvent.pointerLeave(screen.getByRole('button', { name: 'Disparar' }));
  expect(enviados()).toEqual([
    { type: 'input', key: 'thrust', pressed: true },
    { type: 'input', key: 'thrust', pressed: false },
    { type: 'input', key: 'fire', pressed: true },
    { type: 'input', key: 'fire', pressed: false },
  ]);
});

test('al salir de la pantalla se cierra la conexión', () => {
  const { unmount } = render(<Asteroids />);
  const conexion = ws();
  unmount();
  expect(conexion.cerrado).toBe(true);
});

test('al ganar una vida extra se avisa un momento y se actualizan las vidas', () => {
  vi.useFakeTimers();
  try {
    jugar({ lives: 3 });
    expect(screen.queryByText('¡Vida extra!')).toBeNull();
    ws().recibir(estado({ lives: 4, wave: 5 }, ['wave_cleared', 'extra_life']));
    expect(screen.getByText('¡Vida extra!')).toBeTruthy();
    expect(screen.getByLabelText('Vidas').textContent).toBe('4');
    expect(screen.getByLabelText('Vidas').className).toContain('asteroids__vidas--sube');
    act(() => vi.advanceTimersByTime(2100));
    expect(screen.queryByText('¡Vida extra!')).toBeNull();
    expect(screen.getByLabelText('Vidas').textContent).toBe('4');
  } finally {
    vi.useRealTimers();
  }
});

test('sin el evento extra_life no hay aviso aunque cambien las vidas', () => {
  jugar({ lives: 3 });
  ws().recibir(estado({ lives: 2 }, ['ship_destroyed']));
  expect(screen.queryByText('¡Vida extra!')).toBeNull();
});
