// Pantalla de Rust Like: marco de página con el componente del juego.
import Pagina from '../components/Pagina.jsx';
import Rustlike from '../games/Rustlike.jsx';

export default function JuegoRustlike() {
  return (
    <Pagina titulo="Rust Like" volverAJuegos musica="rustlike">
      <Rustlike />
    </Pagina>
  );
}
