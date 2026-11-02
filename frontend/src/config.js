// Constantes del sitio: enlace al repositorio, autoría y datos de los juegos.
export const GITHUB_URL = 'https://github.com/Mateo-Gomez-Marulanda/Plataforma-de-Minijuegos-Poligota';

export const AUTOR = 'Mateo Gómez Marulanda';

// Cada juego con su lenguaje y su color de ficha (coincide con las variables de styles.css).
// `ruta` solo existe en los juegos que ya se pueden jugar en la web.
export const JUEGOS = [
  { id: 'sudoku', nombre: 'Sudoku', lenguaje: 'Python', color: 'amarillo', ruta: '/juegos/sudoku' },
  { id: 'buscaminas', nombre: 'Buscaminas', lenguaje: 'Java', color: 'coral' },
  { id: 'snake', nombre: 'Snake', lenguaje: 'Elixir', color: 'violeta' },
  { id: 'tetris', nombre: 'Tetris', lenguaje: 'C#', color: 'verde' },
];
