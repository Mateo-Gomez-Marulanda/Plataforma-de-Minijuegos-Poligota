// Pruebas de las pantallas: botones de inicio, navegación interna sin salir de la web y enlace externo.
import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
import { GITHUB_URL } from './config.js';

afterEach(cleanup);

// Renderiza la app en una ruta concreta.
const en = (ruta) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  );

test('el inicio muestra el título y los tres botones', () => {
  en('/');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bienvenidos a los juegos políglotas');
  expect(screen.getByRole('link', { name: 'Ir a los minijuegos' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Créditos' })).toBeTruthy();
  expect(screen.getByRole('link', { name: /GitHub/ })).toBeTruthy();
});

test('GitHub abre el repositorio en otra pestaña', () => {
  en('/');
  const enlace = screen.getByRole('link', { name: /GitHub/ });
  expect(enlace.getAttribute('href')).toBe(GITHUB_URL);
  expect(enlace.getAttribute('target')).toBe('_blank');
});

test('Ir a los minijuegos cambia de escenario dentro de la web', () => {
  en('/');
  fireEvent.click(screen.getByRole('link', { name: 'Ir a los minijuegos' }));
  expect(screen.getByRole('heading', { name: 'Minijuegos' })).toBeTruthy();
  expect(screen.getByText('Sudoku')).toBeTruthy();
});

test('Créditos cambia de escenario y se puede volver al inicio', () => {
  en('/');
  fireEvent.click(screen.getByRole('link', { name: 'Créditos' }));
  expect(screen.getByRole('heading', { name: 'Créditos' })).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: /Volver al inicio/ }));
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Bienvenidos');
});

test('una ruta desconocida lleva al inicio', () => {
  en('/no-existe');
  expect(screen.getByRole('link', { name: 'Ir a los minijuegos' })).toBeTruthy();
});
