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
  x: { type: 'swap' },
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

// Nombre en español de cada pieza, en el orden del HUD.
const PIEZAS = [['legs', 'Piernas'], ['arms', 'Brazos'], ['sensors', 'Sensores'], ['core', 'Núcleo']];

// Etiqueta en español del estado de una pieza.
const ESTADOS = { optimal: 'Óptimo', light: 'Leve', severe: 'Grave', critical: 'Crítico', blocked: 'Bloqueado' };

// Nombre en español de cada objeto.
const OBJETOS = { oil_can: 'Lata de aceite', lubricant_spray: 'Spray lubricante', protective_grease: 'Grasa protectora' };

// Etiqueta de cada modelo de pieza por hueco (la misma tabla que `part_label` del servidor).
const MODELOS = {
  'legs:basic': 'Piernas básicas', 'arms:basic': 'Brazos básicos', 'sensors:basic': 'Sensores básicos', 'core:basic': 'Núcleo básico',
  'legs:tracked': 'Piernas de oruga', 'legs:spring': 'Piernas de resorte',
  'arms:drill': 'Brazos con taladro', 'arms:magnetic': 'Brazos magnéticos',
  'sensors:long_range': 'Sensores de largo alcance', 'sensors:thermal': 'Sensores térmicos',
};

// Objetos del suelo que se dibujan antes que los enemigos.
const SUELO = new Set(['oil_can', 'lubricant_spray', 'protective_grease', 'part']);

// Objetos que se usan sin elegir pieza.
const SIN_OBJETIVO = new Set(['lubricant_spray', 'protective_grease']);

// Inicial del hueco en el engranaje de una pieza del suelo.
const INICIAL = { legs: 'P', arms: 'B', sensors: 'S' };

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

// El robot del jugador: una forma por pieza, con el estado de cada una en `data-condition` (el color sale de la hoja de estilos).
function Robot({ x, y, parts }) {
  const px = x * LADO;
  const py = y * LADO;
  const estado = (p) => parts?.[p]?.condition ?? 'optimal';
  return (
    <g className="robot" aria-hidden="true">
      <rect className="robot__pieza" data-part="legs" data-condition={estado('legs')} x={px + 4} y={py + 11} width={LADO - 8} height="4" rx="1" />
      <rect className="robot__cuerpo" x={px + 4} y={py + 5} width={LADO - 8} height="6" rx="1" />
      <rect className="robot__pieza" data-part="core" data-condition={estado('core')} x={px + 6.5} y={py + 6.5} width={LADO - 13} height="3" rx="1" />
      <rect className="robot__pieza" data-part="arms" data-condition={estado('arms')} x={px + 1.5} y={py + 5} width="2.5" height="6" rx="1" />
      <rect className="robot__pieza" data-part="arms" data-condition={estado('arms')} x={px + LADO - 4} y={py + 5} width="2.5" height="6" rx="1" />
      <rect className="robot__pieza" data-part="sensors" data-condition={estado('sensors')} x={px + 5} y={py + 1.5} width={LADO - 10} height="3.5" rx="1" />
      <circle className="robot__ojo" cx={px + 6.5} cy={py + 3.25} r="0.9" />
      <circle className="robot__ojo" cx={px + LADO - 6.5} cy={py + 3.25} r="0.9" />
    </g>
  );
}

// Barra fina de integridad sobre un enemigo dañado.
function BarraIntegridad({ x, y, e }) {
  if (e.integrity == null || e.integrity >= e.maxIntegrity) return null;
  const ancho = LADO - 4;
  return (
    <g className="enemigo__barra">
      <rect className="enemigo__barra-fondo" x={x * LADO + 2} y={y * LADO} width={ancho} height="2" />
      <rect className="enemigo__barra-valor" x={x * LADO + 2} y={y * LADO} width={ancho * Math.max(0, e.integrity) / e.maxIntegrity} height="2" />
    </g>
  );
}

