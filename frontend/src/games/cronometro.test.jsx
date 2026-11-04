// Pruebas del cronómetro: formato, cuenta, parada, reinicio y limpieza.
import { act } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Cronometro, formatoTiempo, useCronometro } from './cronometro.jsx';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Componente mínimo que muestra el cronómetro.
function Prueba({ corriendo, clave }) {
  return <Cronometro ms={useCronometro(corriendo, clave)} />;
}

const tiempo = () => screen.getByLabelText('Tiempo de partida').textContent;
const pasar = (ms) => act(() => vi.advanceTimersByTime(ms));

test.each([
  [0, '00:00'], [999, '00:00'], [1000, '00:01'], [65000, '01:05'], [599000, '09:59'],
  [3600000, '1:00:00'], [3725000, '1:02:05'],
])('formatoTiempo(%i) = %s', (ms, texto) => expect(formatoTiempo(ms)).toBe(texto));

test('empieza en 00:00 y cuenta los segundos mientras corre', () => {
  render(<Prueba corriendo clave="a" />);
  expect(tiempo()).toBe('00:00');
  pasar(5000);
  expect(tiempo()).toBe('00:05');
  pasar(60000);
  expect(tiempo()).toBe('01:05');
});

test('no cuenta mientras no corre', () => {
  render(<Prueba corriendo={false} clave="a" />);
  pasar(10000);
  expect(tiempo()).toBe('00:00');
});

test('al parar se queda con el tiempo final (por ejemplo, al ganar)', () => {
  const { rerender } = render(<Prueba corriendo clave="a" />);
  pasar(12000);
  rerender(<Prueba corriendo={false} clave="a" />);
  expect(tiempo()).toBe('00:12');
  pasar(30000);
  expect(tiempo()).toBe('00:12');
});

test('una partida nueva (otra clave) vuelve a cero y vuelve a contar', () => {
  const { rerender } = render(<Prueba corriendo clave="a" />);
  pasar(20000);
  expect(tiempo()).toBe('00:20');
  rerender(<Prueba corriendo clave="b" />);
  expect(tiempo()).toBe('00:00');
  pasar(3000);
  expect(tiempo()).toBe('00:03');
});

test('al salir de la pantalla deja de contar (no queda ningún temporizador)', () => {
  const { unmount } = render(<Prueba corriendo clave="a" />);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
