// Marco de las pantallas interiores: enlace para volver al inicio, título y contenido.
// Las pantallas de juego piden además el botón «Volver a minijuegos» con `volverAJuegos` y su música con `musica`
// (el id del juego; la pista se define en musica/pistas.js).
import { Link } from 'react-router-dom';
import Fichas from './Fichas.jsx';
import { usePista } from '../musica/MusicaContext.jsx';

export default function Pagina({ titulo, volverAJuegos = false, musica, children }) {
  usePista(musica);
  return (
    <main className="pantalla pantalla--interior">
      <div className="cabecera-interior">
        <Link to="/" className="volver">
          <Fichas />
          <span>Volver al inicio</span>
        </Link>
        {volverAJuegos && <Link to="/juegos" className="boton">Volver a minijuegos</Link>}
      </div>
      <h1 className="titulo-interior">{titulo}</h1>
      {children}
    </main>
  );
}
