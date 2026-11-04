// Componente del juego Blackjack: dibuja la mesa que envía el servicio y le manda las acciones del jugador.
// El servidor lleva el mazo, las reglas, el turno del crupier y los pagos; aquí solo se muestran las cartas
// y se habilitan los botones que indica `allowedActions`.
import { useCallback, useEffect, useRef, useState } from 'react';
import { borrarPartida, crearPartida, jugar } from '../api/blackjack.js';

// Cómo se dibuja y se nombra cada palo.
const PALOS = {
  hearts: { simbolo: '♥', nombre: 'corazones', rojo: true },
  diamonds: { simbolo: '♦', nombre: 'diamantes', rojo: true },
  clubs: { simbolo: '♣', nombre: 'tréboles', rojo: false },
  spades: { simbolo: '♠', nombre: 'picas', rojo: false },
};

// Resultado de una mano (según el contrato) -> texto.
const RESULTADOS = { blackjack: '¡Blackjack!', win: 'Gana', push: 'Empate', lose: 'Pierde', bust: 'Se pasó' };

// Botones del turno del jugador: acción del contrato y texto. Se habilitan con `allowedActions`.
const ACCIONES = [
  ['hit', 'Pedir carta'],
  ['stand', 'Plantarse'],
  ['double', 'Doblar'],
  ['split', 'Dividir'],
];

// Apuestas rápidas. El servidor decide si una apuesta es válida.
const FICHAS = [10, 25, 50, 100, 250, 500];

// Texto del valor de una mano: las suaves muestran las dos cuentas, por ejemplo "7 / 17".
const textoValor = (mano) => (mano.soft ? `${mano.value - 10} / ${mano.value}` : String(mano.value));

// Una carta; `{hidden: true}` es la carta boca abajo del crupier.
function Carta({ carta }) {
  if (carta.hidden) return <span className="carta carta--oculta" role="img" aria-label="Carta boca abajo" />;
  const palo = PALOS[carta.suit];
  return (
    <span className={`carta${palo.rojo ? ' carta--roja' : ''}`} role="img" aria-label={`${carta.rank} de ${palo.nombre}`}>
      <span>{carta.rank}</span>
      <span>{palo.simbolo}</span>
    </span>
  );
}

export default function Blackjack() {
  const [juego, setJuego] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false); // hay una petición en curso
  const [apuesta, setApuesta] = useState(50);
  const idActual = useRef(null); // id de la sesión en curso
  const sesiones = useRef(0); // numera las creaciones para descartar respuestas tardías

  // Crea una sesión nueva (y libera la anterior). Una respuesta que llega tarde se descarta.
  const iniciar = useCallback(async () => {
    const numero = ++sesiones.current;
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

  // Al abrir la pantalla se crea una sesión; al salir se libera.
  useEffect(() => {
    iniciar();
    return () => {
      sesiones.current++;
      if (idActual.current) borrarPartida(idActual.current);
      idActual.current = null;
    };
  }, [iniciar]);

  // Envía una acción y muestra el estado que devuelve. Mientras tanto no se admiten más (evita dobles clics).
  const enviar = async (accion) => {
    if (ocupado || !juego) return;
    setOcupado(true);
    try {
      const nuevo = await jugar(juego.id, accion);
      if (nuevo.id === idActual.current) {
        setJuego(nuevo);
        setError(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (error && !juego) {
    return (
      <div className="blackjack__aviso" role="alert">
        <p>{error}</p>
        <button className="boton" onClick={iniciar}>Reintentar</button>
      </div>
    );
  }
  if (!juego) return <p className="blackjack__aviso" role="status">Preparando la mesa…</p>;

  const { data } = juego;
  const permitidas = new Set(data.allowedActions);
  const turno = data.phase === 'player_turn';
  const terminada = data.phase === 'round_over';

  return (
    <div className="blackjack">
      <div className="blackjack__barra">
        <p className="blackjack__fichas">
          <span>Fichas</span>
          <strong aria-label="Fichas">{data.chips}</strong>
        </p>
        <button className="boton" onClick={iniciar}>Nueva partida</button>
      </div>

      {error && <p className="sudoku__error" role="alert">{error}</p>}

      <section className="blackjack__mesa" aria-label="Mesa">
        <div className="blackjack__zona" aria-label="Crupier">
          <h2>
            Crupier
            {data.dealer.value !== null && <span className="blackjack__valor" aria-label="Valor del crupier">{data.dealer.value}</span>}
          </h2>
          <div className="blackjack__cartas">
            {data.dealer.cards.map((carta, i) => <Carta key={i} carta={carta} />)}
          </div>
        </div>

        <div className="blackjack__zona" aria-label="Jugador">
          <h2>Jugador</h2>
          {data.hands.length === 0 && <p className="blackjack__vacio">Haz tu apuesta para repartir.</p>}
          <div className="blackjack__manos">
            {data.hands.map((mano, i) => (
              <div key={i} className={`blackjack__mano${turno && data.activeHand === i ? ' blackjack__mano--activa' : ''}`} aria-label={`Mano ${i + 1}`}>
                <div className="blackjack__cartas">
                  {mano.cards.map((carta, j) => <Carta key={j} carta={carta} />)}
                </div>
                <p className="blackjack__detalle">
                  <span aria-label={`Valor de la mano ${i + 1}`}>{textoValor(mano)}</span>
                  <span>Apuesta {mano.bet}</span>
                  {mano.result && <strong className={`blackjack__resultado blackjack__resultado--${mano.result}`}>{RESULTADOS[mano.result]}</strong>}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {data.phase === 'betting' && (
        <form
          className="blackjack__apuesta"
          onSubmit={(e) => {
            e.preventDefault();
            enviar({ type: 'bet', amount: apuesta });
          }}
        >
          <label>
            Apuesta
            <input type="number" min={data.minBet} max={data.maxBet} value={apuesta} onChange={(e) => setApuesta(e.target.valueAsNumber)} />
          </label>
          <div className="blackjack__fichas-rapidas" role="group" aria-label="Apuestas rápidas">
            {FICHAS.map((valor) => (
              <button key={valor} type="button" className="opcion" aria-pressed={apuesta === valor} onClick={() => setApuesta(valor)}>
                {valor}
              </button>
            ))}
          </div>
          <button className="boton boton--principal" type="submit" disabled={ocupado}>Repartir</button>
        </form>
      )}

      {turno && (
        <div className="blackjack__acciones" role="group" aria-label="Acciones">
          {ACCIONES.map(([tipo, texto]) => (
            <button key={tipo} className="boton" disabled={ocupado || !permitidas.has(tipo)} onClick={() => enviar({ type: tipo })}>
              {texto}
            </button>
          ))}
        </div>
      )}

      {terminada && permitidas.has('next_round') && (
        <button className="boton boton--principal" disabled={ocupado} onClick={() => enviar({ type: 'next_round' })}>
          Siguiente ronda
        </button>
      )}
    </div>
  );
}
