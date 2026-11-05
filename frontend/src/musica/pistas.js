// Catálogo de música: qué pista suena en cada juego. La clave es el `id` del juego (el de config.js).
//
// Para ponerle música a un juego:
//   1. Copia el archivo de audio (mp3, ogg...) a frontend/public/musica/, por ejemplo tetris.mp3.
//   2. Escribe aquí su ruta pública: tetris: '/musica/tetris.mp3'.
// No hace falta tocar ningún componente: la pantalla del juego ya pide su pista y el botón de música
// la activa o la silencia. Un juego con `null` simplemente no tiene música todavía.
export const PISTAS = {
  sudoku: '/musica/sudoku.mp3',
  buscaminas: '/musica/buscaminas.mp3',
  snake: '/musica/snake.mp3',
  tetris: '/musica/tetris.mp3',
  asteroids: '/musica/asteroids.mp3',
  blackjack: '/musica/blackjack.mp3',
  rustlike: null, // la música la pone el usuario más adelante
};

// De dónde salió cada canción (se muestra en la sección «Soundtracks» de los créditos). La clave es el id del juego.
export const FUENTES = {
  sudoku: 'https://www.youtube.com/watch?v=DzFXGsRvSwA',
  buscaminas: 'https://www.youtube.com/watch?v=In9xTpfjorU',
  snake: 'https://www.youtube.com/watch?v=L_OYo2RS8iU',
  tetris: 'https://www.youtube.com/watch?v=Cfy2dvbS0Cc',
  asteroids: 'https://www.youtube.com/watch?v=Hvdfx9avekU',
  blackjack: 'https://downloads.khinsider.com/game-soundtracks/album/super-mario-3d-world-soundtrack',
};
