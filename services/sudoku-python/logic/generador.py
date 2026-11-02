# Generación de puzzles: crea un tablero resuelto aleatorio y le quita números
# mientras la solución siga siendo única. Lo usa juego.nuevo_juego al crear una partida;
# la dificultad solo cambia cuántas celdas se vacían.
import random

from logic.solver import Tablero, contar_soluciones, resolver

# Cuántas celdas se intentan vaciar según la dificultad.
CELDAS_A_QUITAR = {"easy": 36, "medium": 46, "hard": 54}


def tablero_resuelto(rng: random.Random) -> Tablero:
    """Genera un tablero completo y válido resolviendo uno vacío con orden aleatorio."""
    return resolver(tuple((0,) * 9 for _ in range(9)), rng)


def crear_puzzle(dificultad: str, rng: random.Random) -> tuple[Tablero, Tablero]:
    """Devuelve (puzzle, solución). Quita celdas al azar solo si el puzzle sigue teniendo solución única."""
    solucion = tablero_resuelto(rng)
    grid = [list(f) for f in solucion]
    celdas = [(f, c) for f in range(9) for c in range(9)]
    rng.shuffle(celdas)
    quitadas = 0
    for f, c in celdas:
        if quitadas >= CELDAS_A_QUITAR[dificultad]:
            break
        valor, grid[f][c] = grid[f][c], 0
        if contar_soluciones(grid) == 1:
            quitadas += 1
        else:
            grid[f][c] = valor  # quitarla rompe la unicidad: se devuelve
    return tuple(tuple(f) for f in grid), solucion
