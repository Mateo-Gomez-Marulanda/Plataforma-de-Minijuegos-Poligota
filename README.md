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

Estructura y Docker listos. Los Dockerfiles son provisionales (solo `sleep infinity`) hasta implementar cada servicio.
