package com.minijuegos.buscaminas.server;

/** No existe ninguna partida con el id pedido (responde 404). */
class PartidaNoEncontrada extends RuntimeException {
    PartidaNoEncontrada() {
        super("Partida no encontrada");
    }
}
