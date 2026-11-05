// Pruebas del componente Rustlike con un servidor simulado (fetch falso): tablero, teclado, botón Bajar, errores y limpieza.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Rustlike from './Rustlike.jsx';
import { crearPartida } from '../api/rustlike.js';

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
    parts: {
      legs: { name: 'basic', corrosion: 0, condition: 'optimal' },
      arms: { name: 'basic', corrosion: 30, condition: 'light' },
      sensors: { name: 'basic', corrosion: 60, condition: 'severe' },
      core: { name: 'basic', corrosion: 80, condition: 'critical' },
    },
    items: ['oil_can', null, null],
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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Usar' }).disabled).toBe(false));
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

test('muestra solo las últimas 5 líneas del log', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ log: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'] }, {}), 201));
  render(<Rustlike />);
  await screen.findByRole('img', { name: 'Piso 1' });
  expect(screen.queryByText('a5')).toBeNull();
  expect(screen.getByText('a6')).toBeTruthy();
  expect(screen.getByText('a10')).toBeTruthy();
});

test('piezas, objetos, Recoger y registro van en el panel lateral, junto al tablero', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ allowedActions: ['move', 'wait', 'pick'] }, {}), 201));
  render(<Rustlike />);
  const tablero = await screen.findByRole('img', { name: 'Piso 1' });
  const panel = screen.getByRole('complementary', { name: 'Estado del robot' });
  expect(within(panel).getByRole('list', { name: 'Piezas' })).toBeTruthy();
  expect(within(panel).getByRole('list', { name: 'Objetos' })).toBeTruthy();
  expect(within(panel).getByRole('button', { name: 'Recoger' })).toBeTruthy();
  expect(within(panel).getByRole('list', { name: 'Registro' })).toBeTruthy();
  // El panel y el tablero comparten contenedor: el panel queda a la derecha del mapa.
  expect(panel.parentElement).toBe(tablero.closest('.rustlike__juego'));
});

test('borra la partida al salir', async () => {
  const { unmount } = render(<Rustlike />);
  await screen.findByRole('img', { name: 'Piso 1' });
  unmount();
  expect(llamadas('DELETE', '/games/abc')).toHaveLength(1);
});

test('Enter y espacio sobre un botón con foco no mueven al robot', async () => {
  await abrir();
  const boton = screen.getByRole('button', { name: 'Nueva partida' });
  boton.focus();
  const sinCancelar = fireEvent.keyDown(boton, { key: 'Enter' });
  fireEvent.keyDown(boton, { key: ' ' });
  expect(sinCancelar).toBe(true); // no se llamó a preventDefault
  expect(llamadas('POST', '/move')).toHaveLength(0);
});

test('con un botón enfocado las flechas siguen moviendo al robot', async () => {
  await abrir();
  const boton = screen.getByRole('button', { name: 'Nueva partida' });
  boton.focus();
  fetchFalso.mockImplementationOnce(() => json(estado({ turn: 4 })));
  fireEvent.keyDown(boton, { key: 'ArrowRight' });
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(1));
  expect(cuerpoDe(llamadas('POST', '/move')[0]).action).toEqual({ type: 'move', dir: 'right' });
});

test('tras hacer clic en «Nueva partida» el espacio espera y no reinicia la partida', async () => {
  await abrir();
  const boton = screen.getByRole('button', { name: 'Nueva partida' });
  boton.focus();
  fireEvent.click(boton);
  await screen.findByRole('img', { name: 'Piso 1' });
  expect(llamadas('POST', '/games')).toHaveLength(2);
  expect(document.activeElement).not.toBe(boton);
  fetchFalso.mockImplementationOnce(() => json(estado({ turn: 4 })));
  fireEvent.keyDown(document.activeElement, { key: ' ' });
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(1));
  expect(cuerpoDe(llamadas('POST', '/move')[0]).action).toEqual({ type: 'wait' });
  expect(llamadas('POST', '/games')).toHaveLength(2);
});

