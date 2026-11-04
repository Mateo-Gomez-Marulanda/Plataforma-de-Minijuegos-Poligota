// Constantes del sitio: enlace al repositorio, autoría y datos de los juegos.
export const GITHUB_URL = 'https://github.com/Mateo-Gomez-Marulanda/Plataforma-de-Minijuegos-Poligota';

// Autores de los créditos. Las imágenes viven en frontend/public/img/ y se sirven desde /img/.
export const AUTORES = [
  { nombre: 'Mateo Gómez Marulanda', imagen: '/img/gato.png' },
  { nombre: 'Ultron (Claude Code)', imagen: '/img/ultron.png' },
];

// Cada juego con su lenguaje y su color de ficha (coincide con las variables de styles.css).
// `ruta` solo existe en los juegos que ya se pueden jugar en la web.
export const JUEGOS = [
  { id: 'sudoku', nombre: 'Sudoku', lenguaje: 'Python', color: 'amarillo', ruta: '/juegos/sudoku' },
  { id: 'buscaminas', nombre: 'Buscaminas', lenguaje: 'Java', color: 'coral', ruta: '/juegos/buscaminas' },
  { id: 'snake', nombre: 'Snake', lenguaje: 'Elixir', color: 'violeta', ruta: '/juegos/snake' },
  { id: 'tetris', nombre: 'Tetris', lenguaje: 'C#', color: 'verde', ruta: '/juegos/tetris' },
  { id: 'asteroids', nombre: 'Asteroids', lenguaje: 'Go', color: 'celeste', ruta: '/juegos/asteroids' },
];
