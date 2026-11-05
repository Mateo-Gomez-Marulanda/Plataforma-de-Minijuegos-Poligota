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

test('en Minijuegos los siete juegos son enlaces jugables', () => {
  en('/juegos');
  expect(screen.getByRole('link', { name: /Sudoku/ }).getAttribute('href')).toBe('/juegos/sudoku');
  expect(screen.getByRole('link', { name: /Buscaminas/ }).getAttribute('href')).toBe('/juegos/buscaminas');
  expect(screen.getByRole('link', { name: /Snake/ }).getAttribute('href')).toBe('/juegos/snake');
  expect(screen.getByRole('link', { name: /Tetris/ }).getAttribute('href')).toBe('/juegos/tetris');
  expect(screen.getByRole('link', { name: /Asteroids/ }).getAttribute('href')).toBe('/juegos/asteroids');
  expect(screen.getByRole('link', { name: /Blackjack/ }).getAttribute('href')).toBe('/juegos/blackjack');
  expect(screen.getByRole('link', { name: /Rust Like/ }).getAttribute('href')).toBe('/juegos/rustlike');
  expect(screen.queryByText('Disponible pronto')).toBeNull();
});

test('Créditos muestra a los dos autores con su imagen debajo del nombre', () => {
  en('/creditos');
  const imagenes = screen.getAllByRole('img').map((i) => i.getAttribute('src'));
  expect(imagenes).toEqual(['/img/gato.png', '/img/ultron.png']);
  const nombres = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(nombres).toEqual(['Mateo Gómez Marulanda', 'Ultron (Claude Code)']);
});

test('Créditos tiene la sección Soundtracks con un enlace por juego', () => {
  en('/creditos');
  expect(screen.getByRole('heading', { name: 'Soundtracks' })).toBeTruthy();
  const enlaces = screen.getAllByRole('link', { name: 'Escuchar la canción' });
  expect(enlaces).toHaveLength(6);
  for (const e of enlaces) expect(e.getAttribute('href')).toMatch(/^https:\/\//);
});

test('si falta una imagen de los créditos se muestra un recuadro con la inicial', () => {
  en('/creditos');
  fireEvent.error(screen.getAllByRole('img')[1]);
  expect(screen.getByRole('img', { name: 'Imagen de Ultron (Claude Code)' }).textContent).toBe('U');
});

test.each(['sudoku', 'buscaminas', 'snake', 'tetris', 'asteroids', 'blackjack', 'rustlike'])('la pantalla de %s tiene el botón «Volver a minijuegos»', (juego) => {
  en(`/juegos/${juego}`);
  expect(screen.getByRole('link', { name: 'Volver a minijuegos' }).getAttribute('href')).toBe('/juegos');
});

test('solo Rust Like usa la pantalla amplia, para que el mapa sea más grande', () => {
  en('/juegos/rustlike');
  expect(screen.getByRole('main').className).toContain('pantalla--amplia');
  cleanup();
  en('/juegos/tetris');
  expect(screen.getByRole('main').className).not.toContain('pantalla--amplia');
});

test('Minijuegos y Créditos no muestran el botón «Volver a minijuegos»', () => {
  en('/juegos');
  expect(screen.queryByRole('link', { name: 'Volver a minijuegos' })).toBeNull();
  cleanup();
  en('/creditos');
  expect(screen.queryByRole('link', { name: 'Volver a minijuegos' })).toBeNull();
});

test.each(['/', '/juegos', '/creditos', '/juegos/sudoku', '/juegos/tetris', '/juegos/blackjack', '/juegos/rustlike'])('la pantalla %s tiene el botón de música', (ruta) => {
  en(ruta);
  expect(screen.getByRole('button', { name: /^Música: desactivada/ })).toBeTruthy();
});

test('el botón de música cambia de estado al pulsarlo', () => {
  localStorage.clear();
  en('/');
  fireEvent.click(screen.getByRole('button', { name: /^Música/ }));
  expect(screen.getByRole('button', { name: /^Música: activada/ })).toBeTruthy();
  localStorage.clear();
});

