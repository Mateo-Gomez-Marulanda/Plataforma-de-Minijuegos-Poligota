# Imagen del servicio Asteroids (Go) en dos etapas: compila un binario estático con el SDK de Go y lo ejecuta
# en una imagen vacía (scratch), la más ligera del proyecto. No hace falta tener Go instalado. Puerto 8005.
FROM golang:1.23-alpine AS build
WORKDIR /src
# Primero solo los módulos, para que la descarga de dependencias quede en caché entre builds.
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
COPY logic/ logic/
COPY server/ server/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/asteroids .

FROM scratch
ENV PORT=8005
COPY --from=build /out/asteroids /asteroids
EXPOSE 8005
ENTRYPOINT ["/asteroids"]
