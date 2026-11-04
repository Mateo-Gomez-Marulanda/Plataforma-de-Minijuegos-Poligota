// Marco de las pantallas interiores: enlace para volver al inicio, título y contenido.
// Las pantallas de juego piden además el botón «Volver a minijuegos» con `volverAJuegos`.
import { Link } from 'react-router-dom';
import Fichas from './Fichas.jsx';

export default function Pagina({ titulo, volverAJuegos = false, children }) {
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
