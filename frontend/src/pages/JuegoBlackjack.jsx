// Pantalla de Blackjack: marco de página con el componente del juego.
import Pagina from '../components/Pagina.jsx';
import Blackjack from '../games/Blackjack.jsx';

export default function JuegoBlackjack() {
  return (
    <Pagina titulo="Blackjack" volverAJuegos musica="blackjack">
      <Blackjack />
    </Pagina>
  );
}
