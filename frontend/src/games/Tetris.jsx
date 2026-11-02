// Componente del juego Tetris: dibuja el tablero 10x20 que envía el servicio y le manda las teclas.
// El servidor lleva el reloj, las rotaciones, las colisiones y el puntaje; aquí solo se renderiza cada `state`.
import { useCallback, useEffect, useRef, useState } from 'react';
import { conectarTetris } from '../api/tetris.js';

// Tecla del teclado -> tecla del contrato. `repetible` indica si mantenerla pulsada la repite.
const TECLAS = {
  ArrowLeft: { key: 'left', repetible: true },
  a: { key: 'left', repetible: true },
  A: { key: 'left', repetible: true },
  ArrowRight: { key: 'right', repetible: true },
  d: { key: 'right', repetible: true },
  D: { key: 'right', repetible: true },
  ArrowDown: { key: 'soft_drop', repetible: true },
  s: { key: 'soft_drop', repetible: true },
  S: { key: 'soft_drop', repetible: true },
  ArrowUp: { key: 'rotate', repetible: false },
  w: { key: 'rotate', repetible: false },
  W: { key: 'rotate', repetible: false },
  x: { key: 'rotate', repetible: false },
  X: { key: 'rotate', repetible: false },
  ' ': { key: 'hard_drop', repetible: false },
};

// Código de cada casilla del tablero -> clase de dibujo (0 es vacía, 8 es la sombra de aterrizaje).
const CLASE_BLOQUE = { 1: 'I', 2: 'O', 3: 'T', 4: 'S', 5: 'Z', 6: 'J', 7: 'L', 8: 'sombra' };

// Cómo se dibuja cada pieza en la vista previa (solo presentación; las reglas viven en el servidor).
const VISTA_PREVIA = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};

// Tablero vacío para mostrar antes de empezar.
const TABLERO_VACIO = Array.from({ length: 20 }, () => Array(10).fill(0));

// Dibuja la pieza siguiente.
function PiezaSiguiente({ tipo }) {
  const forma = VISTA_PREVIA[tipo] ?? [];
  return (
    <div className="tetris__siguiente" role="img" aria-label={`Pieza siguiente: ${tipo ?? 'ninguna'}`}>
      {forma.map((fila, y) =>
        fila.map((lleno, x) => <span key={`${y}-${x}`} className={lleno ? `cuadro cuadro--${tipo}` : 'vacio'} style={{ gridRow: y + 1, gridColumn: x + 1 }} />),
      )}
    </div>
  );
}

