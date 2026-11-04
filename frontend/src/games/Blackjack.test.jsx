// Pruebas del componente Blackjack con un servidor simulado (fetch falso): apuesta, turno, botones, resultados y errores.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Blackjack from './Blackjack.jsx';

const carta = (rank, suit = 'spades') => ({ rank, suit });
const OCULTA = { hidden: true };

// Estado como lo devolvería el servicio. `data` se mezcla sobre una fase de apuesta vacía.
const estado = (data = {}, extra = {}) => ({
  id: 'abc',
  game: 'blackjack',
  status: 'playing',
  board: null,
  message: null,
  data: {
    phase: 'betting', chips: 1000, minBet: 10, maxBet: 500,
    dealer: { cards: [], value: null }, hands: [], activeHand: null, allowedActions: ['bet'],
    ...data,
  },
  ...extra,
});

// Estado en el turno del jugador: A+6 contra un 7 visible y una carta oculta.
const turno = (data = {}) => estado({
  phase: 'player_turn', chips: 950,
  dealer: { cards: [carta('7', 'diamonds'), OCULTA], value: null },
  hands: [{ cards: [carta('A', 'hearts'), carta('6', 'clubs')], value: 17, soft: true, bet: 50, result: null }],
  activeHand: 0, allowedActions: ['hit', 'stand', 'double'],
  ...data,
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

// Abre la pantalla y espera a que cargue la sesión.
async function abrir() {
  render(<Blackjack />);
  await screen.findByRole('button', { name: 'Repartir' });
}

// Responde con `respuesta` a la siguiente jugada y pulsa el botón indicado.
async function pulsar(nombre, respuesta) {
  fetchFalso.mockImplementationOnce(() => json(respuesta));
  fireEvent.click(screen.getByRole('button', { name: nombre }));
  await waitFor(() => expect(llamadas('POST', '/move').length).toBeGreaterThan(0));
}

test('crea una sesión al entrar y muestra las fichas y la apuesta', async () => {
  render(<Blackjack />);
  expect(screen.getByText('Preparando la mesa…')).toBeTruthy();
  await screen.findByRole('button', { name: 'Repartir' });
  expect(llamadas('POST', '/games')).toHaveLength(1);
  expect(screen.getByLabelText('Fichas').textContent).toBe('1000');
  expect(screen.getByLabelText('Apuesta').value).toBe('50');
  expect(screen.getByText('Haz tu apuesta para repartir.')).toBeTruthy();
});

test('Repartir envía la apuesta elegida con las fichas rápidas', async () => {
  await abrir();
  fireEvent.click(screen.getByRole('button', { name: '100' }));
  await pulsar('Repartir', turno());
  expect(cuerpoDe(llamadas('POST', '/move')[0])).toEqual({ action: { type: 'bet', amount: 100 } });
});

test('también se puede escribir la apuesta a mano', async () => {
  await abrir();
  fireEvent.change(screen.getByLabelText('Apuesta'), { target: { value: '275' } });
  await pulsar('Repartir', turno());
  expect(cuerpoDe(llamadas('POST', '/move')[0]).action.amount).toBe(275);
});

test('dibuja las cartas del jugador y del crupier, con su carta boca abajo', async () => {
  await abrir();
  await pulsar('Repartir', turno());
  const crupier = await screen.findByLabelText('Crupier');
  expect(within(crupier).getByRole('img', { name: '7 de diamantes' })).toBeTruthy();
  expect(within(crupier).getByRole('img', { name: 'Carta boca abajo' })).toBeTruthy();
  expect(screen.queryByLabelText('Valor del crupier')).toBeNull(); // oculto hasta que se revele
  const mano = screen.getByLabelText('Mano 1');
  expect(within(mano).getByRole('img', { name: 'A de corazones' })).toBeTruthy();
  expect(within(mano).getByRole('img', { name: '6 de tréboles' })).toBeTruthy();
  expect(screen.getByLabelText('Fichas').textContent).toBe('950');
  expect(mano.className).toContain('blackjack__mano--activa');
});

test('una mano suave muestra las dos cuentas y una dura solo el total', async () => {
  await abrir();
  await pulsar('Repartir', turno());
  expect((await screen.findByLabelText('Valor de la mano 1')).textContent).toBe('7 / 17');
  fetchFalso.mockImplementationOnce(() => json(turno({ hands: [{ cards: [carta('K'), carta('9')], value: 19, soft: false, bet: 50, result: null }] })));
  fireEvent.click(screen.getByRole('button', { name: 'Pedir carta' }));
  await waitFor(() => expect(screen.getByLabelText('Valor de la mano 1').textContent).toBe('19'));
});

test('los botones se habilitan según allowedActions', async () => {
  await abrir();
  await pulsar('Repartir', turno());
  await screen.findByRole('button', { name: 'Pedir carta' });
  expect(screen.getByRole('button', { name: 'Pedir carta' }).disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Plantarse' }).disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Doblar' }).disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Dividir' }).disabled).toBe(true); // el servidor no la permite
});

test('cada botón envía su acción', async () => {
  await abrir();
  await pulsar('Repartir', turno({ allowedActions: ['hit', 'stand', 'double', 'split'] }));
  for (const [nombre, tipo] of [['Pedir carta', 'hit'], ['Doblar', 'double'], ['Dividir', 'split'], ['Plantarse', 'stand']]) {
    fetchFalso.mockImplementationOnce(() => json(turno({ allowedActions: ['hit', 'stand', 'double', 'split'] })));
    fireEvent.click(await screen.findByRole('button', { name: nombre }));
    await waitFor(() => expect(llamadas('POST', '/move').at(-1) && cuerpoDe(llamadas('POST', '/move').at(-1)).action.type).toBe(tipo));
    await waitFor(() => expect(screen.getByRole('button', { name: nombre }).disabled).toBe(false));
  }
});

test('con dos manos tras dividir solo resalta la activa', async () => {
  await abrir();
  const mano = (cartas, valor) => ({ cards: cartas, value: valor, soft: false, bet: 50, result: null });
  await pulsar('Repartir', turno({
    hands: [mano([carta('8'), carta('3')], 11), mano([carta('8', 'hearts'), carta('4')], 12)],
    activeHand: 1, allowedActions: ['hit', 'stand'],
  }));
  const manos = await screen.findAllByLabelText(/^Mano \d$/);
  expect(manos).toHaveLength(2);
  expect(manos[0].className).not.toContain('activa');
  expect(manos[1].className).toContain('activa');
});

test('al terminar la ronda se revela al crupier, se muestran los resultados y se ofrece la siguiente ronda', async () => {
  await abrir();
  await pulsar('Repartir', turno());
  fetchFalso.mockImplementationOnce(() => json(estado({
    phase: 'round_over', chips: 1050,
    dealer: { cards: [carta('7', 'diamonds'), carta('K', 'hearts')], value: 17 },
    hands: [{ cards: [carta('A', 'hearts'), carta('9', 'clubs')], value: 20, soft: true, bet: 50, result: 'win' }],
    allowedActions: ['next_round'],
  })));
  fireEvent.click(screen.getByRole('button', { name: 'Plantarse' }));
  expect(await screen.findByText('Gana')).toBeTruthy();
  expect(screen.getByLabelText('Valor del crupier').textContent).toBe('17');
  expect(screen.queryByRole('img', { name: 'Carta boca abajo' })).toBeNull();
  expect(screen.getByLabelText('Fichas').textContent).toBe('1050');
  expect(screen.queryByRole('button', { name: 'Pedir carta' })).toBeNull();

  fetchFalso.mockImplementationOnce(() => json(estado({ chips: 1050 })));
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente ronda' }));
  await screen.findByRole('button', { name: 'Repartir' });
  expect(cuerpoDe(llamadas('POST', '/move').at(-1))).toEqual({ action: { type: 'next_round' } });
});

test.each([
  ['blackjack', '¡Blackjack!'], ['win', 'Gana'], ['push', 'Empate'], ['lose', 'Pierde'], ['bust', 'Se pasó'],
])('el resultado %s se muestra como «%s»', async (result, texto) => {
  await abrir();
  await pulsar('Repartir', estado({
    phase: 'round_over',
    dealer: { cards: [carta('7'), carta('K')], value: 17 },
    hands: [{ cards: [carta('K'), carta('9')], value: 19, soft: false, bet: 50, result }],
    allowedActions: ['next_round'],
  }));
  expect(await screen.findByText(texto)).toBeTruthy();
});

test('tras perder con pocas fichas la partida sigue: se ofrece la siguiente ronda con el mínimo', async () => {
  await abrir();
  await pulsar('Repartir', estado({
    phase: 'round_over', chips: 50,
    dealer: { cards: [carta('10'), carta('9')], value: 19 },
    hands: [{ cards: [carta('10', 'hearts'), carta('6')], value: 16, soft: false, bet: 10, result: 'lose' }],
    allowedActions: ['next_round'],
  }));
  expect(await screen.findByText('Pierde')).toBeTruthy();
  expect(screen.getByLabelText('Fichas').textContent).toBe('50');
  expect(screen.queryByRole('button', { name: 'Jugar de nuevo' })).toBeNull();
  fetchFalso.mockImplementationOnce(() => json(estado({ chips: 50 })));
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente ronda' }));
  await screen.findByRole('button', { name: 'Repartir' });
});

test('un error del servidor se muestra sin perder la mesa', async () => {
  await abrir();
  fetchFalso.mockImplementationOnce(() => json({ error: 'INVALID_MOVE', message: 'La apuesta debe estar entre 10 y 500 fichas' }, 422));
  fireEvent.click(screen.getByRole('button', { name: 'Repartir' }));
  expect((await screen.findByRole('alert')).textContent).toBe('La apuesta debe estar entre 10 y 500 fichas');
  expect(screen.getByRole('button', { name: 'Repartir' })).toBeTruthy();
});

test('no se envían dos acciones a la vez mientras una está en curso', async () => {
  await abrir();
  let resolver;
  fetchFalso.mockImplementationOnce(() => new Promise((r) => { resolver = r; }));
  fireEvent.click(screen.getByRole('button', { name: 'Repartir' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Repartir' }).disabled).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Repartir' }));
  expect(llamadas('POST', '/move')).toHaveLength(1);
  resolver({ ok: true, status: 200, json: () => Promise.resolve(turno()) });
  await screen.findByRole('button', { name: 'Pedir carta' });
});

test('Nueva partida libera la sesión anterior y crea otra', async () => {
  await abrir();
  fireEvent.click(screen.getByRole('button', { name: 'Nueva partida' }));
  await waitFor(() => expect(llamadas('POST', '/games')).toHaveLength(2));
  expect(llamadas('DELETE', '/games/abc')).toHaveLength(1);
});

test('sin conexión muestra el error y Reintentar vuelve a crear la sesión', async () => {
  fetchFalso.mockImplementationOnce(() => Promise.reject(new Error('sin red')));
  render(<Blackjack />);
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo conectar');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByRole('button', { name: 'Repartir' });
  expect(llamadas('POST', '/games')).toHaveLength(2);
});

test('al salir de la pantalla se libera la sesión', async () => {
  const { unmount } = render(<Blackjack />);
  await screen.findByRole('button', { name: 'Repartir' });
  unmount();
  expect(llamadas('DELETE', '/games/abc')).toHaveLength(1);
});
