# Sudoku: Python + FastAPI

Servicio REST en `services/sudoku-python/`. Genera tableros con solución única, valida las jugadas y detecta la victoria. Es el único servicio cuyo reto principal es un **algoritmo** (búsqueda con *backtracking*) y no el tiempo real.

## 1. Tecnologías

| Tecnología | Versión | Para qué se usa |
| :---- | :---- | :---- |
| **Python** | 3.12 (imagen); 3.14 en el entorno local de desarrollo | Lenguaje de la lógica y del servidor |
| **FastAPI** | 0.162 | Framework web: define las rutas con decoradores y genera la documentación OpenAPI |
| **Starlette** | 1.10 | Base de FastAPI: enrutado, manejo de excepciones y respuestas (FastAPI está construido sobre ella) |
| **Pydantic** | 2.14 | Validación de datos de FastAPI. Aquí solo interviene al comprobar que el cuerpo de la petición es un objeto JSON |
| **Uvicorn** | 0.54 | Servidor **ASGI**: abre el puerto 8001, entiende HTTP y entrega cada petición a FastAPI |
| **pytest** + **httpx** | 9.2 / 0.28 | Pruebas. FastAPI ofrece un `TestClient` basado en `httpx` que llama a la app sin red |

**Qué es ASGI:** la interfaz estándar entre un servidor y una aplicación web asíncrona de Python. Uvicorn es el servidor; FastAPI es la aplicación. Se comunican con esa interfaz, y por eso se pueden cambiar de forma independiente.

## 2. Estructura de archivos

```
services/sudoku-python/
├── logic/                  ← lógica pura, sin HTTP
│   ├── solver.py           candidatos, backtracking, contar soluciones
│   ├── generador.py        crea tablero resuelto y quita celdas
│   └── juego.py            Estado, acciones, conflictos y victoria
├── server/
│   └── main.py             aplicación FastAPI: rutas, errores y serialización
├── tests/
│   ├── test_logica.py      pruebas de la lógica
│   └── test_api.py         pruebas del contrato REST
├── requirements.txt        fastapi y uvicorn (las que usa el contenedor)
├── requirements-dev.txt    además pytest y httpx
├── pytest.ini              añade la raíz al path para importar `logic` y `server`
└── Dockerfile
```

`server/main.py` importa de `logic/juego.py`; la lógica no importa nada de FastAPI. Por eso se puede probar sin levantar el servidor.

## 3. Cómo funciona la lógica

### 3.1 El tablero y las reglas

Un tablero es una tupla de 9 tuplas de enteros; el `0` significa celda vacía. `candidatos(tablero, fila, col)` devuelve el conjunto de números que se pueden colocar en una celda: los del 1 al 9 menos los que ya aparecen en su fila, su columna y su bloque de 3×3. Los conjuntos (`set`) hacen que esa comprobación sea una resta de conjuntos.

### 3.2 Backtracking con la celda más restringida

`_buscar` resuelve el tablero probando números y retrocediendo cuando se llega a un callejón sin salida:

1. Recorre las celdas vacías y calcula sus candidatos.
2. Si alguna celda no tiene candidatos, ese camino no sirve: retrocede.
3. Elige la celda con **menos candidatos** (heurística MRV, *minimum remaining values*). Esto reduce enormemente las ramas que explora.
4. Prueba cada candidato: lo coloca, llama recursivamente y, si no llegó a una solución, lo quita.
5. Si no quedan celdas vacías, guarda la solución.

La misma función sirve para tres cosas, según los parámetros:

| Función | Qué hace | Cómo usa `_buscar` |
| :---- | :---- | :---- |
| `resolver(tablero, rng)` | Devuelve una solución | Se detiene en 1 solución. Con `rng`, baraja el orden de los candidatos |
| `contar_soluciones(tablero, limite=2)` | Cuenta soluciones | Se detiene al llegar al límite. Con 2 basta para saber si es única |
| `tablero_resuelto(rng)` | Crea un tablero completo | `resolver` sobre un tablero vacío con orden aleatorio |

### 3.3 Generar un puzzle con solución única

`crear_puzzle(dificultad, rng)` en `generador.py`:

1. Crea un tablero resuelto aleatorio.
2. Baraja las 81 posiciones.
3. Para cada posición, vacía la celda y llama a `contar_soluciones`. Si el puzzle sigue teniendo **exactamente una** solución, la deja vacía; si no, la restaura.
4. Se detiene al vaciar el número de celdas de la dificultad (36 en fácil, 46 en medio, 54 en difícil) o al agotar las posiciones.

