// Botón flotante para activar o desactivar la música. Está en todas las pantallas.
import { useMusica } from './MusicaContext.jsx';

export default function BotonMusica() {
  const { activada, alternar } = useMusica();
  return (
    <button className={`boton-musica${activada ? ' boton-musica--activa' : ''}`} onClick={(e) => { alternar(); e.currentTarget.blur(); }}>
      <span aria-hidden="true" className="boton-musica__nota">♪</span>
      Música: {activada ? 'activada' : 'desactivada'}
    </button>
  );
}
