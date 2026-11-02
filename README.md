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

Listos: estructura, Docker, gateway (`cd gateway && npm test`), servicio Sudoku y servicio Snake. Pendiente: frontend, Buscaminas y Tetris; sus Dockerfiles son provisionales (`sleep infinity`).

## Desarrollo local del Sudoku

```sh
cd services/sudoku-python
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest
.venv/bin/uvicorn server.main:app --port 8001
```

## Desarrollo local de Snake

Si tienes Elixir y Erlang completos instalados (en Arch: `sudo pacman -S erlang elixir`), ejecuta `mix` directamente:

```sh
cd services/snake-elixir
MIX_ENV=test mix test
```

Si no los tienes, o el Erlang del sistema no trae `ssl`/`public_key`, ejecuta `mix` en Docker:

```sh
cd services/snake-elixir
docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -e MIX_ENV=test -v "$PWD":/app -w /app elixir:1.17-alpine \
  sh -c "mix local.hex --force && mix local.rebar --force && mix deps.get && mix test"
```
