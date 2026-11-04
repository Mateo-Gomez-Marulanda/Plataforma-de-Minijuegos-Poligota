// Pantalla de Snake: marco de página con el componente del juego.
import Pagina from '../components/Pagina.jsx';
import Snake from '../games/Snake.jsx';

export default function JuegoSnake() {
  return (
    <Pagina titulo="Snake" volverAJuegos musica="snake">
      <Snake />
    </Pagina>
  );
}
