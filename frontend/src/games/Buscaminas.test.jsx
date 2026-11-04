// Pruebas del componente Buscaminas con un servidor simulado (fetch falso): carga, jugadas, banderas, fin de partida y errores.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Buscaminas from './Buscaminas.jsx';

// Estado como lo devolvería el servicio: tablero 9x9 oculto salvo los cambios indicados ({'f,c': valor}).
const estado = ({ cambios = {}, status = 'playing', restantes = 10, filas = 9, cols = 9 } = {}) => {
  const board = Array.from({ length: filas }, () => Array(cols).fill(-1));
  for (const [pos, valor] of Object.entries(cambios)) {
    const [f, c] = pos.split(',').map(Number);
    board[f][c] = valor;
  }
  return { id: 'abc', game: 'buscaminas', status, board, message: null, data: { rows: filas, cols, mines: 10, flags: 0, mines_remaining: restantes } };
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
const cuerpoDe = (llamada) => JSON.parse(llamada[1].body);

// Casilla por posición (empieza en 1, como en las etiquetas).
const casilla = (f, c) => document.querySelector(`[data-pos="${f - 1}-${c - 1}"]`);

test('carga una partida fácil y dibuja 81 casillas', async () => {
  render(<Buscaminas />);
  expect(screen.getByText('Generando tablero…')).toBeTruthy();
  await waitFor(() => expect(document.querySelectorAll('.casilla')).toHaveLength(81));
  expect(cuerpoDe(llamadas('POST', '/games')[0])).toEqual({ options: { rows: 9, cols: 9, mines: 10 } });
  expect(screen.getByLabelText('Minas restantes').textContent).toBe('10');
});

test('clic izquierdo envía reveal y muestra el tablero que responde el servidor', async () => {
  render(<Buscaminas />);
  await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
  fetchFalso.mockImplementationOnce(() => json(estado({ cambios: { '0,0': 0, '0,1': 2 } })));
  fireEvent.click(casilla(1, 1));
  await waitFor(() => expect(casilla(1, 2).textContent).toBe('2'));
  expect(cuerpoDe(llamadas('POST', '/move')[0])).toEqual({ action: { type: 'reveal', row: 0, col: 0 } });
  expect(casilla(1, 1).className).toContain('casilla--vacia');
  expect(casilla(1, 2).getAttribute('aria-label')).toBe('Fila 1, columna 2, 2 minas vecinas');
});

test('clic derecho pone bandera sin abrir el menú del navegador', async () => {
  render(<Buscaminas />);
  await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
  fetchFalso.mockImplementationOnce(() => json(estado({ cambios: { '0,0': -2 }, restantes: 9 })));
  const permitido = fireEvent.contextMenu(casilla(1, 1)); // devuelve false si se llamó a preventDefault
  expect(permitido).toBe(false);
  await waitFor(() => expect(casilla(1, 1).className).toContain('casilla--bandera'));
  expect(cuerpoDe(llamadas('POST', '/move')[0]).action.type).toBe('flag');
  expect(screen.getByLabelText('Minas restantes').textContent).toBe('9');
});

test('el modo bandera hace que el clic ponga bandera', async () => {
  render(<Buscaminas />);
  await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Modo bandera' }));
  fireEvent.click(casilla(2, 2));
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(1));
  expect(cuerpoDe(llamadas('POST', '/move')[0]).action).toEqual({ type: 'flag', row: 1, col: 1 });
});

test('la tecla F pone bandera y las flechas mueven el foco', async () => {
  render(<Buscaminas />);
  await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
  fireEvent.keyDown(casilla(1, 1), { key: 'ArrowRight' });
  expect(document.activeElement).toBe(casilla(1, 2));
  fireEvent.keyDown(casilla(1, 2), { key: 'f' });
  await waitFor(() => expect(llamadas('POST', '/move')).toHaveLength(1));
  expect(cuerpoDe(llamadas('POST', '/move')[0]).action).toEqual({ type: 'flag', row: 0, col: 1 });
});

test('no se envía nada al hacer clic en una casilla ya revelada o con bandera', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ cambios: { '0,0': 1, '0,1': -2 } }), 201));
  render(<Buscaminas />);
  await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
  fireEvent.click(casilla(1, 1)); // revelada
  fireEvent.click(casilla(1, 2)); // con bandera: destapar no aplica
  fireEvent.contextMenu(casilla(1, 1)); // bandera sobre revelada: no aplica
  expect(llamadas('POST', '/move')).toHaveLength(0);
});

