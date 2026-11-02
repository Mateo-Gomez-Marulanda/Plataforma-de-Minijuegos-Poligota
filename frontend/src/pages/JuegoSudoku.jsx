// Pantalla del Sudoku: marco de página con el componente del juego.
import Pagina from '../components/Pagina.jsx';
import Sudoku from '../games/Sudoku.jsx';

export default function JuegoSudoku() {
  return (
    <Pagina titulo="Sudoku">
      <Sudoku />
    </Pagina>
  );
}
