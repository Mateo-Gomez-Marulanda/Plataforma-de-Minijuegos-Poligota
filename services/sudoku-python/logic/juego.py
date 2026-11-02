# Estado y reglas de una partida de Sudoku. Lógica pura: no conoce HTTP ni JSON.
# Interfaz del diseño: nuevo_juego, aplicar_accion y terminado.
# Es lo único que server/main.py necesita de la lógica; cada acción devuelve un estado nuevo.
import random
from dataclasses import dataclass, replace

from logic.generador import CELDAS_A_QUITAR, crear_puzzle
from logic.solver import Tablero


class MovimientoInvalido(Exception):
    """La acción no se puede aplicar (celda fija, fuera de rango, tipo desconocido...)."""


@dataclass(frozen=True)
class Estado:
    """Partida inmutable: `puzzle` son las pistas, `tablero` lo que ve el jugador."""
    puzzle: Tablero
    solucion: Tablero
    tablero: Tablero
    dificultad: str


def nuevo_juego(opciones: dict | None = None, rng: random.Random | None = None) -> Estado:
    """Crea una partida nueva. Opción: difficulty = easy | medium | hard (por defecto medium)."""
    dificultad = (opciones or {}).get("difficulty", "medium")
    if dificultad not in CELDAS_A_QUITAR:
        raise MovimientoInvalido(f"Dificultad desconocida: {dificultad}")
    puzzle, solucion = crear_puzzle(dificultad, rng or random.Random())
    return Estado(puzzle, solucion, puzzle, dificultad)


def _entero(accion: dict, clave: str, minimo: int, maximo: int) -> int:
    """Lee un entero del rango [minimo, maximo] de la acción o falla con un mensaje claro."""
    v = accion.get(clave)
    if isinstance(v, bool) or not isinstance(v, int) or not minimo <= v <= maximo:
        raise MovimientoInvalido(f"'{clave}' debe ser un entero entre {minimo} y {maximo}")
    return v


def aplicar_accion(estado: Estado, accion: dict) -> Estado:
    """Aplica `place` o `clear` sobre una celda no fija y devuelve el nuevo estado."""
    tipo = accion.get("type")
    if tipo not in ("place", "clear"):
        raise MovimientoInvalido(f"Acción desconocida: {tipo}")
    fila, col = _entero(accion, "row", 0, 8), _entero(accion, "col", 0, 8)
    if estado.puzzle[fila][col] != 0:
        raise MovimientoInvalido("La celda es una pista y no se puede modificar")
    valor = _entero(accion, "value", 1, 9) if tipo == "place" else 0
    grid = [list(f) for f in estado.tablero]
    grid[fila][col] = valor
    return replace(estado, tablero=tuple(tuple(f) for f in grid))


def conflictos(tablero: Tablero) -> list[tuple[int, int]]:
    """Celdas cuyo número se repite en su fila, columna o bloque."""
    resultado = []
    for f in range(9):
        for c in range(9):
            v = tablero[f][c]
            if v == 0:
                continue
            bf, bc = 3 * (f // 3), 3 * (c // 3)
            vecinas = (
                {(f, j) for j in range(9)}
                | {(i, c) for i in range(9)}
                | {(i, j) for i in range(bf, bf + 3) for j in range(bc, bc + 3)}
            ) - {(f, c)}
            if any(tablero[i][j] == v for i, j in vecinas):
                resultado.append((f, c))
    return resultado


def terminado(estado: Estado) -> str | None:
    """Devuelve 'won' si el tablero está completo y sin conflictos; None si sigue la partida."""
    completo = all(v != 0 for fila in estado.tablero for v in fila)
    return "won" if completo and not conflictos(estado.tablero) else None
