// Pantalla de Buscaminas: marco de página con el componente del juego.
import Pagina from '../components/Pagina.jsx';
import Buscaminas from '../games/Buscaminas.jsx';

export default function JuegoBuscaminas() {
  return (
    <Pagina titulo="Buscaminas" volverAJuegos>
      <Buscaminas />
    </Pagina>
  );
}
