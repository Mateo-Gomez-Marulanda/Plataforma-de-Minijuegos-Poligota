// Componente del juego Asteroids: dibuja en SVG el mundo de 800x600 que envía el servicio y le informa de las teclas.
// El servidor lleva la física, las colisiones, el combo y las oleadas; aquí solo se renderiza cada `state`.
// A diferencia de los otros juegos, las teclas se mantienen: se avisa al pulsar (pressed: true) y al soltar (pressed: false).
import { useCallback, useEffect, useRef, useState } from 'react';
import { conectarAsteroids } from '../api/asteroids.js';
import { BotonPausa, useTeclasPausa } from './pausa.jsx';

// Tecla del teclado -> tecla del contrato.
const TECLAS = {
  ArrowLeft: 'rotate_left',
  a: 'rotate_left',
  A: 'rotate_left',
  ArrowRight: 'rotate_right',
  d: 'rotate_right',
  D: 'rotate_right',
  ArrowUp: 'thrust',
  w: 'thrust',
  W: 'thrust',
  ' ': 'fire',
};

// Botones táctiles: tecla del contrato, nombre accesible e icono.
const BOTONES = [
  ['rotate_left', 'Girar a la izquierda', '⟲'],
  ['thrust', 'Acelerar', '▲'],
  ['rotate_right', 'Girar a la derecha', '⟳'],
  ['fire', 'Disparar', '●'],
];

const MUNDO = { ancho: 800, alto: 600 };

// Número pseudoaleatorio estable en [0, 1) a partir de dos enteros: da a cada asteroide siempre la misma forma.
const ruido = (a, b) => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Contorno irregular de un asteroide: 10 vértices con el radio variando entre el 75 % y el 105 %.
function contorno(id, r) {
  const n = 10;
  return Array.from({ length: n }, (_, i) => {
    const radio = r * (0.75 + 0.3 * ruido(id, i));
    const a = (i / n) * 2 * Math.PI;
    return `${(Math.cos(a) * radio).toFixed(1)},${(Math.sin(a) * radio).toFixed(1)}`;
  }).join(' ');
}

// Dibuja la nave: un triángulo hueco que apunta hacia arriba con ángulo 0 y gira en sentido horario.
function Nave({ nave }) {
  return (
    <g transform={`translate(${nave.x} ${nave.y}) rotate(${(nave.angle * 180) / Math.PI})`} data-testid="nave">
      {nave.thrusting && <polygon className="asteroids__llama" points="-5,9 0,20 5,9" />}
      <polygon className={`asteroids__nave${nave.invulnerable ? ' asteroids__nave--parpadea' : ''}`} points="0,-14 10,10 0,5 -10,10" />
    </g>
  );
}

