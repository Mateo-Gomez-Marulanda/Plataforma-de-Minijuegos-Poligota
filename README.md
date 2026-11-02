# Plataforma de Minijuegos Políglota

Sudoku (Python), Buscaminas (Java), Snake (Elixir) y Tetris (C#), cada uno como servicio independiente detrás de un gateway Node.js, con un único frontend React.

Diseño completo: [docs/arquitectura-minijuegos.md](docs/arquitectura-minijuegos.md)

## Documentación

| Documento | De qué trata |
| :---- | :---- |
| [docs/arquitectura-minijuegos.md](docs/arquitectura-minijuegos.md) | Diseño: objetivos, contrato común y reglas del proyecto |
| [docs/funcionamiento-general.md](docs/funcionamiento-general.md) | Cómo viaja una jugada del navegador a la lógica y comparación de tecnologías |
| [docs/sudoku-python.md](docs/sudoku-python.md) | Sudoku por dentro: Python, FastAPI y Uvicorn |
| [docs/buscaminas-java.md](docs/buscaminas-java.md) | Buscaminas por dentro: Java 21 y Spring Boot |
| [docs/snake-elixir.md](docs/snake-elixir.md) | Snake por dentro: Elixir, OTP, Bandit y Plug |
| [docs/tetris-csharp.md](docs/tetris-csharp.md) | Tetris por dentro: C#, ASP.NET Core y WebSockets |
| [docs/frontend-y-gateway.md](docs/frontend-y-gateway.md) | React, Vite y el gateway de Node |

## Ejecución del programa

La web queda en **http://localhost:5173**. Hay dos formas de levantarla.

**Opción A: web local + backend en Docker (para jugar Sudoku y Snake)**

Requiere Node.js 22 o superior. Cada juego necesita su servicio y el gateway; levántalos con Docker y la web con Vite:

```sh
docker compose up -d --build --no-deps gateway sudoku-service snake-service buscaminas-service tetris-service
cd frontend
npm install
npm run dev
```

Sin el backend la web también abre, pero Sudoku y Snake muestran "No se pudo conectar con el servidor" con un botón para reintentar. Inicio, créditos y la lista de minijuegos funcionan sin él.

**Opción B: todo en Docker**

Levanta la web, el gateway y los servicios que ya están implementados (Sudoku, Snake, Buscaminas y Tetris):

```sh
docker compose up --build --no-deps frontend gateway sudoku-service snake-service buscaminas-service tetris-service
```

El gateway queda en http://localhost:3000.

Para detener todo, `docker compose down`. Si `docker compose` falla al descargar imágenes con un error de `credentials` o `gpg`, desbloquea gpg o quita `credsStore` de `~/.docker/config.json`.

## Comandos

```sh
docker compose up --build        # construir y levantar todo (incluye los servicios provisionales)
docker compose up snake-service  # un solo servicio
docker compose logs -f gateway   # logs
docker compose down              # detener
```

## Estado

Todo implementado: gateway, los cuatro servicios (Sudoku en Python, Buscaminas en Java, Snake en Elixir y Tetris en C#) y el frontend con los cuatro juegos jugables, el inicio y los créditos.

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

## Desarrollo local de Buscaminas

Con JDK 21 o superior y Maven instalados:

```sh
cd services/buscaminas-java
mvn test                 # pruebas
mvn spring-boot:run      # servicio en http://localhost:8002
```

Sin JDK ni Maven, el servicio se compila y se ejecuta dentro de Docker:

```sh
cd services/buscaminas-java
docker build -t buscaminas . && docker run --rm -p 8002:8002 buscaminas
```

## Desarrollo local de Tetris

Con el SDK de .NET 8 instalado (en Arch: `sudo pacman -S dotnet-sdk-8.0 aspnet-runtime-8.0`):

```sh
cd services/tetris-csharp
dotnet test tests/Tetris.Tests
dotnet run --project src/Tetris        # servicio en http://localhost:8004
```

Sin .NET 8 (por ejemplo, solo con .NET 10), las pruebas se ejecutan en Docker. El contenedor corre como root, así que se devuelve la propiedad de los archivos al final:

```sh
cd services/tetris-csharp
docker run --rm -v "$PWD":/src -w /src mcr.microsoft.com/dotnet/sdk:8.0 \
  sh -c "dotnet test tests/Tetris.Tests; chown -R $(id -u):$(id -g) /src"
```

Para jugar no hace falta nada de esto: la imagen del servicio (`docker build -t tetris services/tetris-csharp`) compila dentro de Docker.