// Ácaro de óxido: un círculo pequeño con 4 patitas.
function Mite({ e }) {
  const cx = e.x * LADO + LADO / 2;
  const cy = e.y * LADO + LADO / 2 + 1;
  return (
    <g className="enemigo enemigo--mite" data-kind="rust_mite" data-detected={e.detected ? 'true' : undefined} aria-hidden="true">
      <path d={`M${cx - 5} ${cy - 3}L${cx - 2} ${cy - 1}M${cx - 5} ${cy + 3}L${cx - 2} ${cy + 1}M${cx + 5} ${cy - 3}L${cx + 2} ${cy - 1}M${cx + 5} ${cy + 3}L${cx + 2} ${cy + 1}`} />
      <circle cx={cx} cy={cy} r="3.2" />
      <BarraIntegridad x={e.x} y={e.y} e={e} />
    </g>
  );
}

// Dron de limpieza: un rombo.
function Drone({ e }) {
  const cx = e.x * LADO + LADO / 2;
  const cy = e.y * LADO + LADO / 2 + 1;
  return (
    <g className="enemigo enemigo--drone" data-kind="drone" data-detected={e.detected ? 'true' : undefined} aria-hidden="true">
      <polygon points={`${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`} />
      <BarraIntegridad x={e.x} y={e.y} e={e} />
    </g>
  );
}

// Lata de aceite: un rectángulo con tapa.
function OilCan({ e }) {
  const px = e.x * LADO;
  const py = e.y * LADO;
  return (
    <g className="objeto objeto--lata" data-kind="oil_can" aria-hidden="true">
      <rect x={px + 5} y={py + 5} width="6" height="8" rx="1" />
      <rect className="objeto__tapa" x={px + 6} y={py + 3} width="4" height="2" />
    </g>
  );
}

// Torreta: un cuadrado con cañón.
function Turret({ e }) {
  const px = e.x * LADO;
  const py = e.y * LADO;
  return (
    <g className="enemigo enemigo--torreta" data-kind="turret" data-detected={e.detected ? 'true' : undefined} aria-hidden="true">
      <rect x={px + 3} y={py + 4} width={LADO - 6} height={LADO - 6} rx="1" />
      <rect className="enemigo__canon" x={px + LADO / 2 - 1} y={py + 1} width="2" height="6" />
      <BarraIntegridad x={e.x} y={e.y} e={e} />
    </g>
  );
}

// Robot oxidado: una versión tosca y marrón del robot.
function RustyRobot({ e }) {
  const px = e.x * LADO;
  const py = e.y * LADO;
  return (
    <g className="enemigo enemigo--oxidado" data-kind="rusty_robot" data-detected={e.detected ? 'true' : undefined} aria-hidden="true">
      <rect x={px + 4} y={py + 5} width={LADO - 8} height="7" />
      <rect x={px + 5} y={py + 1.5} width={LADO - 10} height="3.5" />
      <rect x={px + 1.5} y={py + 5} width="2.5" height="6" />
      <rect x={px + LADO - 4} y={py + 5} width="2.5" height="6" />
      <rect x={px + 4} y={py + 12} width={LADO - 8} height="3" />
      <BarraIntegridad x={e.x} y={e.y} e={e} />
    </g>
  );
}

// Gotera: una gota azul que cae (indestructible, sin barra).
function Leak({ e }) {
  const cx = e.x * LADO + LADO / 2;
  const cy = e.y * LADO + LADO / 2;
  return (
    <g className="enemigo enemigo--gotera" data-kind="leak" data-detected={e.detected ? 'true' : undefined} aria-hidden="true">
      <path d={`M${cx} ${cy - 6}C${cx + 5} ${cy}, ${cx + 4} ${cy + 6}, ${cx} ${cy + 6}C${cx - 4} ${cy + 6}, ${cx - 5} ${cy}, ${cx} ${cy - 6}Z`} />
    </g>
  );
}

