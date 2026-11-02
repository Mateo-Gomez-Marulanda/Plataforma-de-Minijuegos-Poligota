# Reglas básicas del Sudoku y resolución por backtracking.
# Se usa tanto para resolver como para comprobar que un puzzle tiene solución única.
# Lo consumen generador.py (crear puzzles) y, indirectamente, juego.py.
import random

# Un tablero es una matriz 9x9 de enteros; 0 significa celda vacía.
Tablero = tuple[tuple[int, ...], ...]


def candidatos(tablero, fila: int, col: int) -> set[int]:
    """Números que se pueden colocar en la celda sin repetirse en fila, columna o bloque."""
    usados = set(tablero[fila]) | {f[col] for f in tablero}
    bf, bc = 3 * (fila // 3), 3 * (col // 3)
    usados |= {tablero[i][j] for i in range(bf, bf + 3) for j in range(bc, bc + 3)}
    return set(range(1, 10)) - usados


def _buscar(grid, limite: int, rng, soluciones: list) -> None:
    """Backtracking: rellena la celda con menos candidatos y recurre; guarda hasta `limite` soluciones."""
    mejor = None
    for f in range(9):
        for c in range(9):
            if grid[f][c] == 0:
                cand = candidatos(grid, f, c)
                if not cand:
                    return  # callejón sin salida
                if mejor is None or len(cand) < len(mejor[2]):
                    mejor = (f, c, cand)
    if mejor is None:  # sin celdas vacías: solución completa
        soluciones.append(tuple(tuple(fila) for fila in grid))
        return
    f, c, cand = mejor
    orden = list(cand)
    if rng is not None:
        rng.shuffle(orden)
    for v in orden:
        grid[f][c] = v
        _buscar(grid, limite, rng, soluciones)
        if len(soluciones) >= limite:
            break
    grid[f][c] = 0


def resolver(tablero, rng: random.Random | None = None) -> Tablero | None:
    """Devuelve una solución del tablero, o None si no tiene. Con `rng` el orden es aleatorio."""
    soluciones: list = []
    _buscar([list(f) for f in tablero], 1, rng, soluciones)
    return soluciones[0] if soluciones else None


def contar_soluciones(tablero, limite: int = 2) -> int:
    """Cuenta soluciones hasta `limite` (con 2 basta para saber si es única)."""
    soluciones: list = []
    _buscar([list(f) for f in tablero], limite, None, soluciones)
    return len(soluciones)