test('tras hacer clic en «Bajar» el botón pierde el foco', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ allowedActions: ['move', 'wait', 'descend'] }), 201));
  await abrir();
  const boton = screen.getByRole('button', { name: 'Bajar' });
  boton.focus();
  fireEvent.click(boton);
  expect(document.activeElement).not.toBe(boton);
});

test('tras hacer clic en «Reintentar» el botón pierde el foco', async () => {
  fetchFalso.mockImplementationOnce(() => Promise.reject(new Error('caído')));
  render(<Rustlike />);
  const boton = await screen.findByRole('button', { name: 'Reintentar' });
  boton.focus();
  fireEvent.click(boton);
  expect(document.activeElement).not.toBe(boton);
});

test('crearPartida(42) envía la semilla dentro de options', async () => {
  await crearPartida(42);
  expect(cuerpoDe(llamadas('POST', '/games')[0])).toEqual({ options: { seed: 42 } });
});

test('muestra el nombre de la zona en español', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ zone: 'treatment_plant' }), 201));
  await abrir();
  expect(screen.getByText('Zona: Planta de tratamiento')).toBeTruthy();
});

test('si la partida ya no existe avisa y deja «Nueva partida»', async () => {
  await abrir();
  fetchFalso.mockImplementationOnce(() => json({ error: 'NOT_FOUND', message: 'no existe' }, 404));
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect((await screen.findByRole('alert')).textContent).toBe('La partida ya no existe en el servidor. Empieza una nueva.');
  expect(screen.getByRole('button', { name: 'Nueva partida' })).toBeTruthy();
});

// Pone el estado con las acciones y datos dados enviando una espera falsa.
async function conEstado(data) {
  fetchFalso.mockImplementationOnce(() => json(estado(data)));
  fireEvent.keyDown(window, { key: '.' });
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(1));
  await waitFor(() => expect(screen.getByText(/Turno/).textContent).toContain(String(data.turn ?? 3)));
}

test('muestra las cuatro piezas con su corrosión y estado', async () => {
  await abrir();
  const fila = (n) => screen.getByText(n).closest('li');
  expect(fila('Piernas básicas').textContent).toContain('Óptimo');
  expect(fila('Brazos básicos').textContent).toContain('Leve');
  expect(fila('Sensores básicos').textContent).toContain('Grave');
  expect(fila('Núcleo básico').textContent).toContain('Crítico');
  expect(fila('Núcleo básico').querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('80');
  expect(screen.getByText('Lata de aceite')).toBeTruthy();
});

test('muestra Bloqueado para una pieza bloqueada', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ parts: { ...estado().data.parts, legs: { name: 'basic', corrosion: 100, condition: 'blocked' } } }), 201));
  await abrir();
  expect(screen.getByText('Piernas básicas').closest('li').textContent).toContain('Bloqueado');
});

test('dibuja los charcos', async () => {
  const e = estado();
  e.board[1][0] = 'puddle';
  fetchFalso.mockImplementationOnce(() => json(e, 201));
  await abrir();
  expect(document.querySelectorAll('rect.casilla--puddle')).toHaveLength(1);
});

test('dibuja ácaros, drones y latas visibles', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ entities: [
    { id: 1, kind: 'rust_mite', x: 0, y: 1, elite: null, integrity: 10, maxIntegrity: 15 },
    { id: 2, kind: 'drone', x: 1, y: 0, elite: null, integrity: 30, maxIntegrity: 30 },
    { id: 3, kind: 'oil_can', x: 2, y: 0 },
  ] }), 201));
  await abrir();
  expect(document.querySelectorAll('g[data-kind="rust_mite"]')).toHaveLength(1);
  expect(document.querySelectorAll('g[data-kind="drone"]')).toHaveLength(1);
  expect(document.querySelectorAll('g[data-kind="oil_can"]')).toHaveLength(1);
  // solo el ácaro dañado lleva barra de integridad
  expect(document.querySelectorAll('.enemigo__barra')).toHaveLength(1);
});

