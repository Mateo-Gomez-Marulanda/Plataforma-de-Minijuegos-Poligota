// Componente del juego Buscaminas: dibuja el tablero que envía el servicio y le manda las jugadas.
// Clic izquierdo destapa; clic derecho (o la tecla F, o el modo bandera en pantallas táctiles) pone bandera.
// Las reglas (primer clic seguro, apertura en cadena, victoria) las lleva el servidor.
import { useCallback, useEffect, useRef, useState } from 'react';
import { borrarPartida, crearPartida, jugar } from '../api/buscaminas.js';

const NIVELES = [
  { id: 'facil', nombre: 'Fácil', filas: 9, columnas: 9, minas: 10 },
  { id: 'medio', nombre: 'Medio', filas: 16, columnas: 16, minas: 40 },
  { id: 'dificil', nombre: 'Difícil', filas: 16, columnas: 30, minas: 99 },
];

// Códigos del `board` según el contrato: 0 a 8 son números de minas vecinas.
const OCULTA = -1;
const BANDERA = -2;
const MINA = 9; // solo al perder
const EXPLOTADA = 10; // solo al perder: la que se destapó
const ERRONEA = 11; // solo al perder: bandera sobre una casilla sin mina

const FLECHAS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

// Cómo se dibuja y se describe cada código: clase CSS, texto visible y descripción para lectores de pantalla.
function describir(valor) {
  if (valor === OCULTA) return { tipo: 'oculta', texto: '', etiqueta: 'oculta' };
  if (valor === BANDERA) return { tipo: 'bandera', texto: '⚑', etiqueta: 'con bandera' };
  if (valor === MINA) return { tipo: 'mina', texto: '✸', etiqueta: 'mina' };
  if (valor === EXPLOTADA) return { tipo: 'explotada', texto: '✸', etiqueta: 'mina que explotó' };
  if (valor === ERRONEA) return { tipo: 'erronea', texto: '✕', etiqueta: 'bandera mal puesta' };
  if (valor === 0) return { tipo: 'vacia', texto: '', etiqueta: 'vacía' };
  return { tipo: 'numero', texto: String(valor), etiqueta: `${valor} ${valor === 1 ? 'mina vecina' : 'minas vecinas'}` };
}

