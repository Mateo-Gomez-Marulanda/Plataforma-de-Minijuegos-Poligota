// Pruebas de la música: botón, preferencia guardada, pista por pantalla y sincronización con el reproductor.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MusicaProvider, usePista } from './MusicaContext.jsx';
import BotonMusica from './BotonMusica.jsx';

// Catálogo de prueba: dos juegos con pista y uno sin ella.
vi.mock('./pistas.js', () => ({
  PISTAS: { tetris: '/musica/tetris.mp3', sudoku: '/musica/sudoku.mp3', snake: null },
}));

const reproductor = { reproducir: vi.fn(), pausar: vi.fn(), detener: vi.fn() };
const crearReproductor = vi.fn(() => reproductor);

beforeEach(() => {
  localStorage.clear();
  reproductor.reproducir.mockClear();
  reproductor.pausar.mockClear();
  reproductor.detener.mockClear();
  crearReproductor.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Pantalla de juego de mentira: pide la pista del juego indicado.
function Pantalla({ juego }) {
  usePista(juego);
  return null;
}

function montar(juego = 'tetris') {
  return render(
    <MusicaProvider crearReproductor={crearReproductor}>
      <BotonMusica />
      {juego && <Pantalla juego={juego} />}
    </MusicaProvider>,
  );
}

const boton = () => screen.getByRole('button', { name: /^Música/ });

test('empieza desactivada y el botón la activa y la desactiva', () => {
  montar();
  expect(boton().textContent).toContain('Música: desactivada');
  fireEvent.click(boton());
  expect(boton().textContent).toContain('Música: activada');
  expect(boton().className).toContain('boton-musica--activa');
  fireEvent.click(boton());
  expect(boton().textContent).toContain('Música: desactivada');
});

test('la preferencia se guarda y se recuerda en la siguiente visita', () => {
  const { unmount } = montar();
  fireEvent.click(boton());
  expect(localStorage.getItem('minijuegos.musica')).toBe('on');
  unmount();
  montar();
  expect(boton().textContent).toContain('Música: activada');
  fireEvent.click(boton());
  expect(localStorage.getItem('minijuegos.musica')).toBe('off');
});

test('si el almacenamiento no está disponible el botón sigue funcionando', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('bloqueado'); },
    setItem: () => { throw new Error('bloqueado'); },
  });
  montar();
  expect(boton().textContent).toContain('Música: desactivada');
  fireEvent.click(boton());
  expect(boton().textContent).toContain('Música: activada');
});

test('con la música desactivada no se crea ni se reproduce nada', () => {
  montar('tetris');
  expect(crearReproductor).not.toHaveBeenCalled();
  expect(reproductor.reproducir).not.toHaveBeenCalled();
});

test('al activarla suena la pista del juego y al desactivarla se pausa (no se suelta)', () => {
  montar('tetris');
  fireEvent.click(boton());
  expect(reproductor.reproducir).toHaveBeenCalledWith('/musica/tetris.mp3');
  expect(crearReproductor).toHaveBeenCalledTimes(1);
  fireEvent.click(boton());
  expect(reproductor.pausar).toHaveBeenCalled();
  expect(reproductor.detener).not.toHaveBeenCalled();
  fireEvent.click(boton());
  expect(reproductor.reproducir).toHaveBeenCalledTimes(2);
  expect(crearReproductor).toHaveBeenCalledTimes(1); // se reutiliza el mismo reproductor
});

test('si la música ya estaba activada suena al entrar en un juego', () => {
  localStorage.setItem('minijuegos.musica', 'on');
  montar('sudoku');
  expect(reproductor.reproducir).toHaveBeenCalledWith('/musica/sudoku.mp3');
});

test('cada juego tiene su propia pista: al cambiar de juego cambia la música', () => {
  localStorage.setItem('minijuegos.musica', 'on');
  const { rerender } = montar('tetris');
  expect(reproductor.reproducir).toHaveBeenLastCalledWith('/musica/tetris.mp3');
  rerender(
    <MusicaProvider crearReproductor={crearReproductor}>
      <BotonMusica />
      <Pantalla juego="sudoku" />
    </MusicaProvider>,
  );
  expect(reproductor.reproducir).toHaveBeenLastCalledWith('/musica/sudoku.mp3');
});

test('un juego sin pista no reproduce nada', () => {
  localStorage.setItem('minijuegos.musica', 'on');
  montar('snake');
  expect(reproductor.reproducir).not.toHaveBeenCalled();
});

test('una pantalla sin juego (menú) no reproduce nada', () => {
  localStorage.setItem('minijuegos.musica', 'on');
  montar(null);
  expect(reproductor.reproducir).not.toHaveBeenCalled();
});

test('al salir de la pantalla del juego la música se calla', () => {
  localStorage.setItem('minijuegos.musica', 'on');
  const { rerender } = montar('tetris');
  rerender(
    <MusicaProvider crearReproductor={crearReproductor}>
      <BotonMusica />
    </MusicaProvider>,
  );
  expect(reproductor.detener).toHaveBeenCalled();
});

test('al desmontar la aplicación se calla', () => {
  localStorage.setItem('minijuegos.musica', 'on');
  const { unmount } = montar('tetris');
  reproductor.detener.mockClear();
  unmount();
  expect(reproductor.detener).toHaveBeenCalled();
});

test('el botón sin proveedor no rompe (queda desactivado)', () => {
  render(<BotonMusica />);
  expect(boton().textContent).toContain('Música: desactivada');
  fireEvent.click(boton());
  expect(boton().textContent).toContain('Música: desactivada');
});

test('tras pulsar el botón con el ratón pierde el foco (espacio no lo reactiva)', () => {
  render(<BotonMusica />);
  boton().focus();
  fireEvent.click(boton());
  expect(document.activeElement).not.toBe(boton());
});