// Pieza en el suelo: un engranaje pequeño con la inicial del hueco.
function FloorPart({ e }) {
  const cx = e.x * LADO + LADO / 2;
  const cy = e.y * LADO + LADO / 2;
  return (
    <g className="objeto objeto--pieza" data-kind="part" aria-hidden="true">
      <circle cx={cx} cy={cy} r="5.5" strokeDasharray="2 1.2" />
      <circle className="objeto__centro" cx={cx} cy={cy} r="4" />
      <text x={cx} y={cy + 2.2} textAnchor="middle" fontSize="6">{INICIAL[e.slot] ?? '?'}</text>
    </g>
  );
}

// Spray lubricante: un bote con boquilla.
function Spray({ e }) {
  const px = e.x * LADO;
  const py = e.y * LADO;
  return (
    <g className="objeto objeto--spray" data-kind="lubricant_spray" aria-hidden="true">
      <rect x={px + 5} y={py + 6} width="5" height="8" rx="1" />
      <rect className="objeto__tapa" x={px + 6} y={py + 3.5} width="3" height="2.5" />
      <path d={`M${px + 10} ${py + 4}L${px + 13} ${py + 3}M${px + 10} ${py + 5}L${px + 13} ${py + 5.5}`} />
    </g>
  );
}

// Grasa protectora: una lata baja y ancha.
function Grease({ e }) {
  const px = e.x * LADO;
  const py = e.y * LADO;
  return (
    <g className="objeto objeto--grasa" data-kind="protective_grease" aria-hidden="true">
      <rect x={px + 3} y={py + 7} width="10" height="6" rx="1.5" />
      <rect className="objeto__tapa" x={px + 3} y={py + 5.5} width="10" height="2" rx="1" />
    </g>
  );
}

// Elige el componente de cada entidad visible.
const DIBUJO = {
  rust_mite: Mite, drone: Drone, oil_can: OilCan, turret: Turret, rusty_robot: RustyRobot,
  leak: Leak, part: FloorPart, lubricant_spray: Spray, protective_grease: Grease,
};

// El piso: un SVG con una casilla por cada posición conocida (las "unknown" no se dibujan) y el robot encima.
function Board({ juego, children }) {
  const { data, board } = juego;
  return (
    <div className="rustlike__tablero">
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
      {/* Los objetos van primero para que un enemigo encima de una lata se dibuje por delante. */}
      {[...(data.entities ?? [])].sort((a, b) => SUELO.has(b.kind) - SUELO.has(a.kind)).map((e) => {
        const Dibujo = DIBUJO[e.kind];
        return Dibujo ? <Dibujo key={e.id} e={e} /> : null;
      })}
      <Robot x={data.player.x} y={data.player.y} parts={data.parts} />
    </svg>
    {children}
    </div>
  );
}

// Cuántas líneas del registro se muestran, para no saturar al jugador.
const LINEAS_REGISTRO = 5;

// Datos generales de la partida: piso, zona, turno y puntaje.
function Datos({ data }) {
  return (
    <p className="rustlike__datos">
      <span>Piso {data.floor}</span>
      <span>Zona: {ZONAS[data.zone] ?? data.zone}</span>
      <span>Turno {data.turn}</span>
      <span>
        Puntaje <strong aria-label="Puntaje">{data.score}</strong>
      </span>
    </p>
  );
}

