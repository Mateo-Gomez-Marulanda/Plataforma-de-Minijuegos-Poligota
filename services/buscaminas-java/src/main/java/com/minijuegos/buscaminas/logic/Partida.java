package com.minijuegos.buscaminas.logic;

import java.util.Collection;
import java.util.random.RandomGenerator;

/**
 * Una partida de Buscaminas: reglas, estado y vista del jugador. Es lógica pura, sin Spring ni JSON.
 * Operaciones del diseño: nueva (nuevo_juego), aplicar (aplicar_accion) y estado (terminado).
 * Los métodos son synchronized porque dos peticiones HTTP podrían tocar la misma partida a la vez.
 */
public final class Partida {
    // Códigos de la vista del jugador (0 a 8 son los números de minas vecinas).
    public static final int OCULTA = -1;
    public static final int BANDERA = -2;
    public static final int MINA = 9; // solo al perder
    public static final int MINA_EXPLOTADA = 10; // solo al perder: la que se destapó
    public static final int BANDERA_ERRONEA = 11; // solo al perder: bandera sobre una casilla sin mina

    private final Opciones opciones;
    private final Tablero tablero;
    private final RandomGenerator azar;
    private EstadoPartida estado = EstadoPartida.JUGANDO;
    private boolean minasColocadas;
    private int banderas;
    private int reveladas;

    private Partida(Opciones opciones, RandomGenerator azar) {
        this.opciones = opciones;
        this.tablero = new Tablero(opciones.filas(), opciones.columnas());
        this.azar = azar;
    }

    /** Crea una partida. Las minas se reparten al hacer el primer clic, no ahora. */
    public static Partida nueva(Opciones opciones, RandomGenerator azar) {
        return new Partida(opciones, azar);
    }

    /** Crea una partida con las minas en posiciones fijas (para pruebas deterministas). */
    public static Partida conMinas(int filas, int columnas, Collection<Posicion> minas) {
        Partida partida = new Partida(new Opciones(filas, columnas, minas.size()), null);
        minas.forEach(p -> partida.tablero.celda(p).ponerMina());
        partida.tablero.contarVecinas();
        partida.minasColocadas = true;
        return partida;
    }

    /** Aplica la acción del jugador. Lanza MovimientoInvalido si no se puede. */
    public synchronized void aplicar(Accion accion) {
        switch (accion) {
            case Accion.Revelar r -> revelar(r.posicion());
            case Accion.Bandera b -> alternarBandera(b.posicion());
        }
    }

    // Destapa una casilla: coloca las minas si es el primer clic, pierde si hay mina y gana si no quedan seguras.
    private void revelar(Posicion p) {
        verificarJugable(p);
        Celda celda = tablero.celda(p);
        switch (celda.estado()) {
            case REVELADA -> throw new MovimientoInvalido("La celda ya está revelada");
            case BANDERA -> throw new MovimientoInvalido("La celda tiene una bandera; quítala antes de destaparla");
            case OCULTA -> { }
        }
        if (!minasColocadas) {
            tablero.colocarMinas(opciones.minas(), p, azar);
            minasColocadas = true;
        }
        if (celda.esMina()) {
            celda.revelar();
            estado = EstadoPartida.PERDIDA;
            return;
        }
        reveladas += tablero.revelarEnCadena(p);
        if (reveladas == opciones.filas() * opciones.columnas() - opciones.minas()) {
            estado = EstadoPartida.GANADA;
        }
    }

    // Pone o quita la bandera de una casilla oculta.
    private void alternarBandera(Posicion p) {
        verificarJugable(p);
        Celda celda = tablero.celda(p);
        if (celda.estado() == EstadoCelda.REVELADA) {
            throw new MovimientoInvalido("No se puede poner bandera en una celda revelada");
        }
        banderas += celda.estado() == EstadoCelda.BANDERA ? -1 : 1;
        celda.alternarBandera();
    }

    // Comprueba que la partida siga en curso y que la posición esté dentro del tablero.
    private void verificarJugable(Posicion p) {
        if (estado != EstadoPartida.JUGANDO) {
            throw new MovimientoInvalido("La partida ya terminó");
        }
        if (!tablero.contiene(p)) {
            throw new MovimientoInvalido("La celda está fuera del tablero");
        }
    }

    /** Estado actual: jugando, ganada o perdida. */
    public synchronized EstadoPartida estado() {
        return estado;
    }

    public Opciones opciones() {
        return opciones;
    }

    public synchronized int banderas() {
        return banderas;
    }

    /** Minas menos banderas puestas; puede ser negativo si el jugador marca de más. */
    public synchronized int minasRestantes() {
        return opciones.minas() - banderas;
    }

    /**
     * Matriz con lo que el jugador puede ver. Mientras se juega nunca incluye minas ocultas;
     * al perder se muestran todas (y las banderas erróneas) y al ganar las minas restantes salen con bandera.
     */
    public synchronized int[][] vista() {
        int[][] vista = new int[tablero.filas()][tablero.columnas()];
        for (int f = 0; f < tablero.filas(); f++) {
            for (int c = 0; c < tablero.columnas(); c++) {
                vista[f][c] = codigo(tablero.celda(new Posicion(f, c)));
            }
        }
        return vista;
    }

    // Traduce una casilla al código que ve el jugador según el estado de la partida.
    private int codigo(Celda celda) {
        return switch (celda.estado()) {
            case REVELADA -> celda.esMina() ? MINA_EXPLOTADA : celda.vecinas();
            case BANDERA -> estado == EstadoPartida.PERDIDA && !celda.esMina() ? BANDERA_ERRONEA : BANDERA;
            case OCULTA -> switch (estado) {
                case PERDIDA -> celda.esMina() ? MINA : OCULTA;
                case GANADA -> celda.esMina() ? BANDERA : OCULTA;
                case JUGANDO -> OCULTA;
            };
        };
    }
}
