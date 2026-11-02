// Componente del juego Snake: dibuja el tablero que envía el servicio y le manda las teclas.
// El servidor lleva el reloj y las reglas; aquí solo se renderiza cada mensaje `state` que llega.
import { useCallback, useEffect, useRef, useState } from 'react';
import { conectarSnake } from '../api/snake.js';

// Tecla del teclado -> dirección del contrato.
const TECLAS = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};

// Valor de cada celda del tablero -> clase de dibujo (0 es una celda vacía).
const CLASE_CELDA = { 1: 'pieza--cuerpo', 2: 'pieza--cabeza', 3: 'pieza--comida' };

// Texto del motivo de fin de partida.
const MOTIVOS = {
  wall: 'Chocaste con la pared.',
  self: 'Chocaste con tu propio cuerpo.',
  board_full: '¡Llenaste todo el tablero!',
};

// Tablero de 20x20 vacío para mostrar antes de empezar.
const TABLERO_VACIO = Array.from({ length: 20 }, () => Array(20).fill(0));

export default function Snake() {
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
    conexion.current = conectarSnake({
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

  // Teclado: flechas o WASD giran; la barra espaciadora pausa. Se escucha en toda la página.
  useEffect(() => {
    if (!jugando) return undefined;
    const alPulsar = (e) => {
      if (e.key === ' ') alternarPausa();
      else if (TECLAS[e.key] && !pausado) conexion.current?.girar(TECLAS[e.key]);
      else return;
      e.preventDefault(); // evita que las flechas desplacen la página
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [jugando, pausado, alternarPausa]);

  if (fase === 'error') {
    return (
      <div className="snake__aviso" role="alert">
        <p>{error}</p>
        <button className="boton" onClick={() => setIntento((n) => n + 1)}>Reintentar</button>
      </div>
    );
  }

  const tablero = estado?.board ?? TABLERO_VACIO;
  // Al terminar manda el puntaje final de game_over; durante la partida, el del último state.
  const puntaje = fin?.score ?? estado?.data.score ?? 0;

  return (
    <div className="snake">
      <div
        className="snake__tablero"
        role="img"
        aria-label="Tablero de Snake"
        style={{ gridTemplateColumns: `repeat(${tablero[0].length}, 1fr)`, gridTemplateRows: `repeat(${tablero.length}, 1fr)` }}
      >
        {tablero.map((fila, y) =>
          fila.map((valor, x) => <span key={`${y}-${x}`} className={`pieza ${CLASE_CELDA[valor] ?? ''}`} />),
        )}
      </div>

      <div className="snake__panel">
        <p className="snake__puntaje">
          <span>Puntaje</span>
          <strong>{puntaje}</strong>
        </p>

        {fase === 'conectando' && <p role="status">Conectando…</p>}
        {fase === 'listo' && <p>Usa las flechas o W, A, S, D para mover la serpiente. La barra espaciadora pausa.</p>}
        {pausado && <p role="status">En pausa</p>}
        {fase === 'terminado' && (
          <p className={fin.result === 'won' ? 'snake__victoria' : 'snake__derrota'} role="status">
            {MOTIVOS[fin.reason] ?? 'Fin de la partida.'}
          </p>
        )}
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

        {/* Cruceta para pantallas táctiles */}
        <div className="snake__cruceta" role="group" aria-label="Dirección">
          {[['up', 'Arriba'], ['left', 'Izquierda'], ['right', 'Derecha'], ['down', 'Abajo']].map(([dir, nombre]) => (
            <button
              key={dir}
              className={`tecla snake__cruceta-${dir}`}
              disabled={!jugando || pausado}
              aria-label={nombre}
              onClick={() => conexion.current?.girar(dir)}
            >
              {{ up: '▲', left: '◀', right: '▶', down: '▼' }[dir]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
