# Capa HTTP del servicio Sudoku (FastAPI). Solo traduce peticiones REST a llamadas
# de la lógica y serializa el estado según el contrato común (sección 4.1).
# El gateway le reenvía /api/sudoku/* quitando el prefijo; guarda las partidas en memoria.
import uuid

from fastapi import Body, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

from logic.juego import Estado, MovimientoInvalido, aplicar_accion, conflictos, nuevo_juego, terminado

app = FastAPI(title="Sudoku service")
partidas: dict[str, Estado] = {}  # partidas activas, solo en memoria


def error(status: int, codigo: str, mensaje: str) -> JSONResponse:
    """Respuesta de error con el formato común {error, message}."""
    return JSONResponse({"error": codigo, "message": mensaje}, status_code=status)


def serializar(id_: str, estado: Estado) -> dict:
    """Convierte el estado al formato del contrato. Nunca incluye la solución."""
    return {
        "id": id_,
        "game": "sudoku",
        "status": terminado(estado) or "playing",
        "board": [list(f) for f in estado.tablero],
        "data": {
            "difficulty": estado.dificultad,
            "givens": [[v != 0 for v in f] for f in estado.puzzle],
            "conflicts": [list(p) for p in conflictos(estado.tablero)],
            "remaining": sum(v == 0 for f in estado.tablero for v in f),
        },
        "message": None,
    }


@app.exception_handler(MovimientoInvalido)
async def _movimiento_invalido(_req: Request, exc: MovimientoInvalido) -> JSONResponse:
    """Jugada o parámetros inválidos -> 422 INVALID_MOVE."""
    return error(422, "INVALID_MOVE", str(exc))


@app.exception_handler(RequestValidationError)
async def _cuerpo_invalido(_req: Request, _exc: RequestValidationError) -> JSONResponse:
    """Cuerpo mal formado -> 422 INVALID_REQUEST."""
    return error(422, "INVALID_REQUEST", "Cuerpo de la petición inválido")


def _buscar(id_: str) -> Estado | None:
    """Devuelve la partida o None si no existe."""
    return partidas.get(id_)


@app.get("/health")
def health() -> dict:
    """Comprobación de que el servicio está vivo."""
    return {"status": "ok"}


@app.post("/games", status_code=201)
def crear_partida(body: dict | None = Body(default=None)):
    """Crea una partida nueva con las opciones recibidas."""
    estado = nuevo_juego((body or {}).get("options"))
    id_ = uuid.uuid4().hex[:8]
    partidas[id_] = estado
    return serializar(id_, estado)


@app.get("/games/{id_}")
def ver_partida(id_: str):
    """Devuelve el estado actual de una partida."""
    estado = _buscar(id_)
    return serializar(id_, estado) if estado else error(404, "NOT_FOUND", "Partida no encontrada")


@app.post("/games/{id_}/move")
def mover(id_: str, body: dict = Body(...)):
    """Aplica la acción del cuerpo ({"action": {...}}) y devuelve el estado nuevo."""
    estado = _buscar(id_)
    if not estado:
        return error(404, "NOT_FOUND", "Partida no encontrada")
    accion = body.get("action")
    if not isinstance(accion, dict):
        raise MovimientoInvalido("Falta 'action'")
    partidas[id_] = aplicar_accion(estado, accion)
    return serializar(id_, partidas[id_])


@app.delete("/games/{id_}", status_code=204)
def borrar(id_: str):
    """Elimina la partida (idempotente)."""
    partidas.pop(id_, None)
    return Response(status_code=204)
