// Componente del juego Rust Like: dibuja el piso que envía el servicio (con niebla de guerra) y le manda las acciones.
// El servidor lleva el mapa, la visión y las reglas; aquí solo se muestran las casillas y se leen las teclas.
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ErrorApi } from '../api/cliente.js';
import { borrarPartida, crearPartida, jugar } from '../api/rustlike.js';

// Lado en píxeles de una casilla dentro del viewBox del SVG.
const LADO = 16;

// Tecla del teclado -> acción del contrato.
const TECLAS = {
  ArrowUp: { type: 'move', dir: 'up' }, w: { type: 'move', dir: 'up' },
  ArrowDown: { type: 'move', dir: 'down' }, s: { type: 'move', dir: 'down' },
  ArrowLeft: { type: 'move', dir: 'left' }, a: { type: 'move', dir: 'left' },
  ArrowRight: { type: 'move', dir: 'right' }, d: { type: 'move', dir: 'right' },
  q: { type: 'move', dir: 'up_left' }, e: { type: 'move', dir: 'up_right' },
  z: { type: 'move', dir: 'down_left' }, c: { type: 'move', dir: 'down_right' },
  ' ': { type: 'wait' }, '.': { type: 'wait' },
  Enter: { type: 'descend' }, '>': { type: 'descend' },
};

// Nombre en español de cada zona (docs/rustlike-rust.md §8.1).
const ZONAS = {
  warehouse: 'Almacén',
  treatment_plant: 'Planta de tratamiento',
  foundry: 'Fundición',
  server_room: 'Sala de servidores',
  vacuum_chambers: 'Cámaras de vacío',
  core: 'El núcleo',
};

// Una casilla conocida; la clase depende del tipo y `niebla` indica que se vio pero ya no es visible.
const Tile = memo(function Tile({ x, y, tipo, niebla }) {
  return (
    <rect
      className={`casilla casilla--${tipo}${niebla ? ' casilla--niebla' : ''}`}
      x={x * LADO}
      y={y * LADO}
      width={LADO}
      height={LADO}
    />
  );
});

// El robot del jugador, dibujado en su casilla.
function Robot({ x, y }) {
  const cx = x * LADO + LADO / 2;
  const cy = y * LADO + LADO / 2;
  return (
    <g className="robot" aria-hidden="true">
      <rect x={x * LADO + 3} y={y * LADO + 4} width={LADO - 6} height={LADO - 7} rx="2" />
      <circle className="robot__ojo" cx={cx - 2.5} cy={cy - 1} r="1.4" />
      <circle className="robot__ojo" cx={cx + 2.5} cy={cy - 1} r="1.4" />
    </g>
  );
}

// El piso: un SVG con una casilla por cada posición conocida (las "unknown" no se dibujan) y el robot encima.
function Board({ juego }) {
  const { data, board } = juego;
  return (
    <svg
      className="rustlike__piso"
      role="img"
      aria-label={`Piso ${data.floor}`}
      viewBox={`0 0 ${data.width * LADO} ${data.height * LADO}`}
    >
      {board.flatMap((fila, y) =>
        fila.map((tipo, x) =>
          tipo === 'unknown' ? null : <Tile key={`${x},${y}`} x={x} y={y} tipo={tipo} niebla={!data.visible[y][x]} />,
        ),
      )}
      <Robot x={data.player.x} y={data.player.y} />
    </svg>
  );
}

// Piso, zona, turno, puntaje y las últimas 5 líneas del registro.
function Hud({ data }) {
  return (
    <div className="rustlike__hud">
      <p className="rustlike__datos">
        <span>Piso {data.floor}</span>
        <span>Zona: {ZONAS[data.zone] ?? data.zone}</span>
        <span>Turno {data.turn}</span>
        <span>
          Puntaje <strong aria-label="Puntaje">{data.score}</strong>
        </span>
      </p>
      <ul className="rustlike__log" aria-label="Registro">
        {data.log.slice(-5).map((linea, i) => <li key={i}>{linea}</li>)}
      </ul>
    </div>
  );
}

