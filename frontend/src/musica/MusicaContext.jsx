// Estado global de la música: si está activada (se recuerda entre visitas) y qué pista toca la pantalla actual.
// Cada pantalla de juego pide su pista con `usePista(idDelJuego)`; el reproductor solo suena si la música está
// activada y esa pista existe en el catálogo (pistas.js).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PISTAS } from './pistas.js';
import { crearReproductor as crearReproductorReal } from './reproductor.js';

const CLAVE = 'minijuegos.musica';

// Sin provider (por ejemplo, un componente suelto en una prueba) la música simplemente está apagada.
const MusicaContext = createContext({ activada: false, alternar: () => {}, definirPista: () => {} });

// Lee la preferencia guardada. Por defecto está desactivada: los navegadores bloquean el sonido automático.
function leerPreferencia() {
  try {
    return localStorage.getItem(CLAVE) === 'on';
  } catch {
    return false; // sin acceso al almacenamiento (navegación privada, etc.)
  }
}

function guardarPreferencia(activada) {
  try {
    localStorage.setItem(CLAVE, activada ? 'on' : 'off');
  } catch {
    // no se pudo guardar: la preferencia solo dura esta visita
  }
}

// `crearReproductor` se puede sustituir en las pruebas por uno falso.
export function MusicaProvider({ children, crearReproductor = crearReproductorReal }) {
  const [activada, setActivada] = useState(leerPreferencia);
  const [pista, setPista] = useState(null); // ruta del archivo que toca la pantalla actual, o null
  const reproductor = useRef(null);

  const alternar = useCallback(() => {
    setActivada((a) => {
      guardarPreferencia(!a);
      return !a;
    });
  }, []);

  // Sincroniza el sonido con el estado: suena solo si está activada y hay pista.
  useEffect(() => {
    if (activada && pista) {
      reproductor.current ??= crearReproductor();
      reproductor.current.reproducir(pista);
    } else if (pista) {
      reproductor.current?.pausar(); // música apagada: la canción se pausa y al reactivarla sigue donde iba
    } else {
      reproductor.current?.detener(); // sin pantalla de juego: se suelta la pista
    }
  }, [activada, pista, crearReproductor]);

  // Al desmontar todo, se calla.
  useEffect(() => () => reproductor.current?.detener(), []);

  const valor = useMemo(() => ({ activada, alternar, definirPista: setPista }), [activada, alternar]);
  return <MusicaContext.Provider value={valor}>{children}</MusicaContext.Provider>;
}

// Estado y control de la música (lo usa el botón).
export const useMusica = () => useContext(MusicaContext);

// La pantalla de un juego llama a esto con el id del juego: mientras esté abierta, esa es la pista actual.
export function usePista(idJuego) {
  const { definirPista } = useMusica();
  useEffect(() => {
    if (!idJuego) return undefined;
    definirPista(PISTAS[idJuego] ?? null);
    return () => definirPista(null);
  }, [idJuego, definirPista]);
}