test('G envía pick y el botón Recoger solo aparece con pick permitido', async () => {
  await abrir();
  expect(screen.queryByRole('button', { name: 'Recoger' })).toBeNull();
  await conEstado({ turn: 4, allowedActions: ['move', 'wait', 'pick'] });
  expect(screen.getByRole('button', { name: 'Recoger' })).toBeTruthy();
  fetchFalso.mockImplementationOnce(() => json(estado({ turn: 5 })));
  fireEvent.keyDown(window, { key: 'g' });
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(2));
  expect(cuerpoDe(llamadas('POST', '/move').at(-1)).action).toEqual({ type: 'pick' });
});

test('G sin pick permitido no envía nada y el botón Recoger envía pick', async () => {
  await abrir();
  fireEvent.keyDown(window, { key: 'G' });
  expect(llamadas('POST', '/move')).toHaveLength(0);
  await conEstado({ turn: 4, allowedActions: ['move', 'wait', 'pick'] });
  fetchFalso.mockImplementationOnce(() => json(estado({ turn: 5 })));
  const boton = screen.getByRole('button', { name: 'Recoger' });
  fireEvent.click(boton);
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(2));
  expect(cuerpoDe(llamadas('POST', '/move').at(-1)).action).toEqual({ type: 'pick' });
  expect(document.activeElement).not.toBe(boton);
});

test('usar la lata pide la pieza y envía use con target', async () => {
  await abrir();
  fireEvent.keyDown(window, { key: '1' });
  fetchFalso.mockImplementationOnce(() => json(estado({ turn: 4 })));
  fireEvent.click(screen.getByRole('button', { name: 'Brazos' }));
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(1));
  expect(cuerpoDe(llamadas('POST', '/move')[0]).action).toEqual({ type: 'use', slot: 0, target: 'arms' });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Brazos' })).toBeNull());
});

test('el selector deshabilita las piezas sin óxido', async () => {
  await abrir();
  fireEvent.keyDown(window, { key: '1' });
  expect(screen.getByRole('button', { name: 'Piernas' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Brazos' }).disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Cancelar' }).disabled).toBe(false);
});

test('las teclas 1-3 y Usar no abren el selector con una petición en curso', async () => {
  await abrir();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Usar' }).disabled).toBe(false));
  let resolver;
  fetchFalso.mockImplementationOnce(() => new Promise((r) => { resolver = () => r({ ok: true, status: 200, json: () => Promise.resolve(estado({ turn: 4 })) }); }));
  fireEvent.keyDown(window, { key: '.' });
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(1));
  fireEvent.keyDown(window, { key: '1' });
  expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  resolver();
  await waitFor(() => expect(screen.getByText(/Turno/).textContent).toContain('4'));
  fireEvent.keyDown(window, { key: '1' });
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
});

test('las latas se dibujan antes que los enemigos (el enemigo queda encima)', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ entities: [
    { id: 1, kind: 'rust_mite', x: 2, y: 0, elite: null, integrity: 15, maxIntegrity: 15 },
    { id: 3, kind: 'oil_can', x: 2, y: 0 },
  ] }), 201));
  await abrir();
  const orden = [...document.querySelectorAll('g[data-kind]')].map((g) => g.getAttribute('data-kind'));
  expect(orden).toEqual(['oil_can', 'rust_mite']);
});

test('el botón Usar abre el selector y las teclas 2 y 3 sin objeto no hacen nada', async () => {
  await abrir();
  fireEvent.keyDown(window, { key: '2' });
  fireEvent.keyDown(window, { key: '3' });
  expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Usar' }));
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
});

test('Esc cierra el selector sin enviar nada', async () => {
  await abrir();
  fireEvent.keyDown(window, { key: '1' });
  expect(screen.getByRole('button', { name: 'Núcleo' })).toBeTruthy();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('button', { name: 'Núcleo' })).toBeNull();
  fireEvent.keyDown(window, { key: '1' });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('button', { name: 'Núcleo' })).toBeNull();
  expect(llamadas('POST', '/move')).toHaveLength(0);
});

