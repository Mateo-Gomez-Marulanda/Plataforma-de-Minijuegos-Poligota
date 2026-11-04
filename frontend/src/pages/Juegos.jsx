// Pantalla de minijuegos: lista los seis juegos con su lenguaje.
// Los que ya tienen pantalla son enlaces; el resto muestra "Disponible pronto".
import { Link } from 'react-router-dom';
import Pagina from '../components/Pagina.jsx';
import { JUEGOS } from '../config.js';

// Contenido común de la ficha de un juego.
function Ficha({ j, estado }) {
  return (
    <>
      <span className="juego__nombre">{j.nombre}</span>
      <span className="juego__detalle">Programado en {j.lenguaje}</span>
      <span className="juego__estado">{estado}</span>
    </>
  );
}

export default function Juegos() {
  return (
    <Pagina titulo="Minijuegos">
      <ul className="lista-juegos">
        {JUEGOS.map((j) => (
          <li key={j.id}>
            {j.ruta ? (
              <Link to={j.ruta} className={`juego juego--${j.color} juego--activo`}>
                <Ficha j={j} estado="Jugar" />
              </Link>
            ) : (
              <div className={`juego juego--${j.color}`}>
                <Ficha j={j} estado="Disponible pronto" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Pagina>
  );
}
