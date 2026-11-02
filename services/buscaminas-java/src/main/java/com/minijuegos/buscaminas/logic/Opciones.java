package com.minijuegos.buscaminas.logic;

/**
 * Parámetros de una partida. Se validan al construirlas, así que una instancia siempre es válida.
 * Las minas no pueden superar filas*columnas - 9 para que siempre quepa la zona segura del primer clic.
 */
public record Opciones(int filas, int columnas, int minas) {
    public static final int LADO_MINIMO = 3;
    public static final int LADO_MAXIMO = 50;

    public Opciones {
        if (filas < LADO_MINIMO || filas > LADO_MAXIMO) {
            throw new MovimientoInvalido("rows debe estar entre " + LADO_MINIMO + " y " + LADO_MAXIMO);
        }
        if (columnas < LADO_MINIMO || columnas > LADO_MAXIMO) {
            throw new MovimientoInvalido("cols debe estar entre " + LADO_MINIMO + " y " + LADO_MAXIMO);
        }
        int maximo = filas * columnas - 9;
        if (minas < 1 || minas > maximo) {
            throw new MovimientoInvalido("mines debe estar entre 1 y " + maximo + " para este tablero");
        }
    }

    /** Tablero intermedio clásico: 16x16 con 40 minas. */
    public static Opciones porDefecto() {
        return new Opciones(16, 16, 40);
    }
}
