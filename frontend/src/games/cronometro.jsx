// Cronómetro de partida para los juegos por turnos (Sudoku y Buscaminas): cuenta el tiempo que lleva el jugador
// en la partida. Vive solo en el navegador: se cierra la página y vuelve a cero, igual que al empezar otra partida.
import { useEffect, useState } from 'react';

// Milisegundos -> "mm:ss" (o "h:mm:ss" pasada la hora).
export function formatoTiempo(ms) {
  const total = Math.floor(ms / 1000);
  const dos = (n) => String(n).padStart(2, '0');
  const horas = Math.floor(total / 3600);
  const minutos = dos(Math.floor((total % 3600) / 60));
  const segundos = dos(total % 60);
  return horas > 0 ? `${horas}:${minutos}:${segundos}` : `${minutos}:${segundos}`;
}

// Tiempo transcurrido. Cuenta mientras `corriendo`; al parar se queda quieto (por ejemplo, al ganar);
// vuelve a cero cuando cambia `clave` (una partida nueva).
export function useCronometro(corriendo, clave) {
  const [ms, setMs] = useState(0);

  useEffect(() => {
    setMs(0);
  }, [clave]);

  useEffect(() => {
    if (!corriendo) return undefined;
    const inicio = Date.now();
    const intervalo = setInterval(() => setMs(Date.now() - inicio), 250);
    return () => {
      clearInterval(intervalo);
      setMs(Date.now() - inicio); // última lectura exacta al parar
    };
  }, [corriendo, clave]);

  return ms;
}

// Indicador "Tiempo mm:ss".
export function Cronometro({ ms }) {
  return (
    <p className="cronometro">
      <span>Tiempo</span>
      <strong aria-label="Tiempo de partida">{formatoTiempo(ms)}</strong>
    </p>
  );
}
