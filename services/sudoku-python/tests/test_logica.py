# Pruebas unitarias de la lógica del Sudoku (sin servidor): solver, generador y reglas de juego.
import random

import pytest

from logic.generador import crear_puzzle, tablero_resuelto
from logic.juego import MovimientoInvalido, aplicar_accion, conflictos, nuevo_juego, terminado
from logic.solver import candidatos, contar_soluciones, resolver


def es_valido(t) -> bool:
    """Comprueba que un tablero completo cumple filas, columnas y bloques."""
    unos = set(range(1, 10))
    filas = all(set(f) == unos for f in t)
    cols = all({t[i][j] for i in range(9)} == unos for j in range(9))
    bloques = all(
        {t[i][j] for i in range(bf, bf + 3) for j in range(bc, bc + 3)} == unos
        for bf in (0, 3, 6) for bc in (0, 3, 6)
    )
    return filas and cols and bloques


def test_tablero_resuelto_es_valido():
    """El generador produce un tablero completo que cumple las reglas."""
    assert es_valido(tablero_resuelto(random.Random(1)))


def test_candidatos_excluye_fila_columna_y_bloque():
    """Los candidatos descartan números de la misma fila, columna y bloque."""
    t = [[0] * 9 for _ in range(9)]
    t[0][1], t[4][0], t[1][1] = 5, 7, 9
    assert candidatos(t, 0, 0) == set(range(1, 10)) - {5, 7, 9}


def test_resolver_completa_un_puzzle():
    """El solver reproduce la solución de un puzzle generado."""
    puzzle, solucion = crear_puzzle("medium", random.Random(2))
    assert resolver(puzzle) == solucion


def test_resolver_devuelve_none_si_no_hay_solucion():
    """Un tablero sin solución devuelve None."""
    t = [[0] * 9 for _ in range(9)]
    t[0][:8] = range(1, 9)
    t[1][8] = 9  # la celda (0,8) queda sin candidatos
    assert resolver(t) is None


def test_contar_soluciones_detecta_ambiguedad():
    """Un tablero vacío tiene varias soluciones (se detiene en el límite)."""
    assert contar_soluciones([[0] * 9 for _ in range(9)], limite=2) == 2


@pytest.mark.parametrize("dificultad,vacias", [("easy", 36), ("medium", 46), ("hard", 54)])
def test_puzzle_tiene_solucion_unica_y_dificultad(dificultad, vacias):
    """Cada dificultad vacía el número esperado de celdas y deja solución única."""
    puzzle, solucion = crear_puzzle(dificultad, random.Random(3))
    assert contar_soluciones(puzzle) == 1
    assert sum(v == 0 for f in puzzle for v in f) == vacias
    assert all(p in (0, s) for pf, sf in zip(puzzle, solucion) for p, s in zip(pf, sf))


def vacia_de(e):
    """Primera celda vacía del puzzle."""
    return next((f, c) for f in range(9) for c in range(9) if e.puzzle[f][c] == 0)


def test_place_y_clear():
    """place y clear cambian la celda sin mutar el estado anterior."""
    e = nuevo_juego({"difficulty": "easy"}, random.Random(4))
    f, c = vacia_de(e)
    e2 = aplicar_accion(e, {"type": "place", "row": f, "col": c, "value": 5})
    assert e2.tablero[f][c] == 5 and e.tablero[f][c] == 0  # el original no cambia
    assert aplicar_accion(e2, {"type": "clear", "row": f, "col": c}).tablero[f][c] == 0


@pytest.mark.parametrize("accion", [
    {"type": "place", "row": 9, "col": 0, "value": 1},
    {"type": "place", "row": 0, "col": 0, "value": 10},
    {"type": "place", "row": 0, "col": 0},
    {"type": "place", "row": True, "col": 0, "value": 1},
    {"type": "saltar"},
])
def test_acciones_invalidas(accion):
    """Rangos fuera de límite, valores ausentes y tipos desconocidos se rechazan."""
    e = nuevo_juego({"difficulty": "easy"}, random.Random(4))
    with pytest.raises(MovimientoInvalido):
        aplicar_accion(e, accion)


def test_no_se_modifica_una_pista():
    """Las celdas de pista no se pueden borrar ni cambiar."""
    e = nuevo_juego({"difficulty": "easy"}, random.Random(4))
    f, c = next((f, c) for f in range(9) for c in range(9) if e.puzzle[f][c] != 0)
    with pytest.raises(MovimientoInvalido):
        aplicar_accion(e, {"type": "clear", "row": f, "col": c})


def test_dificultad_desconocida():
    """Una dificultad inexistente se rechaza al crear la partida."""
    with pytest.raises(MovimientoInvalido):
        nuevo_juego({"difficulty": "imposible"})


def test_conflictos_detecta_repetidos():
    """Un número repetido en su fila aparece como conflicto."""
    e = nuevo_juego({"difficulty": "easy"}, random.Random(5))
    f, c = vacia_de(e)
    vecino = next(v for v in e.puzzle[f] if v != 0)  # número ya presente en su fila
    e2 = aplicar_accion(e, {"type": "place", "row": f, "col": c, "value": vecino})
    assert (f, c) in conflictos(e2.tablero)


def test_victoria_al_completar_con_la_solucion():
    """Rellenar todo con la solución termina la partida como ganada."""
    e = nuevo_juego({"difficulty": "easy"}, random.Random(6))
    assert terminado(e) is None
    for f in range(9):
        for c in range(9):
            if e.puzzle[f][c] == 0:
                e = aplicar_accion(e, {"type": "place", "row": f, "col": c, "value": e.solucion[f][c]})
    assert terminado(e) == "won"


def test_tablero_completo_con_error_no_gana():
    """Un tablero lleno pero con un error no cuenta como victoria."""
    e = nuevo_juego({"difficulty": "easy"}, random.Random(6))
    for f in range(9):
        for c in range(9):
            if e.puzzle[f][c] == 0:
                e = aplicar_accion(e, {"type": "place", "row": f, "col": c, "value": e.solucion[f][c]})
    f, c = vacia_de(e)
    e = aplicar_accion(e, {"type": "place", "row": f, "col": c, "value": e.solucion[f][c] % 9 + 1})
    assert terminado(e) is None
