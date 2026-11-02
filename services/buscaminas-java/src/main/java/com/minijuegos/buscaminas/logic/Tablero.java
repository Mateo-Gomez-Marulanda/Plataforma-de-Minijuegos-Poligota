package com.minijuegos.buscaminas.logic;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.random.RandomGenerator;

/** Cuadrícula de casillas: coloca las minas, cuenta vecinas y abre regiones vacías en cadena. */
final class Tablero {
    private final Celda[][] celdas;
    private final int filas;
    private final int columnas;

    Tablero(int filas, int columnas) {
        this.filas = filas;
        this.columnas = columnas;
        this.celdas = new Celda[filas][columnas];
        for (int f = 0; f < filas; f++) {
            for (int c = 0; c < columnas; c++) {
                celdas[f][c] = new Celda();
            }
        }
    }

    int filas() {
        return filas;
    }

    int columnas() {
        return columnas;
    }

    boolean contiene(Posicion p) {
        return p.fila() >= 0 && p.fila() < filas && p.columna() >= 0 && p.columna() < columnas;
    }

    Celda celda(Posicion p) {
        return celdas[p.fila()][p.columna()];
    }

    /** Las hasta ocho casillas que rodean a `p` y están dentro del tablero. */
    List<Posicion> vecinas(Posicion p) {
        List<Posicion> resultado = new ArrayList<>(8);
        for (int df = -1; df <= 1; df++) {
            for (int dc = -1; dc <= 1; dc++) {
                Posicion v = new Posicion(p.fila() + df, p.columna() + dc);
                if ((df != 0 || dc != 0) && contiene(v)) {
                    resultado.add(v);
                }
            }
        }
        return resultado;
    }

    /**
     * Reparte `cantidad` minas al azar sin tocar la casilla `primera` ni sus vecinas
     * (así el primer clic nunca pierde y suele abrir una región), y calcula los números.
     */
    void colocarMinas(int cantidad, Posicion primera, RandomGenerator azar) {
        List<Posicion> zonaSegura = new ArrayList<>(vecinas(primera));
        zonaSegura.add(primera);
        List<Posicion> candidatas = new ArrayList<>();
        for (int f = 0; f < filas; f++) {
            for (int c = 0; c < columnas; c++) {
                Posicion p = new Posicion(f, c);
                if (!zonaSegura.contains(p)) {
                    candidatas.add(p);
                }
            }
        }
        Collections.shuffle(candidatas, azar);
        candidatas.subList(0, cantidad).forEach(p -> celda(p).ponerMina());
        contarVecinas();
    }

    /** Calcula para cada casilla cuántas de sus vecinas tienen mina. */
    void contarVecinas() {
        for (int f = 0; f < filas; f++) {
            for (int c = 0; c < columnas; c++) {
                Posicion p = new Posicion(f, c);
                celda(p).asignarVecinas((int) vecinas(p).stream().filter(v -> celda(v).esMina()).count());
            }
        }
    }

    /**
     * Destapa `origen` y, si no tiene minas alrededor, todas las vecinas en cadena (flood fill con BFS).
     * Las casillas con bandera no se abren. Devuelve cuántas casillas se destaparon.
     */
    int revelarEnCadena(Posicion origen) {
        ArrayDeque<Posicion> pendientes = new ArrayDeque<>();
        celda(origen).revelar();
        int reveladas = 1;
        if (celda(origen).vecinas() == 0) {
            pendientes.add(origen);
        }
        while (!pendientes.isEmpty()) {
            Posicion actual = pendientes.poll();
            for (Posicion v : vecinas(actual)) {
                Celda vecina = celda(v);
                if (vecina.estado() == EstadoCelda.OCULTA) {
                    vecina.revelar();
                    reveladas++;
                    if (vecina.vecinas() == 0) {
                        pendientes.add(v);
                    }
                }
            }
        }
        return reveladas;
    }
}
