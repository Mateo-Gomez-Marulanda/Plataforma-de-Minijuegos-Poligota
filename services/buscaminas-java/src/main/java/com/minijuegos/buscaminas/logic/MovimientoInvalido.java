package com.minijuegos.buscaminas.logic;

/** La acción o las opciones no son válidas (fuera de rango, casilla ya revelada, partida terminada...). */
public class MovimientoInvalido extends RuntimeException {
    public MovimientoInvalido(String mensaje) {
        super(mensaje);
    }
}
