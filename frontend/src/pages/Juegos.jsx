// Pantalla de minijuegos: lista los cuatro juegos con su lenguaje.
// Todavía no se pueden jugar; se activarán al conectar cada servicio.
import Pagina from '../components/Pagina.jsx';
import { JUEGOS } from '../config.js';

export default function Juegos() {
  return (
    <Pagina titulo="Minijuegos">
      <ul className="lista-juegos">
        {JUEGOS.map((j) => (
          <li key={j.id} className={`juego juego--${j.color}`}>
            <span className="juego__nombre">{j.nombre}</span>
            <span className="juego__detalle">Programado en {j.lenguaje}</span>
            <span className="juego__estado">Disponible pronto</span>
          </li>
        ))}
      </ul>
    </Pagina>
  );
}
