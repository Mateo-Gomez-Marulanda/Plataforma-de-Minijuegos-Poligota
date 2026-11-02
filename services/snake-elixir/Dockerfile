# Imagen del servicio Snake en dos etapas: compila un release de Elixir y lo ejecuta
# en una Alpine mínima (misma versión que la imagen de build) sirviendo en el puerto 8003.
FROM elixir:1.17-alpine AS build
ENV MIX_ENV=prod
WORKDIR /app
RUN mix local.hex --force && mix local.rebar --force
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod && mix deps.compile
COPY lib ./lib
RUN mix release

FROM alpine:3.22
RUN apk add --no-cache libstdc++ ncurses-libs openssl
WORKDIR /app
COPY --from=build /app/_build/prod/rel/snake ./
ENV PORT=8003
EXPOSE 8003
CMD ["bin/snake", "start"]