export default function Buscaminas() {
  const [nivel, setNivel] = useState(NIVELES[0]);
  const [juego, setJuego] = useState(null);
  const [error, setError] = useState(null);
  const [modoBandera, setModoBandera] = useState(false);
  const [foco, setFoco] = useState({ f: 0, c: 0 }); // casilla que recibe el teclado
  const idActual = useRef(null); // id de la partida en curso
  const partidas = useRef(0); // numera las creaciones para descartar respuestas tardías
  const jugadas = useRef(0); // numera las jugadas para aplicar solo la respuesta más reciente
  const tablero = useRef(null);

  // Crea una partida nueva (y libera la anterior). Una respuesta que llega tarde se descarta.
  const iniciar = useCallback(async (n) => {
    const numero = ++partidas.current;
    setError(null);
    setJuego(null);
    setFoco({ f: 0, c: 0 });
    if (idActual.current) borrarPartida(idActual.current);
    idActual.current = null;
    try {
      const nuevo = await crearPartida(n);
      if (numero !== partidas.current) return borrarPartida(nuevo.id);
      idActual.current = nuevo.id;
      setJuego(nuevo);
    } catch (e) {
      if (numero === partidas.current) setError(e.message);
    }
  }, []);

  // Al abrir la pantalla se crea una partida; al salir se libera.
  useEffect(() => {
    iniciar(NIVELES[0]);
    return () => {
      partidas.current++;
      if (idActual.current) borrarPartida(idActual.current);
      idActual.current = null;
    };
  }, [iniciar]);

  const jugando = juego?.status === 'playing';

  // Envía una jugada al servidor y muestra el estado que devuelve.
  const enviar = async (accion) => {
    if (!jugando) return;
    const n = ++jugadas.current;
    try {
      const nuevo = await jugar(juego.id, accion);
      if (n === jugadas.current && nuevo.id === idActual.current) {
        setJuego(nuevo);
        setError(null);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  // Destapa una casilla oculta. Las ya reveladas o con bandera no se envían: el servidor las rechazaría.
  const destapar = (f, c, valor) => valor === OCULTA && enviar({ type: 'reveal', row: f, col: c });

  // Pone o quita la bandera (solo tiene sentido en casillas ocultas o ya marcadas).
  const marcar = (f, c, valor) => (valor === OCULTA || valor === BANDERA) && enviar({ type: 'flag', row: f, col: c });

  // Teclado sobre una casilla: F pone bandera y las flechas mueven el foco.
  const alPulsar = (e, f, c, valor) => {
    if (e.key === 'f' || e.key === 'F') marcar(f, c, valor);
    else if (FLECHAS[e.key]) {
      const [df, dc] = FLECHAS[e.key];
      const siguiente = {
        f: Math.min(juego.data.rows - 1, Math.max(0, f + df)),
        c: Math.min(juego.data.cols - 1, Math.max(0, c + dc)),
      };
      setFoco(siguiente);
      tablero.current?.querySelector(`[data-pos="${siguiente.f}-${siguiente.c}"]`)?.focus();
    } else return;
    e.preventDefault();
  };

  // Cambia de nivel y empieza una partida con él.
  const elegir = (n) => {
    setNivel(n);
    iniciar(n);
  };

  if (error && !juego) {
    return (
      <div className="buscaminas__aviso" role="alert">
        <p>{error}</p>
        <button className="boton" onClick={() => iniciar(nivel)}>Reintentar</button>
      </div>
    );
  }
  if (!juego) return <p className="buscaminas__aviso" role="status">Generando tablero…</p>;

  return (
    <div className="buscaminas">
      <div className="buscaminas__barra">
        <div className="sudoku__grupo" role="group" aria-label="Nivel">
          {NIVELES.map((n) => (
            <button key={n.id} className="opcion" aria-pressed={nivel.id === n.id} onClick={() => elegir(n)}>
              {n.nombre}
            </button>
          ))}
        </div>
        <p className="buscaminas__contador">
          <span>Minas</span>
          <strong aria-label="Minas restantes">{juego.data.mines_remaining}</strong>
        </p>
        <button className="opcion buscaminas__modo" aria-pressed={modoBandera} onClick={() => setModoBandera((m) => !m)}>
          Modo bandera
        </button>
        <button className="boton" onClick={() => iniciar(nivel)}>Nueva partida</button>
      </div>

      {juego.status === 'won' && <p className="sudoku__victoria" role="status">¡Despejaste el tablero!</p>}
      {juego.status === 'lost' && <p className="snake__derrota" role="status">Pisaste una mina.</p>}
      {error && <p className="sudoku__error" role="alert">{error}</p>}

      <div
        className="buscaminas__tablero"
        ref={tablero}
        role="group"
        aria-label="Tablero de Buscaminas"
        style={{ '--columnas': juego.data.cols, '--lado': juego.data.cols <= 9 ? '3rem' : '2.4rem' }}
      >
        {juego.board.map((fila, f) =>
          fila.map((valor, c) => {
            const { tipo, texto, etiqueta } = describir(valor);
            return (
              <button
                key={`${f}-${c}`}
                type="button"
                data-pos={`${f}-${c}`}
                data-n={tipo === 'numero' ? valor : undefined}
                className={`casilla casilla--${tipo}`}
                tabIndex={foco.f === f && foco.c === c ? 0 : -1}
                aria-label={`Fila ${f + 1}, columna ${c + 1}, ${etiqueta}`}
                onFocus={() => setFoco({ f, c })}
                onClick={() => (modoBandera ? marcar(f, c, valor) : destapar(f, c, valor))}
                onContextMenu={(e) => {
                  e.preventDefault(); // evita el menú del navegador
                  marcar(f, c, valor);
                }}
                onKeyDown={(e) => alPulsar(e, f, c, valor)}
              >
                {texto}
              </button>
            );
          }),
        )}
      </div>
      <p className="buscaminas__ayuda">Clic para destapar, clic derecho o la tecla F para poner bandera.</p>
    </div>
  );
}
