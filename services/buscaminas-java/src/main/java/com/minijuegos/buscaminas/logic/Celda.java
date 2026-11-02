package com.minijuegos.buscaminas.logic;

/** Una casilla del tablero: si tiene mina, cuántas minas la rodean y qué ha hecho el jugador con ella. */
final class Celda {
    private boolean mina;
    private int vecinas;
    private EstadoCelda estado = EstadoCelda.OCULTA;

    boolean esMina() {
        return mina;
    }

    void ponerMina() {
        mina = true;
    }

    /** Número de minas en las ocho casillas vecinas. */
    int vecinas() {
        return vecinas;
    }

    void asignarVecinas(int cantidad) {
        vecinas = cantidad;
    }

    EstadoCelda estado() {
        return estado;
    }

    void revelar() {
        estado = EstadoCelda.REVELADA;
    }

    /** Alterna entre oculta y con bandera. */
    void alternarBandera() {
        estado = estado == EstadoCelda.BANDERA ? EstadoCelda.OCULTA : EstadoCelda.BANDERA;
    }
}
