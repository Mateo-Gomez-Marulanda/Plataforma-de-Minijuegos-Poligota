# Plataforma de Minijuegos Políglota

Sudoku (Python), Buscaminas (Java), Snake (Elixir) y Tetris (C#), cada uno como servicio independiente detrás de un gateway Node.js, con un único frontend React.

Diseño completo: [docs/arquitectura-minijuegos.md](docs/arquitectura-minijuegos.md)

## Comandos

```sh
docker compose up --build        # construir y levantar todo
docker compose up snake-service  # un solo servicio
docker compose logs -f gateway   # logs
docker compose down              # detener
```

## Estado

Listos: estructura, Docker, gateway (`cd gateway && npm test`) y servicio Sudoku (`cd services/sudoku-python && .venv/bin/pytest`). Pendiente: frontend, Buscaminas, Snake y Tetris; sus Dockerfiles son provisionales (`sleep infinity`).

## Desarrollo local del Sudoku

```sh
cd services/sudoku-python
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest
.venv/bin/uvicorn server.main:app --port 8001
```
