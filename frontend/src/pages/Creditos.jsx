// Pantalla de créditos: autores (nombre e imagen) y tecnologías usadas en cada parte del proyecto.
import Autor from '../components/Autor.jsx';
import Pagina from '../components/Pagina.jsx';
import { AUTORES, JUEGOS } from '../config.js';
import { FUENTES } from '../musica/pistas.js';

export default function Creditos() {
  return (
    <Pagina titulo="Créditos">
      <section className="bloque bloque--ancho">
        <h2>Autores</h2>
        <div className="autores">
          {AUTORES.map((a) => (
            <Autor key={a.nombre} {...a} />
          ))}
        </div>
      </section>
      <section className="bloque">
        <h2>Tecnologías</h2>
        <dl className="tecnologias">
          {JUEGOS.map((j) => (
            <div key={j.id} className={`tecnologia tecnologia--${j.color}`}>
              <dt>{j.nombre}</dt>
              <dd>{j.lenguaje}</dd>
            </div>
          ))}
          <div className="tecnologia">
            <dt>Gateway</dt>
            <dd>Node.js</dd>
          </div>
          <div className="tecnologia">
            <dt>Interfaz</dt>
            <dd>React</dd>
          </div>
        </dl>
      </section>
      <section className="bloque">
        <h2>Soundtracks</h2>
        <ul className="soundtracks">
          {JUEGOS.map((j) => (
            <li key={j.id} className={`tecnologia tecnologia--${j.color}`}>
              <span>{j.nombre}</span>
              <a href={FUENTES[j.id]} target="_blank" rel="noopener noreferrer">
                Escuchar la canción
              </a>
            </li>
          ))}
        </ul>
      </section>
    </Pagina>
  );
}
