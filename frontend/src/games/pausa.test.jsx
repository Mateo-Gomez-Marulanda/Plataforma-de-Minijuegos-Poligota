// Pruebas de la pausa unificada: solo P, Esc y el botón visual; ninguna otra tecla.
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BotonPausa, useTeclasPausa } from './pausa.jsx';

afterEach(cleanup);

// Componente mínimo que usa el hook, para probarlo aislado.
function Prueba({ activo = true, alternar }) {
  useTeclasPausa(activo, alternar);
  return null;
}

test.each(['p', 'P', 'Escape'])('la tecla %s alterna la pausa', (key) => {
  const alternar = vi.fn();
  render(<Prueba alternar={alternar} />);
  fireEvent.keyDown(window, { key });
  expect(alternar).toHaveBeenCalledTimes(1);
});

test.each([' ', 'Enter', 'Tab', 'o', 'ArrowUp', 'Pause', 'F1'])('la tecla «%s» no pausa', (key) => {
  const alternar = vi.fn();
  render(<Prueba alternar={alternar} />);
  fireEvent.keyDown(window, { key });
  expect(alternar).not.toHaveBeenCalled();
});

test('mantener pulsada la tecla no pausa y reanuda en bucle', () => {
  const alternar = vi.fn();
  render(<Prueba alternar={alternar} />);
  fireEvent.keyDown(window, { key: 'p' });
  fireEvent.keyDown(window, { key: 'p', repeat: true });
  fireEvent.keyDown(window, { key: 'p', repeat: true });
  expect(alternar).toHaveBeenCalledTimes(1);
});

test('no escucha cuando no está activo y deja de escuchar al desmontar', () => {
  const alternar = vi.fn();
  const { rerender, unmount } = render(<Prueba activo={false} alternar={alternar} />);
  fireEvent.keyDown(window, { key: 'p' });
  expect(alternar).not.toHaveBeenCalled();
  rerender(<Prueba activo alternar={alternar} />);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(alternar).toHaveBeenCalledTimes(1);
  unmount();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(alternar).toHaveBeenCalledTimes(1);
});

test('evita el comportamiento del navegador con P y Esc', () => {
  render(<Prueba alternar={() => {}} />);
  expect(fireEvent.keyDown(window, { key: 'Escape' })).toBe(false); // false = se llamó a preventDefault
  expect(fireEvent.keyDown(window, { key: 'q' })).toBe(true);
});

test('el botón visual cambia entre Pausar y Reanudar y avisa al pulsarlo', () => {
  const alPulsar = vi.fn();
  const { rerender } = render(<BotonPausa pausado={false} onClick={alPulsar} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
  expect(alPulsar).toHaveBeenCalledTimes(1);
  rerender(<BotonPausa pausado onClick={alPulsar} />);
  expect(screen.getByRole('button', { name: 'Reanudar' })).toBeTruthy();
});