export default function Rustlike() {
  const [juego, setJuego] = useState(null);
  const [error, setError] = useState(null);
  const idActual = useRef(null); // id de la partida en curso
  const sesiones = useRef(0); // numera las creaciones para descartar respuestas tardías
  const peticiones = useRef(0); // numera las jugadas para descartar respuestas viejas
  const ocupado = useRef(false); // hay una petición en curso (se ignoran las teclas)

  // Crea una partida nueva (y libera la anterior). Una respuesta que llega tarde se descarta.
  const iniciar = useCallback(async () => {
    const numero = ++sesiones.current;
    peticiones.current++;
    ocupado.current = false;
    setError(null);
    setJuego(null);
    if (idActual.current) borrarPartida(idActual.current);
    idActual.current = null;
    try {
      const nuevo = await crearPartida();
      if (numero !== sesiones.current) return borrarPartida(nuevo.id);
      idActual.current = nuevo.id;
      setJuego(nuevo);
    } catch (e) {
      if (numero === sesiones.current) setError(e.message);
    }
  }, []);

  // Al abrir la pantalla se crea una partida; al salir se libera.
  useEffect(() => {
    iniciar();
    return () => {
      sesiones.current++;
      if (idActual.current) borrarPartida(idActual.current);
      idActual.current = null;
    };
  }, [iniciar]);

  // Envía una acción y muestra el estado que devuelve; un error (p. ej. un muro) se muestra sin perder el tablero.
  const enviar = useCallback(async (accion) => {
    const id = idActual.current;
    if (!id || ocupado.current) return;
    ocupado.current = true;
    const numero = ++peticiones.current;
    try {
      const nuevo = await jugar(id, accion);
      if (numero !== peticiones.current) return;
      setJuego(nuevo);
      setError(null);
    } catch (e) {
      if (numero === peticiones.current) {
        setError(e instanceof ErrorApi && e.codigo === 'NOT_FOUND'
          ? 'La partida ya no existe en el servidor. Empieza una nueva.'
          : e.message);
      }
    } finally {
      if (numero === peticiones.current) ocupado.current = false;
    }
  }, []);

  // Teclado: flechas/WASD, diagonales Q E Z C, espacio o punto para esperar, Enter o > para bajar.
  useEffect(() => {
    const alPulsar = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typeof e.key !== 'string') return;
      const destino = e.target instanceof Element ? e.target : null;
      // En un campo de texto todas las teclas son suyas.
      if (destino && (destino.isContentEditable || destino.closest('input, textarea, select'))) return;
      // En un botón o enlace solo Enter y espacio son suyos (activarlo); el resto sigue jugando.
      if (destino && destino.closest('button, a') && (e.key === 'Enter' || e.key === ' ')) return;
      const accion = TECLAS[e.key] ?? TECLAS[e.key.toLowerCase()];
      if (!accion) return;
      e.preventDefault();
      enviar(accion);
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [enviar]);

  if (error && !juego) {
    return (
      <div className="rustlike__aviso" role="alert">
        <p>{error}</p>
        <button className="boton" onClick={(e) => { iniciar(); e.currentTarget.blur(); }}>Reintentar</button>
      </div>
    );
  }
  if (!juego) return <p className="rustlike__aviso" role="status">Entrando al almacén…</p>;

  const { data } = juego;

  return (
    <div className="rustlike">
      <div className="rustlike__barra">
        <Hud data={data} />
        <div className="rustlike__botones">
          {data.allowedActions.includes('descend') && (
            <button className="boton boton--principal" onClick={(e) => { enviar({ type: 'descend' }); e.currentTarget.blur(); }}>Bajar</button>
          )}
          <button className="boton" onClick={(e) => { iniciar(); e.currentTarget.blur(); }}>Nueva partida</button>
        </div>
      </div>
      {error && <p className="sudoku__error" role="alert">{error}</p>}
      <Board juego={juego} />
      <p className="rustlike__ayuda">
        Mover: flechas o WASD · Diagonales: Q E Z C · Esperar: espacio · Bajar: Enter
      </p>
    </div>
  );
}
