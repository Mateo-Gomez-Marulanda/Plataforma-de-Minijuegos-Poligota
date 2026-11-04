// Reproductor de música: envuelve un único elemento de audio que suena en bucle.
// Los navegadores bloquean el sonido hasta que el usuario hace algo en la página; si `play()` falla por eso,
// se reintenta en la siguiente pulsación o clic.

const VOLUMEN = 0.4;

// `AudioClase` se puede sustituir en las pruebas.
export function crearReproductor(AudioClase = globalThis.Audio) {
  let audio = null;
  let actual = null; // ruta de la pista que está cargada
  let dejarDeEsperar = null; // quita los listeners del reintento

  // Cancela el reintento pendiente, si lo hay.
  const cancelarEspera = () => {
    dejarDeEsperar?.();
    dejarDeEsperar = null;
  };

  // Intenta reproducir; si el navegador lo impide, espera el siguiente gesto del usuario.
  const intentar = () => {
    const sonando = audio.play();
    if (!sonando?.catch) return;
    sonando.catch(() => {
      if (dejarDeEsperar) return;
      const reintentar = () => {
        cancelarEspera();
        if (audio) intentar();
      };
      window.addEventListener('pointerdown', reintentar, { once: true });
      window.addEventListener('keydown', reintentar, { once: true });
      dejarDeEsperar = () => {
        window.removeEventListener('pointerdown', reintentar);
        window.removeEventListener('keydown', reintentar);
      };
    });
  };

  const detener = () => {
    cancelarEspera();
    audio?.pause();
    audio = null;
    actual = null;
  };

  // Pausa sin soltar la pista: al volver a llamar a `reproducir` con la misma ruta sigue donde se quedó.
  const pausar = () => {
    cancelarEspera();
    audio?.pause();
  };

  return {
    // Hace sonar `ruta` en bucle. Si ya es la pista actual, no la reinicia.
    reproducir(ruta) {
      if (actual === ruta) {
        if (audio.paused) intentar();
        return;
      }
      detener();
      audio = new AudioClase(ruta);
      audio.loop = true;
      audio.volume = VOLUMEN;
      actual = ruta;
      intentar();
    },
    pausar,
    detener,
  };
}
