# Pruebas del servidor HTTP: cumplimiento del contrato REST y de los códigos de error.
from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)


def crear(**opciones):
    """Crea una partida por la API y devuelve el JSON."""
    return client.post("/games", json={"options": opciones}).json()


def test_crear_partida_sigue_el_contrato():
    """POST /games devuelve 201 con los campos del contrato."""
    r = client.post("/games", json={"options": {"difficulty": "easy"}})
    assert r.status_code == 201
    j = r.json()
    assert set(j) == {"id", "game", "status", "board", "data", "message"}
    assert j["game"] == "sudoku" and j["status"] == "playing"
    assert len(j["board"]) == 9 and j["data"]["remaining"] == 36


def test_no_expone_la_solucion():
    """La respuesta solo trae las pistas, nunca la solución."""
    j = crear()
    # el tablero solo contiene las pistas: el resto de celdas llega vacío
    assert all(j["board"][f][c] == 0 for f in range(9) for c in range(9) if not j["data"]["givens"][f][c])
    assert "solution" not in str(j).lower() and "solucion" not in str(j).lower()


def test_crear_sin_cuerpo_usa_valores_por_defecto():
    """POST /games sin cuerpo crea una partida con opciones por defecto."""
    assert client.post("/games").status_code == 201


def test_get_y_delete():
    """GET devuelve la partida y tras DELETE responde 404."""
    j = crear()
    assert client.get(f"/games/{j['id']}").json()["id"] == j["id"]
    assert client.delete(f"/games/{j['id']}").status_code == 204
    r = client.get(f"/games/{j['id']}")
    assert r.status_code == 404 and r.json()["error"] == "NOT_FOUND"


def test_move_aplica_y_refleja_el_cambio():
    """Una jugada válida actualiza el tablero y las celdas restantes."""
    j = crear(difficulty="easy")
    f, c = next((f, c) for f in range(9) for c in range(9) if not j["data"]["givens"][f][c])
    r = client.post(f"/games/{j['id']}/move", json={"action": {"type": "place", "row": f, "col": c, "value": 4}})
    assert r.status_code == 200 and r.json()["board"][f][c] == 4
    assert r.json()["data"]["remaining"] == 35


def test_move_sobre_pista_devuelve_422():
    """Modificar una pista responde 422 INVALID_MOVE."""
    j = crear(difficulty="easy")
    f, c = next((f, c) for f in range(9) for c in range(9) if j["data"]["givens"][f][c])
    r = client.post(f"/games/{j['id']}/move", json={"action": {"type": "clear", "row": f, "col": c}})
    assert r.status_code == 422 and r.json()["error"] == "INVALID_MOVE"


def test_errores_de_peticion():
    """Cuerpo vacío o malformado, partida inexistente y opciones inválidas dan el error correcto."""
    j = crear()
    assert client.post(f"/games/{j['id']}/move", json={}).status_code == 422
    assert client.post(f"/games/{j['id']}/move", content="no json").json()["error"] == "INVALID_REQUEST"
    assert client.post("/games/zzz/move", json={"action": {}}).status_code == 404
    assert client.post("/games", json={"options": {"difficulty": "x"}}).json()["error"] == "INVALID_MOVE"
