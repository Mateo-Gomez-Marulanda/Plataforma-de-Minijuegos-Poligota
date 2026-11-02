// Pantalla de créditos: autoría y tecnologías usadas en cada parte del proyecto.
import Pagina from '../components/Pagina.jsx';
import { AUTOR, JUEGOS } from '../config.js';

export default function Creditos() {
  return (
    <Pagina titulo="Créditos">
      <section className="bloque">
        <h2>Autor</h2>
        <p>{AUTOR}</p>
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
    </Pagina>
  );
}
