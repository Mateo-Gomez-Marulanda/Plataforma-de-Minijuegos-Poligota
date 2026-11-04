// Pantalla de Tetris: marco de página con el componente del juego.
import Pagina from '../components/Pagina.jsx';
import Tetris from '../games/Tetris.jsx';

export default function JuegoTetris() {
  return (
    <Pagina titulo="Tetris" volverAJuegos>
      <Tetris />
    </Pagina>
  );
}
