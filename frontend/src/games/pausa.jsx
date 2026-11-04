// Pausa unificada de los juegos que la tienen (Snake, Tetris y Asteroids): se pausa y se reanuda solo con la
// tecla P, la tecla Esc o el botón visual. Ninguna otra tecla pausa.
import { useEffect } from 'react';

// Mientras `activo`, P y Esc llaman a `alternar` (una vez por pulsación, aunque se mantenga la tecla).
export function useTeclasPausa(activo, alternar) {
  useEffect(() => {
    if (!activo) return undefined;
    const alPulsar = (e) => {
      if (e.key !== 'p' && e.key !== 'P' && e.key !== 'Escape') return;
      if (!e.repeat) alternar();
      e.preventDefault();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [activo, alternar]);
}

// Botón visual de pausa: alterna entre Pausar y Reanudar.
export function BotonPausa({ pausado, onClick }) {
  return (
    <button className="boton" onClick={onClick}>
      {pausado ? 'Reanudar' : 'Pausar'}
    </button>
  );
}
