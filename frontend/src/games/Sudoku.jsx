// Componente del juego Sudoku: dibuja el tablero recibido del servicio y envía las jugadas.
// No valida nada: si una jugada es inválida o genera conflictos, es el servidor quien lo dice.
import { useCallback, useEffect, useRef, useState } from 'react';
import { borrarPartida, crearPartida, mover } from '../api/sudoku.js';
import { Cronometro, useCronometro } from './cronometro.jsx';

const DIFICULTADES = [
  { id: 'easy', nombre: 'Fácil' },
  { id: 'medium', nombre: 'Medio' },
  { id: 'hard', nombre: 'Difícil' },
];

// Desplazamientos de las teclas de flecha.
const FLECHAS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

export default function Sudoku() {
  const [dificultad, setDificultad] = useState('medium');
  const [juego, setJuego] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [error, setError] = useState(null);
  const idActual = useRef(null); // id de la partida en curso
  const partidas = useRef(0); // numera las creaciones para descartar respuestas tardías
  const jugadas = useRef(0); // numera las jugadas para aplicar solo la respuesta más reciente
  const tablero = useRef(null);

  // Crea una partida nueva (y libera la anterior). Una respuesta que llega tarde se descarta.
  const iniciar = useCallback(async (dif) => {
    const n = ++partidas.current;
    setError(null);
    setJuego(null);
    setSeleccion(null);
    if (idActual.current) borrarPartida(idActual.current);
    idActual.current = null;
    try {
      const nuevo = await crearPartida(dif);
      if (n !== partidas.current) return borrarPartida(nuevo.id);
      idActual.current = nuevo.id;
      setJuego(nuevo);
    } catch (e) {
      if (n === partidas.current) setError(e.message);
    }
  }, []);

  // Al abrir la pantalla se crea una partida; al salir se libera.
  useEffect(() => {
    iniciar('medium');
    return () => {
      partidas.current++;
      if (idActual.current) borrarPartida(idActual.current);
      idActual.current = null;
    };
  }, [iniciar]);

  // Lleva el foco del teclado a la celda seleccionada.
  useEffect(() => {
    if (seleccion) tablero.current?.querySelector(`[data-pos="${seleccion.f}-${seleccion.c}"]`)?.focus();
  }, [seleccion]);

  const jugando = juego?.status === 'playing';
  const tiempo = useCronometro(jugando, juego?.id); // cuenta mientras se juega; al resolverlo se queda con el tiempo final
  const pista = (f, c) => juego.data.givens[f][c];

  // Envía una jugada al servidor y muestra el estado que devuelve.
  const jugar = async (accion) => {
    if (!jugando) return;
    const n = ++jugadas.current;
    try {
      const nuevo = await mover(juego.id, accion);
      if (n === jugadas.current && nuevo.id === idActual.current) {
        setJuego(nuevo);
        setError(null);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  // Coloca un número en la celda seleccionada (si no es una pista).
  const poner = (valor) => {
    if (seleccion && !pista(seleccion.f, seleccion.c)) jugar({ type: 'place', row: seleccion.f, col: seleccion.c, value: valor });
  };

  // Borra la celda seleccionada (si no es una pista).
  const borrar = () => {
    if (seleccion && !pista(seleccion.f, seleccion.c)) jugar({ type: 'clear', row: seleccion.f, col: seleccion.c });
  };

  // Teclado: dígitos para escribir, Supr/Retroceso para borrar y flechas para moverse.
  const alPulsar = (e) => {
    if (!juego || !seleccion) return;
    if (/^[1-9]$/.test(e.key)) poner(Number(e.key));
    else if (['Backspace', 'Delete', '0'].includes(e.key)) borrar();
    else if (FLECHAS[e.key]) {
      const [df, dc] = FLECHAS[e.key];
      setSeleccion({ f: Math.min(8, Math.max(0, seleccion.f + df)), c: Math.min(8, Math.max(0, seleccion.c + dc)) });
    } else return;
    e.preventDefault();
  };

  // Cambia la dificultad y empieza una partida con ella.
  const elegir = (dif) => {
    setDificultad(dif);
    iniciar(dif);
  };

  if (error && !juego) {
    return (
      <div className="sudoku__aviso" role="alert">
        <p>{error}</p>
        <button className="boton" onClick={() => iniciar(dificultad)}>Reintentar</button>
      </div>
    );
  }
  if (!juego) return <p className="sudoku__aviso" role="status">Generando tablero…</p>;

  const conflictos = new Set(juego.data.conflicts.map(([f, c]) => f * 9 + c));
  const valorElegido = seleccion ? juego.board[seleccion.f][seleccion.c] : 0;

  return (
    <div className="sudoku">
      <div className="sudoku__tablero" ref={tablero} onKeyDown={alPulsar} role="group" aria-label="Tablero de Sudoku">
        {juego.board.map((fila, f) =>
          fila.map((valor, c) => {
            const elegida = seleccion?.f === f && seleccion?.c === c;
            const clases = [
              'celda',
              pista(f, c) && 'celda--pista',
              elegida && 'celda--elegida',
              !elegida && valorElegido !== 0 && valor === valorElegido && 'celda--igual',
              conflictos.has(f * 9 + c) && 'celda--conflicto',
              c % 3 === 2 && c < 8 && 'celda--corte-v',
              f % 3 === 2 && f < 8 && 'celda--corte-h',
            ];
            return (
              <button
                key={`${f}-${c}`}
                type="button"
                data-pos={`${f}-${c}`}
                className={clases.filter(Boolean).join(' ')}
                tabIndex={elegida || (!seleccion && f === 0 && c === 0) ? 0 : -1}
                aria-label={`Fila ${f + 1}, columna ${c + 1}, ${valor || 'vacía'}${pista(f, c) ? ', pista' : ''}`}
                aria-pressed={elegida}
                onClick={() => setSeleccion({ f, c })}
              >
                {valor || ''}
              </button>
            );
          }),
        )}
      </div>

      <div className="sudoku__panel">
        <div className="sudoku__grupo" role="group" aria-label="Dificultad">
          {DIFICULTADES.map((d) => (
            <button key={d.id} className="opcion" aria-pressed={dificultad === d.id} onClick={() => elegir(d.id)}>
              {d.nombre}
            </button>
          ))}
        </div>

        <div className="sudoku__teclado" role="group" aria-label="Números">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} className="tecla" disabled={!jugando || !seleccion} onClick={() => poner(n)}>
              {n}
            </button>
          ))}
          <button className="tecla tecla--borrar" disabled={!jugando || !seleccion} onClick={borrar}>
            Borrar
          </button>
        </div>

        <Cronometro ms={tiempo} />
        <p className="sudoku__datos">Celdas vacías: {juego.data.remaining}</p>
        {juego.status === 'won' && <p className="sudoku__victoria" role="status">¡Sudoku resuelto!</p>}
        {error && <p className="sudoku__error" role="alert">{error}</p>}

        <button className="boton" onClick={() => iniciar(dificultad)}>Nueva partida</button>
      </div>
    </div>
  );
}
