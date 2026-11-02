package com.minijuegos.buscaminas.logic;

/** Fase de la partida. Los valores coinciden con el `status` del contrato (playing, won, lost). */
public enum EstadoPartida {
    JUGANDO("playing"), GANADA("won"), PERDIDA("lost");

    private final String codigo;

    EstadoPartida(String codigo) {
        this.codigo = codigo;
    }

    /** Texto que usa el contrato común en el campo `status`. */
    public String codigo() {
        return codigo;
    }
}
