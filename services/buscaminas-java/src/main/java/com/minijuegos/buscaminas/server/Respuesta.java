package com.minijuegos.buscaminas.server;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.minijuegos.buscaminas.logic.Partida;

/**
 * Estado de una partida en el formato del contrato común (sección 4.1 del diseño).
 * El tablero solo trae lo que el jugador puede ver: nunca las minas ocultas de una partida en curso.
 */
record Respuesta(String id, String game, String status, int[][] board, Datos data, String message) {

    /** Información propia del juego (va dentro de `data`). */
    record Datos(
            int rows,
            int cols,
            int mines,
            int flags,
            @JsonProperty("mines_remaining") int minesRemaining) {
    }

    /** Convierte una partida de la lógica en la respuesta del contrato. */
    static Respuesta de(String id, Partida partida) {
        var o = partida.opciones();
        var datos = new Datos(o.filas(), o.columnas(), o.minas(), partida.banderas(), partida.minasRestantes());
        return new Respuesta(id, "buscaminas", partida.estado().codigo(), partida.vista(), datos, null);
    }
}
