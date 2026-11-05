# Imagen del servicio Rust Like (Rust) en dos etapas: compila un binario estático (musl) con el SDK de Rust
# y lo ejecuta en una imagen vacía (scratch). No hace falta tener Rust instalado. Puerto 8007.
FROM rust:1.99-alpine AS build
WORKDIR /src
# Primero solo el manifiesto con un crate vacío, para que la descarga y compilación de dependencias quede en caché.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && touch src/lib.rs && echo 'fn main() {}' > src/main.rs \
    && cargo build --release --locked
COPY src/ src/
# Se tocan los archivos para que cargo recompile el crate real y no reutilice el vacío.
RUN touch src/lib.rs src/main.rs && cargo build --release --locked

FROM scratch
ENV PORT=8007
COPY --from=build /src/target/release/rustlike-service /rustlike-service
EXPOSE 8007
CMD ["/rustlike-service"]