test('con el selector abierto las flechas no mueven', async () => {
  await abrir();
  fireEvent.keyDown(window, { key: '1' });
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  fireEvent.keyDown(window, { key: ' ' });
  expect(llamadas('POST', '/move')).toHaveLength(0);
});

test('al perder muestra el fin de partida y no envía teclas', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ floor: 3, score: 120 }, { status: 'lost' }), 201));
  render(<Rustlike />);
  await screen.findByText('Fin de la partida');
  expect(screen.getByText('Llegaste al piso 3')).toBeTruthy();
  expect(screen.getByText('Puntaje: 120')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  fireEvent.keyDown(window, { key: '1' });
  fireEvent.keyDown(window, { key: 'g' });
  expect(llamadas('POST', '/move')).toHaveLength(0);
  const nueva = screen.getAllByRole('button', { name: 'Nueva partida' });
  fireEvent.click(nueva[0]);
  await waitFor(() => expect(llamadas('POST', '/games')).toHaveLength(2));
});

test('el color de cada pieza sigue su estado', async () => {
  await abrir();
  const forma = (p) => document.querySelector(`.robot [data-part="${p}"]`);
  expect(forma('legs').getAttribute('data-condition')).toBe('optimal');
  expect(forma('arms').getAttribute('data-condition')).toBe('light');
  expect(forma('sensors').getAttribute('data-condition')).toBe('severe');
  expect(forma('core').getAttribute('data-condition')).toBe('critical');
});

test('Usar, Recoger y Bajar quedan inactivos al perder', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ allowedActions: ['move', 'pick', 'descend'] }, { status: 'lost' }), 201));
  render(<Rustlike />);
  await screen.findByText('Fin de la partida');
  for (const n of ['Usar', 'Recoger', 'Bajar']) expect(screen.getByRole('button', { name: n }).disabled).toBe(true);
});

test('Usar se desactiva mientras hay una petición en curso', async () => {
  await abrir();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Usar' }).disabled).toBe(false));
  let resolver;
  fetchFalso.mockImplementationOnce(() => new Promise((r) => { resolver = r; }));
  fireEvent.keyDown(window, { key: '.' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Usar' }).disabled).toBe(true));
  resolver({ ok: true, status: 200, json: () => Promise.resolve(estado({ turn: 4 })) });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Usar' }).disabled).toBe(false));
});

// Como conEstado, pero cuenta las jugadas ya enviadas.
async function esperar(data) {
  const antes = llamadas('POST', '/move').length;
  fetchFalso.mockImplementationOnce(() => json(estado(data)));
  fireEvent.keyDown(window, { key: '.' });
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(antes + 1));
  await waitFor(() => expect(screen.getByText(/Turno/).textContent).toContain(String(data.turn ?? 3)));
}

const e1 = (id, kind, x, y, extra = {}) => ({ id, kind, x, y, elite: null, integrity: 25, maxIntegrity: 25, ...extra });

test('dibuja torretas, robots oxidados, goteras, piezas y consumibles', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ entities: [
    e1(1, 'turret', 0, 0), e1(2, 'rusty_robot', 1, 0, { integrity: 30, maxIntegrity: 60 }),
    e1(3, 'leak', 2, 0, { integrity: null, maxIntegrity: null }),
    { id: 4, kind: 'part', slot: 'arms', name: 'drill', corrosion: 20, x: 0, y: 1 },
    { id: 5, kind: 'lubricant_spray', x: 1, y: 1 }, { id: 6, kind: 'protective_grease', x: 2, y: 1 },
  ] }), 201));
  await abrir();
  for (const k of ['turret', 'rusty_robot', 'leak', 'part', 'lubricant_spray', 'protective_grease']) {
    expect(document.querySelectorAll(`g[data-kind="${k}"]`)).toHaveLength(1);
  }
  expect(document.querySelector('g[data-kind="part"]').textContent).toBe('B');
  // solo el robot dañado lleva barra; la gotera nunca
  expect(document.querySelectorAll('.enemigo__barra')).toHaveLength(1);
});

