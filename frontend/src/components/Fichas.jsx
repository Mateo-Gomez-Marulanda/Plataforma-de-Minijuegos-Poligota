// Marca del sitio: una ficha de color por juego/lenguaje. `animada` las hace caer como piezas de Tetris.
import { JUEGOS } from '../config.js';

export default function Fichas({ animada = false }) {
  return (
    <div className={`fichas${animada ? ' fichas--cae' : ''}`} aria-hidden="true">
      {JUEGOS.map((j, i) => (
        <span key={j.id} className={`ficha ficha--${j.color}`} style={{ '--orden': i }} />
      ))}
    </div>
  );
}
