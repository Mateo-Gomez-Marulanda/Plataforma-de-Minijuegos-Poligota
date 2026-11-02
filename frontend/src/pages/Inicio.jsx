// Pantalla de bienvenida: título y tres salidas (minijuegos, GitHub y créditos).
// Minijuegos y créditos son rutas internas; GitHub es un enlace externo.
import { Link } from 'react-router-dom';
import Fichas from '../components/Fichas.jsx';
import { GITHUB_URL } from '../config.js';

export default function Inicio() {
  return (
    <main className="pantalla pantalla--inicio">
      <Fichas animada />
      <h1 className="titulo">
        Bienvenidos a los <span className="titulo__linea">juegos políglotas</span>
      </h1>
      <nav className="acciones" aria-label="Principal">
        <Link to="/juegos" className="boton boton--principal">
          Ir a los minijuegos
        </Link>
        <a href={GITHUB_URL} className="boton" target="_blank" rel="noopener noreferrer">
          Ver el código en GitHub
        </a>
        <Link to="/creditos" className="boton">
          Créditos
        </Link>
      </nav>
    </main>
  );
}
