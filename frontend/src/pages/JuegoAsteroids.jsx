// Pantalla de Asteroids: marco de página con el componente del juego.
import Pagina from '../components/Pagina.jsx';
import Asteroids from '../games/Asteroids.jsx';

export default function JuegoAsteroids() {
  return (
    <Pagina titulo="Asteroids" volverAJuegos musica="asteroids">
      <Asteroids />
    </Pagina>
  );
}