export default function Tetris() {
  const [fase, setFase] = useState('conectando'); // conectando | listo | jugando | terminado | error
  const [estado, setEstado] = useState(null); // último mensaje `state`
  const [fin, setFin] = useState(null); // datos de `game_over`
  const [error, setError] = useState(null);
  const conexion = useRef(null);
  const [intento, setIntento] = useState(0); // cambia para reconectar

  // Abre la conexión al entrar (y al reintentar) y la cierra al salir.
  useEffect(() => {
    let activa = true; // evita aplicar mensajes de una conexión ya descartada
    let abierta = false;
    setFase('conectando');
    setError(null);
    conexion.current = conectarTetris({
      onAbrir: () => {
        abierta = true;
        if (activa) setFase('listo');
      },
      onEstado: (msg) => activa && (setEstado(msg), setFase('jugando')),
      onFin: (datos) => activa && (setFin(datos), setFase('terminado')),
      onError: (mensaje) => activa && setError(mensaje),
      onCierre: () => {
        if (!activa) return;
        setError(abierta ? 'Se perdió la conexión con el servidor.' : 'No se pudo conectar con el servidor. Comprueba que el gateway y el servicio estén en marcha.');
        setFase('error');
      },
    });
    return () => {
      activa = false;
      conexion.current?.cerrar();
    };
  }, [intento]);

  const pausado = estado?.data.paused === true;
  const jugando = fase === 'jugando';

  // Empieza una partida nueva (también sirve para jugar de nuevo).
  const empezar = () => {
    setEstado(null);
    setFin(null);
    setError(null);
    setFase('jugando'); // evita un instante en 'terminado' sin datos de fin
    conexion.current?.empezar();
  };

  // Alterna pausa y reanudación.
  const alternarPausa = useCallback(() => {
    if (pausado) conexion.current?.reanudar();
    else conexion.current?.pausar();
  }, [pausado]);

  // Teclado en toda la página: flechas o WASD (X también gira), barra espaciadora para caída rápida y P o Esc para pausar.
  useEffect(() => {
    if (!jugando) return undefined;
    const alPulsar = (e) => {
      const tecla = TECLAS[e.key];
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (!e.repeat) alternarPausa();
      } else if (tecla && !pausado) {
        if (tecla.repetible || !e.repeat) conexion.current?.tecla(tecla.key);
      } else if (!tecla) return;
      e.preventDefault(); // evita que flechas y espacio desplacen la página
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [jugando, pausado, alternarPausa]);

  if (fase === 'error') {
    return (
      <div className="tetris__aviso" role="alert">
        <p>{error}</p>
        <button className="boton" onClick={() => setIntento((n) => n + 1)}>Reintentar</button>
      </div>
    );
  }

  const tablero = estado?.board ?? TABLERO_VACIO;
  // Al terminar manda el resultado final de game_over; durante la partida, los datos del último state.
  const datos = fin ?? estado?.data ?? { score: 0, level: 1, lines: 0 };

  return (
    <div className="tetris">
      <div className={`tetris__tablero${pausado ? ' tetris__tablero--pausa' : ''}`} role="img" aria-label="Tablero de Tetris">
        {tablero.map((fila, y) =>
          fila.map((valor, x) => <span key={`${y}-${x}`} className={valor ? `cuadro cuadro--${CLASE_BLOQUE[valor]}` : 'cuadro'} />),
        )}
      </div>

      <div className="tetris__panel">
        <dl className="tetris__datos">
          <div><dt>Puntaje</dt><dd>{datos.score}</dd></div>
          <div><dt>Nivel</dt><dd>{datos.level}</dd></div>
          <div><dt>Líneas</dt><dd>{datos.lines}</dd></div>
        </dl>

        <div>
          <p className="tetris__etiqueta">Siguiente</p>
          <PiezaSiguiente tipo={estado?.data.next} />
        </div>

        {fase === 'conectando' && <p role="status">Conectando…</p>}
        {fase === 'listo' && <p>Flechas o W, A, S, D para mover y girar. Espacio para caída rápida. P o Esc para pausar.</p>}
        {pausado && <p role="status">En pausa</p>}
        {fase === 'terminado' && <p className="snake__derrota" role="status">La pila llegó arriba.</p>}
        {error && <p className="snake__error" role="alert">{error}</p>}

        {(fase === 'listo' || fase === 'terminado') && (
          <button className="boton boton--principal" onClick={empezar}>
            {fase === 'terminado' ? 'Jugar de nuevo' : 'Jugar'}
          </button>
        )}
        {jugando && (
          <button className="boton" onClick={alternarPausa}>
            {pausado ? 'Reanudar' : 'Pausar'}
          </button>
        )}

        {/* Controles para pantallas táctiles */}
        <div className="tetris__cruceta" role="group" aria-label="Controles">
          {[['left', 'Izquierda', '◀'], ['rotate', 'Girar', '⟳'], ['right', 'Derecha', '▶'], ['soft_drop', 'Bajar', '▼'], ['hard_drop', 'Caída rápida', '⤓']].map(([key, nombre, icono]) => (
            <button
              key={key}
              className={`tecla tetris__cruceta-${key}`}
              disabled={!jugando || pausado}
              aria-label={nombre}
              onClick={() => conexion.current?.tecla(key)}
            >
              {icono}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