export default function Asteroids() {
  const [fase, setFase] = useState('conectando'); // conectando | listo | jugando | terminado | error
  const [estado, setEstado] = useState(null); // último mensaje `state`
  const [fin, setFin] = useState(null); // datos de `game_over`
  const [error, setError] = useState(null);
  const [efectos, setEfectos] = useState({ sacudidas: 0, pulsos: 0, vidas: 0 }); // contadores que reinician las animaciones
  const [vidaExtra, setVidaExtra] = useState(false); // muestra «¡Vida extra!» un momento
  const conexion = useRef(null);
  const pulsadas = useRef(new Set()); // teclas del contrato que están pulsadas ahora mismo
  const [intento, setIntento] = useState(0); // cambia para reconectar

  // Abre la conexión al entrar (y al reintentar) y la cierra al salir.
  useEffect(() => {
    let activa = true; // evita aplicar mensajes de una conexión ya descartada
    let abierta = false;
    setFase('conectando');
    setError(null);
    conexion.current = conectarAsteroids({
      onAbrir: () => {
        abierta = true;
        if (activa) setFase('listo');
      },
      onEstado: (msg) => {
        if (!activa) return;
        setEstado(msg);
        setFase('jugando');
        // Los eventos del servidor solo disparan efectos visuales.
        const eventos = msg.events ?? [];
        const sacude = eventos.includes('ship_destroyed');
        const pulso = eventos.includes('combo_up');
        const vida = eventos.includes('extra_life');
        if (vida) setVidaExtra(true);
        if (sacude || pulso || vida) {
          setEfectos((e) => ({ sacudidas: e.sacudidas + (sacude ? 1 : 0), pulsos: e.pulsos + (pulso ? 1 : 0), vidas: e.vidas + (vida ? 1 : 0) }));
        }
      },
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

  // El aviso de vida extra desaparece solo.
  useEffect(() => {
    if (!vidaExtra) return undefined;
    const temporizador = setTimeout(() => setVidaExtra(false), 2000);
    return () => clearTimeout(temporizador);
  }, [vidaExtra]);

  const pausado = estado?.data.paused === true;
  const jugando = fase === 'jugando';

  // Pulsa o suelta una tecla del contrato; no repite avisos si ya estaba en ese estado.
  const mover = useCallback((key, pulsada) => {
    if (pulsada === pulsadas.current.has(key)) return;
    if (pulsada) pulsadas.current.add(key);
    else pulsadas.current.delete(key);
    conexion.current?.tecla(key, pulsada);
  }, []);

  // Suelta todas las teclas (al pausar, al perder el foco y al terminar) para que ninguna se quede atascada.
  const soltarTodas = useCallback(() => {
    for (const key of [...pulsadas.current]) mover(key, false);
  }, [mover]);

  // Empieza una partida nueva (también sirve para jugar de nuevo).
  const empezar = () => {
    setEstado(null);
    setFin(null);
    setError(null);
    pulsadas.current.clear();
    setVidaExtra(false);
    setFase('jugando'); // evita un instante en 'terminado' sin datos de fin
    conexion.current?.empezar();
  };

  // Alterna pausa y reanudación.
  const alternarPausa = useCallback(() => {
    soltarTodas();
    if (pausado) conexion.current?.reanudar();
    else conexion.current?.pausar();
  }, [pausado, soltarTodas]);

  // Pausa: P, Esc o el botón (igual en todos los juegos).
  useTeclasPausa(jugando, alternarPausa);

  // Teclado en toda la página: flechas o WASD para girar y acelerar, espacio para disparar.
  useEffect(() => {
    if (!jugando) return undefined;
    const alPulsar = (e) => {
      const key = TECLAS[e.key];
      if (!key) return;
      if (!pausado && !e.repeat) mover(key, true);
      e.preventDefault(); // evita que flechas y espacio desplacen la página
    };
    const alSoltar = (e) => {
      const key = TECLAS[e.key];
      if (key) mover(key, false);
    };
    window.addEventListener('keydown', alPulsar);
    window.addEventListener('keyup', alSoltar);
    window.addEventListener('blur', soltarTodas);
    return () => {
      window.removeEventListener('keydown', alPulsar);
      window.removeEventListener('keyup', alSoltar);
      window.removeEventListener('blur', soltarTodas);
      soltarTodas();
    };
  }, [jugando, pausado, mover, soltarTodas]);

  if (fase === 'error') {
    return (
      <div className="asteroids__aviso" role="alert">
        <p>{error}</p>
        <button className="boton" onClick={() => setIntento((n) => n + 1)}>Reintentar</button>
      </div>
    );
  }

  const datos = estado?.data;
  // Al terminar manda el resultado final de game_over; durante la partida, los datos del último state.
  const puntaje = fin?.score ?? datos?.score ?? 0;
  const oleada = fin?.wave ?? datos?.wave ?? 1;

  return (
    <div className="asteroids">
      <svg
        key={efectos.sacudidas}
        className={`asteroids__mundo${efectos.sacudidas > 0 ? ' asteroids__mundo--sacude' : ''}${pausado ? ' asteroids__mundo--pausa' : ''}`}
        viewBox={`0 0 ${MUNDO.ancho} ${MUNDO.alto}`}
        role="img"
        aria-label="Mundo de Asteroids"
      >
        {datos?.asteroids.map((a) => (
          <polygon key={a.id} className="asteroids__roca" points={contorno(a.id, a.r)} transform={`translate(${a.x} ${a.y})`} data-size={a.size} />
        ))}
        {datos?.bullets.map((b, i) => (
          <circle key={i} className="asteroids__bala" cx={b.x} cy={b.y} r="2.5" />
        ))}
        {datos && fase !== 'terminado' && <Nave nave={datos.ship} />}
      </svg>

      <div className="asteroids__panel">
        <dl className="asteroids__datos">
          <div><dt>Puntaje</dt><dd>{puntaje}</dd></div>
          <div><dt>Oleada</dt><dd>{oleada}</dd></div>
          <div>
            <dt>Vidas</dt>
            <dd key={efectos.vidas} aria-label="Vidas" className={efectos.vidas > 0 ? 'asteroids__vidas--sube' : undefined}>{datos ? datos.lives : 3}</dd>
          </div>
          <div>
            <dt>Combo</dt>
            <dd key={efectos.pulsos} className={`asteroids__combo${efectos.pulsos > 0 ? ' asteroids__combo--sube' : ''}`}>x{datos?.combo ?? 1}</dd>
          </div>
        </dl>

        {fase === 'conectando' && <p role="status">Conectando…</p>}
        {fase === 'listo' && <p>Flechas o W, A, D para girar y acelerar. Espacio para disparar. P o Esc para pausar.</p>}
        {pausado && <p role="status">En pausa</p>}
        {vidaExtra && <p className="asteroids__vida-extra" role="status">¡Vida extra!</p>}
        {fase === 'terminado' && <p className="snake__derrota" role="status">Te quedaste sin vidas.</p>}
        {error && <p className="snake__error" role="alert">{error}</p>}

        {(fase === 'listo' || fase === 'terminado') && (
          <button className="boton boton--principal" onClick={empezar}>
            {fase === 'terminado' ? 'Jugar de nuevo' : 'Jugar'}
          </button>
        )}
        {jugando && <BotonPausa pausado={pausado} onClick={alternarPausa} />}

        {/* Controles para pantallas táctiles: mantener pulsado = tecla mantenida */}
        <div className="asteroids__cruceta" role="group" aria-label="Controles">
          {BOTONES.map(([key, nombre, icono]) => (
            <button
              key={key}
              className={`tecla asteroids__cruceta-${key}`}
              disabled={!jugando || pausado}
              aria-label={nombre}
              onPointerDown={() => mover(key, true)}
              onPointerUp={() => mover(key, false)}
              onPointerLeave={() => mover(key, false)}
              onPointerCancel={() => mover(key, false)}
            >
              {icono}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