test('los detectados se dibujan atenuados', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ entities: [
    e1(1, 'turret', 0, 0, { detected: true }), e1(2, 'drone', 1, 0),
  ] }), 201));
  await abrir();
  expect(document.querySelector('g[data-kind="turret"]').getAttribute('data-detected')).toBe('true');
  expect(document.querySelector('g[data-kind="drone"]').hasAttribute('data-detected')).toBe(false);
});

test('el nombre de la pieza sigue el modelo', async () => {
  const p = estado().data.parts;
  fetchFalso.mockImplementationOnce(() => json(estado({ parts: {
    legs: { ...p.legs, name: 'tracked' }, arms: { ...p.arms, name: 'magnetic' },
    sensors: { ...p.sensors, name: 'thermal' }, core: p.core,
  } }), 201));
  await abrir();
  for (const n of ['Piernas de oruga', 'Brazos magnéticos', 'Sensores térmicos', 'Núcleo básico']) expect(screen.getByText(n)).toBeTruthy();
});

test('X y el botón Cambiar pieza envían swap solo si está permitido', async () => {
  await abrir();
  expect(screen.queryByRole('button', { name: 'Cambiar pieza' })).toBeNull();
  fireEvent.keyDown(window, { key: 'x' });
  expect(llamadas('POST', '/move')).toHaveLength(0);
  await esperar({ turn: 4, allowedActions: ['move', 'wait', 'swap'] });
  fetchFalso.mockImplementationOnce(() => json(estado({ turn: 5 })));
  fireEvent.keyDown(window, { key: 'X' });
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(2));
  expect(cuerpoDe(llamadas('POST', '/move').at(-1)).action).toEqual({ type: 'swap' });
  await esperar({ turn: 6, allowedActions: ['move', 'wait', 'swap'] });
  fetchFalso.mockImplementationOnce(() => json(estado({ turn: 7 })));
  const boton = screen.getByRole('button', { name: 'Cambiar pieza' });
  fireEvent.click(boton);
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(4));
  expect(cuerpoDe(llamadas('POST', '/move').at(-1)).action).toEqual({ type: 'swap' });
  expect(document.activeElement).not.toBe(boton);
});

test('usar spray o grasa no abre el selector y envía use sin target', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ items: ['lubricant_spray', 'protective_grease', null] }), 201));
  await abrir();
  expect(screen.getByText('Spray lubricante')).toBeTruthy();
  expect(screen.getByText('Grasa protectora')).toBeTruthy();
  fetchFalso.mockImplementationOnce(() => json(estado({ turn: 4, items: ['lubricant_spray', 'protective_grease', null] })));
  fireEvent.keyDown(window, { key: '1' });
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(1));
  expect(cuerpoDe(llamadas('POST', '/move')[0]).action).toEqual({ type: 'use', slot: 0 });
  expect(screen.queryByRole('dialog', { name: 'Elegir pieza' })).toBeNull();
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Usar' })[1].disabled).toBe(false));
  fetchFalso.mockImplementationOnce(() => json(estado({ turn: 5 })));
  fireEvent.click(screen.getAllByRole('button', { name: 'Usar' })[1]);
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(2));
  expect(cuerpoDe(llamadas('POST', '/move')[1]).action).toEqual({ type: 'use', slot: 1 });
  expect(screen.queryByRole('dialog', { name: 'Elegir pieza' })).toBeNull();
});

test('muestra grasa y salto cuando aplican', async () => {
  await abrir();
  expect(screen.queryByText(/Grasa:/)).toBeNull();
  expect(screen.queryByText(/Salto:/)).toBeNull();
  await esperar({ turn: 4, effects: { grease: 7, jumpCooldown: 3 } });
  expect(screen.getByText('Grasa: 7 turnos')).toBeTruthy();
  expect(screen.getByText('Salto: 3 turnos')).toBeTruthy();
  await esperar({ turn: 5, effects: { grease: 0, jumpCooldown: 0 } });
  expect(screen.queryByText(/Grasa:/)).toBeNull();
  expect(screen.getByText('Salto: listo')).toBeTruthy();
});
