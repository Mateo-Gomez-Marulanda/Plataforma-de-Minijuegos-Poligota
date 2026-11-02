// Marco de las pantallas interiores: enlace para volver al inicio, título y contenido.
import { Link } from 'react-router-dom';
import Fichas from './Fichas.jsx';

export default function Pagina({ titulo, children }) {
  return (
    <main className="pantalla pantalla--interior">
      <Link to="/" className="volver">
        <Fichas />
        <span>Volver al inicio</span>
      </Link>
      <h1 className="titulo-interior">{titulo}</h1>
      {children}
    </main>
  );
}