test('al perder muestra el mensaje, las minas y las banderas mal puestas', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ status: 'lost', cambios: { '0,0': 10, '0,1': 9, '0,2': 11 } }), 201));
  render(<Buscaminas />);
  expect(await screen.findByText('Pisaste una mina.')).toBeTruthy();
  expect(casilla(1, 1).className).toContain('casilla--explotada');
  expect(casilla(1, 2).className).toContain('casilla--mina');
  expect(casilla(1, 3).className).toContain('casilla--erronea');
});

test('después de terminar no se envían más jugadas', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ status: 'lost', cambios: { '0,0': 10 } }), 201));
  render(<Buscaminas />);
  await screen.findByText('Pisaste una mina.');
  fireEvent.click(casilla(2, 2));
  expect(llamadas('POST', '/move')).toHaveLength(0);
});

test('al ganar muestra el mensaje de victoria', async () => {
  fetchFalso.mockImplementationOnce(() => json(estado({ status: 'won' }), 201));
  render(<Buscaminas />);
  expect(await screen.findByText('¡Despejaste el tablero!')).toBeTruthy();
});

test('cambiar de nivel crea otra partida con ese tamaño', async () => {
  render(<Buscaminas />);
  await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Difícil' }));
  await waitFor(() => expect(llamadas('POST', '/games')).toHaveLength(2));
  expect(cuerpoDe(llamadas('POST', '/games')[1])).toEqual({ options: { rows: 16, cols: 30, mines: 99 } });
});

test('sin conexión muestra el error y permite reintentar', async () => {
  fetchFalso.mockImplementationOnce(() => Promise.reject(new TypeError('fallo de red')));
  render(<Buscaminas />);
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo conectar');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
});

test('un 422 del servidor se muestra sin perder el tablero', async () => {
  render(<Buscaminas />);
  await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
  fetchFalso.mockImplementationOnce(() => json({ error: 'INVALID_MOVE', message: 'Jugada inválida' }, 422));
  fireEvent.click(casilla(3, 3));
  expect((await screen.findByRole('alert')).textContent).toBe('Jugada inválida');
  expect(document.querySelectorAll('.casilla')).toHaveLength(81);
});

// ---- Cronómetro ----

// Texto del cronómetro; `pasar` avanza el reloj simulado (el tiempo real sigue corriendo, así que `waitFor` funciona).
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
    render(<Buscaminas />);
    await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
    expect(tiempo()).toBe('00:00');
    await pasar(65000);
    expect(tiempo()).toBe('01:05');
  } finally {
    vi.useRealTimers();
  }
});

test('al ganar el cronómetro se detiene con el tiempo final', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    render(<Buscaminas />);
    await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
    await pasar(30000);
    fetchFalso.mockImplementationOnce(() => json(estado({ status: 'won', cambios: { '0,0': 0 } })));
    fireEvent.click(casilla(1, 1));
    await screen.findByText('¡Despejaste el tablero!');
    const final = tiempo();
    expect(final).toBe('00:30');
    await pasar(20000);
    expect(tiempo()).toBe(final);
  } finally {
    vi.useRealTimers();
  }
});

test('al perder el cronómetro vuelve a cero', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    render(<Buscaminas />);
    await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
    await pasar(40000);
    expect(tiempo()).toBe('00:40');
    fetchFalso.mockImplementationOnce(() => json(estado({ status: 'lost', cambios: { '0,0': 10 } })));
    fireEvent.click(casilla(1, 1));
    await screen.findByText('Pisaste una mina.');
    expect(tiempo()).toBe('00:00');
    await pasar(20000);
    expect(tiempo()).toBe('00:00');
  } finally {
    vi.useRealTimers();
  }
});

test('una partida nueva reinicia el cronómetro', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    render(<Buscaminas />);
    await waitFor(() => expect(casilla(1, 1)).toBeTruthy());
    await pasar(50000);
    expect(tiempo()).toBe('00:50');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva partida' }));
    await waitFor(() => expect(llamadas('POST', '/games')).toHaveLength(2));
    await waitFor(() => expect(tiempo()).toBe('00:00'));
  } finally {
    vi.useRealTimers();
  }
});
