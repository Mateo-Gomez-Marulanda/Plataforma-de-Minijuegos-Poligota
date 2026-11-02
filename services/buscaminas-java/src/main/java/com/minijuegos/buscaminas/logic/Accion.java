package com.minijuegos.buscaminas.logic;

/** Acciones que puede hacer el jugador. Es una interfaz sellada: solo existen estas dos. */
public sealed interface Accion {

    /** Destapar una casilla. */
    record Revelar(Posicion posicion) implements Accion {
    }

    /** Poner o quitar la bandera de una casilla. */
    record Bandera(Posicion posicion) implements Accion {
    }
}