Generar uno difícil tarda unos 0,1 s. Para tableros más difíciles que los de este proyecto, Python sería notablemente más lento que otros lenguajes.

### 3.4 La partida

En `juego.py`, `Estado` es una `@dataclass(frozen=True)`: tiene el puzzle (las pistas), la solución, el tablero que ve el jugador y la dificultad. Al ser inmutable, `aplicar_accion` devuelve un estado **nuevo** con `dataclasses.replace` en vez de modificar el anterior.

- `place` y `clear` solo se pueden aplicar a celdas que **no son pistas**.
- Un número que choca con otro **se acepta** y se marca como conflicto (`conflictos()` lo calcula). La decisión de rechazar o marcar no la fijaba el contrato.
- `terminado` devuelve `"won"` cuando el tablero está completo y no hay conflictos.
- La solución se guarda en el estado pero **nunca se envía al cliente**.

## 4. Cómo funciona el servidor

`server/main.py` crea `app = FastAPI(...)` y registra las rutas con decoradores:

```python
@app.post("/games", status_code=201)
def crear_partida(body: dict | None = Body(default=None)): ...

@app.post("/games/{id_}/move")
def mover(id_: str, body: dict = Body(...)): ...
```

- **Rutas:** `POST /games`, `GET /games/{id}`, `POST /games/{id}/move`, `DELETE /games/{id}` y `GET /health`. El gateway quita el prefijo `/api/sudoku`, por eso aquí empiezan en `/games`.
- **Cuerpo de la petición:** se recibe como un `dict`. FastAPI/Pydantic rechazan lo que no sea un objeto JSON.
- **Respuesta:** `serializar()` convierte el `Estado` en el JSON del contrato. `board` solo lleva el tablero del jugador; `data` lleva `difficulty`, `givens` (qué celdas son pistas), `conflicts` y `remaining`.
- **Errores:** dos manejadores de excepciones traducen los fallos al formato `{error, message}`:
  - `MovimientoInvalido` → `422 INVALID_MOVE`
  - `RequestValidationError` (cuerpo mal formado) → `422 INVALID_REQUEST`
  - Una partida inexistente devuelve `404 NOT_FOUND`.
- **Identificadores:** `uuid.uuid4().hex[:8]`.

## 5. Estado y concurrencia

Las partidas están en `partidas: dict[str, Estado]`, un diccionario global del módulo.

Las rutas son funciones normales (`def`, no `async def`), así que FastAPI las ejecuta en un **grupo de hilos**. Las operaciones sobre el `dict` son atómicas por el GIL de Python, y como el `Estado` es inmutable, cada jugada simplemente guarda uno nuevo.

### Limitaciones conocidas

- Dos jugadas simultáneas sobre la **misma** partida podrían leer el mismo estado y la última en escribir se impondría. En el uso real (un jugador por partida) no ocurre.
- Las partidas no caducan: solo se liberan con `DELETE` o al reiniciar el servicio.

## 6. Empaquetado en Docker

```
python:3.12-slim
  → pip install -r requirements.txt     (fastapi + uvicorn)
  → copia logic/ y server/
  → uvicorn server.main:app --host 0.0.0.0 --port 8001
```

La imagen no incluye pytest ni las pruebas. Tampoco necesita etapa de compilación, porque Python no se compila.

## 7. Pruebas

- `tests/test_logica.py` (sin servidor): el generador produce tableros válidos; el solver completa un puzzle y detecta uno sin solución; cada dificultad vacía el número esperado de celdas con solución única; `place`/`clear`, rangos inválidos, pistas, conflictos y victoria. Usan `random.Random(semilla)` para ser reproducibles.
- `tests/test_api.py`: el contrato REST con el `TestClient` (crear, consultar, mover, borrar, errores 404 y 422) y que la respuesta no exponga la solución.

```sh
cd services/sudoku-python
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest
```

## 8. Idiomas de Python que aparecen en el código

- **Conjuntos y comprensiones** para candidatos, vecinas y conflictos.
- **Type hints** (`Tablero = tuple[tuple[int, ...], ...]`, `dict | None`) que documentan las estructuras. Python no los comprueba en ejecución.
- **`@dataclass(frozen=True)`** y `dataclasses.replace` para el estado inmutable.
- **Inyección del generador aleatorio** (`rng: random.Random | None`) para poder reproducir una partida en las pruebas.