// Panel a la derecha del mapa: piezas, objetos, botón Recoger y las últimas líneas del registro.
function Hud({ data, alUsar, alRecoger, alCambiar, inactivo }) {
  const puedeRecoger = data.allowedActions.includes('pick');
  const puedeCambiar = data.allowedActions.includes('swap');
  const grasa = data.effects?.grease ?? 0;
  const salto = data.effects?.jumpCooldown ?? null;
  return (
    <aside className="rustlike__hud" aria-label="Estado del robot">
      {data.parts && (
        <ul className="rustlike__piezas" aria-label="Piezas">
          {PIEZAS.map(([id, nombre]) => {
            const pieza = data.parts[id];
            return (
              <li key={id} className="rustlike__pieza" data-condition={pieza.condition}>
                <span className="rustlike__pieza-nombre">{MODELOS[`${id}:${pieza.name}`] ?? nombre}</span>
                <span
                  className="rustlike__pieza-barra"
                  role="progressbar"
                  aria-label={`Corrosión de ${nombre}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pieza.corrosion}
                >
                  <span style={{ width: `${pieza.corrosion}%` }} />
                </span>
                <span className="rustlike__pieza-estado">{ESTADOS[pieza.condition] ?? pieza.condition}</span>
              </li>
            );
          })}
        </ul>
      )}
      {data.items && (
        <ul className="rustlike__objetos" aria-label="Objetos">
          {data.items.map((item, i) => (
            <li key={i} className="objeto-hud">
              {item ? (
                <>
                  <span>{OBJETOS[item] ?? item}</span>
                  <button className="boton" disabled={inactivo} onClick={(e) => { alUsar(i); e.currentTarget.blur(); }}>Usar</button>
                </>
              ) : <span className="objeto-hud__vacio">Vacío</span>}
            </li>
          ))}
        </ul>
      )}
      {(grasa > 0 || salto !== null) && (
        <ul className="rustlike__efectos" aria-label="Efectos">
          {grasa > 0 && <li>Grasa: {grasa} {grasa === 1 ? 'turno' : 'turnos'}</li>}
          {salto !== null && <li>{salto === 0 ? 'Salto: listo' : `Salto: ${salto} ${salto === 1 ? 'turno' : 'turnos'}`}</li>}
        </ul>
      )}
      {puedeRecoger && (
        <button className="boton" disabled={inactivo} onClick={(e) => { alRecoger(); e.currentTarget.blur(); }}>Recoger</button>
      )}
      {puedeCambiar && (
        <button className="boton" disabled={inactivo} onClick={(e) => { alCambiar(); e.currentTarget.blur(); }}>Cambiar pieza</button>
      )}
      <ul className="rustlike__log" aria-label="Registro">
        {data.log.slice(-LINEAS_REGISTRO).map((linea, i) => <li key={i}>{linea}</li>)}
      </ul>
    </aside>
  );
}

// Selector de la pieza a la que se aplica el objeto del espacio `slot`.
function Selector({ slot, parts, alElegir, alCancelar }) {
  return (
    <div className="rustlike__capa rustlike__selector" role="dialog" aria-label="Elegir pieza">
      <p>¿A qué pieza?</p>
      <div className="rustlike__botones">
        {PIEZAS.map(([id, nombre]) => (
          <button key={id} className="boton" disabled={(parts?.[id]?.corrosion ?? 0) === 0} onClick={(e) => { alElegir(slot, id); e.currentTarget.blur(); }}>{nombre}</button>
        ))}
        <button className="boton" onClick={(e) => { alCancelar(); e.currentTarget.blur(); }}>Cancelar</button>
      </div>
    </div>
  );
}

export default function Rustlike() {
  const [juego, setJuego] = useState(null);
  const [error, setError] = useState(null);
  const [enCurso, setEnCurso] = useState(false); // hay una petición en curso (desactiva los botones)
  const [slot, setSlot] = useState(null); // espacio de objeto con el selector abierto
  const idActual = useRef(null); // id de la partida en curso
  const sesiones = useRef(0); // numera las creaciones para descartar respuestas tardías
  const peticiones = useRef(0); // numera las jugadas para descartar respuestas viejas
  const ocupado = useRef(false); // hay una petición en curso (se ignoran las teclas)

  // Crea una partida nueva (y libera la anterior). Una respuesta que llega tarde se descarta.
  const iniciar = useCallback(async () => {
    const numero = ++sesiones.current;
    peticiones.current++;
    ocupado.current = false;
    setEnCurso(false);
    setError(null);
    setSlot(null);
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
    setEnCurso(true);
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
      if (numero === peticiones.current) { ocupado.current = false; setEnCurso(false); }
    }
  }, []);

  // Aplica el objeto del espacio a una pieza y cierra el selector.
  const usar = useCallback((i, target) => {
    setSlot(null);
    enviar({ type: 'use', slot: i, target });
  }, [enviar]);

  // Pulsar «Usar» o la tecla de un espacio: la lata pide pieza y el resto se usa directo.
  const elegirObjeto = useCallback((i) => {
    if (SIN_OBJETIVO.has(juego?.data.items?.[i])) enviar({ type: 'use', slot: i });
    else setSlot(i);
  }, [enviar, juego]);

  // Teclado: flechas/WASD, diagonales Q E Z C, espacio o punto para esperar, Enter o > para bajar, G recoge, 1-3 usan un objeto.
  useEffect(() => {
    const alPulsar = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typeof e.key !== 'string') return;
      const destino = e.target instanceof Element ? e.target : null;
      // En un campo de texto todas las teclas son suyas.
      if (destino && (destino.isContentEditable || destino.closest('input, textarea, select'))) return;
      // En un botón o enlace solo Enter y espacio son suyos (activarlo); el resto sigue jugando.
      if (destino && destino.closest('button, a') && (e.key === 'Enter' || e.key === ' ')) return;
      // Con la partida perdida las teclas no hacen nada.
      if (juego?.status === 'lost') return;
      // Con el selector abierto solo Esc hace algo.
      if (slot !== null) {
        if (e.key === 'Escape') { e.preventDefault(); setSlot(null); }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'g') {
        if (juego?.data.allowedActions.includes('pick')) { e.preventDefault(); enviar({ type: 'pick' }); }
        return;
      }
      if (k === '1' || k === '2' || k === '3') {
        if (ocupado.current) return;
        const i = Number(k) - 1;
        if (juego?.data.items?.[i]) { e.preventDefault(); elegirObjeto(i); }
        return;
      }
      if (k === 'x') {
        if (juego?.data.allowedActions.includes('swap')) { e.preventDefault(); enviar({ type: 'swap' }); }
        return;
      }
      const accion = TECLAS[e.key] ?? TECLAS[k];
      if (!accion) return;
      e.preventDefault();
      enviar(accion);
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [enviar, juego, slot, elegirObjeto]);

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
  const inactivo = enCurso || juego.status === 'lost';

  return (
    <div className="rustlike">
      <div className="rustlike__barra">
        <Datos data={data} />
        <div className="rustlike__botones">
          {data.allowedActions.includes('descend') && (
            <button className="boton boton--principal" disabled={inactivo} onClick={(e) => { enviar({ type: 'descend' }); e.currentTarget.blur(); }}>Bajar</button>
          )}
          <button className="boton" onClick={(e) => { iniciar(); e.currentTarget.blur(); }}>Nueva partida</button>
        </div>
      </div>
      {error && <p className="sudoku__error" role="alert">{error}</p>}
      <div className="rustlike__juego">
      <Board juego={juego}>
        {juego.status === 'lost' && (
          <div className="rustlike__capa rustlike__fin" role="dialog" aria-label="Fin de la partida">
            <h2>Fin de la partida</h2>
            <p>Llegaste al piso {data.floor}</p>
            <p>Puntaje: {data.score}</p>
            <button className="boton boton--principal" onClick={(e) => { iniciar(); e.currentTarget.blur(); }}>Nueva partida</button>
          </div>
        )}
        {slot !== null && juego.status !== 'lost' && <Selector slot={slot} parts={data.parts} alElegir={usar} alCancelar={() => setSlot(null)} />}
      </Board>
      <Hud data={data} inactivo={inactivo} alUsar={elegirObjeto} alRecoger={() => enviar({ type: 'pick' })} alCambiar={() => enviar({ type: 'swap' })} />
      </div>
      <p className="rustlike__ayuda">
        Mover: flechas o WASD · Diagonales: Q E Z C · Esperar: espacio · Bajar: Enter · Recoger: G · Cambiar pieza: X · Objeto: 1 2 3
      </p>
    </div>
  );
}
