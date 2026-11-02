# Plataforma de Minijuegos Políglota

Sudoku (Python), Buscaminas (Java), Snake (Elixir) y Tetris (C#), cada uno como servicio independiente detrás de un gateway Node.js, con un único frontend React.

Diseño completo: [docs/arquitectura-minijuegos.md](docs/arquitectura-minijuegos.md)

## Ejecución del programa

La web queda en **http://localhost:5173**. Hay dos formas de levantarla.

**Opción A: solo la web (la más rápida, sin Docker)**

Requiere Node.js 22 o superior. Hoy la web solo muestra el inicio, los minijuegos y los créditos, y todavía no se conecta a ningún juego, así que con esto basta:

```sh
cd frontend
npm install
npm run dev
```

**Opción B: con Docker**

Levanta la web, el gateway y los servicios que ya están implementados (Sudoku y Snake):

```sh
docker compose up --build --no-deps frontend gateway sudoku-service snake-service
```

El gateway queda en http://localhost:3000. Buscaminas y Tetris no se incluyen porque todavía no están implementados.

Para detener todo, `docker compose down`. Si `docker compose` falla al descargar imágenes con un error de `credentials` o `gpg`, desbloquea gpg o quita `credsStore` de `~/.docker/config.json`.

## Comandos

```sh
docker compose up --build        # construir y levantar todo (incluye los servicios provisionales)
docker compose up snake-service  # un solo servicio
docker compose logs -f gateway   # logs
docker compose down              # detener
```

## Estado

Listos: estructura, Docker, gateway, servicio Sudoku, servicio Snake y frontend base (inicio, minijuegos y créditos; los juegos aún no se conectan). Pendiente: Buscaminas, Tetris y los componentes de juego; sus Dockerfiles son provisionales (`sleep infinity`).

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

## Desarrollo local del frontend

```sh
cd frontend
npm install
npm run dev     # http://localhost:5173
npm test
```
