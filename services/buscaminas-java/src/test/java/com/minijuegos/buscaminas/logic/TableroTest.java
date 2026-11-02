package com.minijuegos.buscaminas.logic;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.Random;
import org.junit.jupiter.api.Test;

/** Pruebas del tablero: reparto de minas, conteo de vecinas y apertura en cadena. */
class TableroTest {

    // Cuenta las casillas con mina.
    private static int contarMinas(Tablero t) {
        int total = 0;
        for (int f = 0; f < t.filas(); f++) {
            for (int c = 0; c < t.columnas(); c++) {
                if (t.celda(new Posicion(f, c)).esMina()) {
                    total++;
                }
            }
        }
        return total;
    }

    @Test
    void ponePreciseLaCantidadDeMinas() {
        Tablero t = new Tablero(9, 9);
        t.colocarMinas(10, new Posicion(4, 4), new Random(1));
        assertEquals(10, contarMinas(t));
    }

    @Test
    void laZonaDelPrimerClicNuncaTieneMinas() {
        for (long semilla = 0; semilla < 200; semilla++) {
            Tablero t = new Tablero(5, 5);
            Posicion centro = new Posicion(2, 2);
            t.colocarMinas(16, centro, new Random(semilla)); // el máximo permitido: solo queda libre la zona segura
            assertFalse(t.celda(centro).esMina());
            t.vecinas(centro).forEach(v -> assertFalse(t.celda(v).esMina()));
            assertEquals(16, contarMinas(t));
        }
    }

    @Test
    void cuentaBienLasMinasVecinas() {
        Tablero t = new Tablero(3, 3);
        t.celda(new Posicion(0, 0)).ponerMina();
        t.celda(new Posicion(0, 1)).ponerMina();
        t.contarVecinas();
        assertEquals(2, t.celda(new Posicion(1, 0)).vecinas());
        assertEquals(2, t.celda(new Posicion(1, 1)).vecinas());
        assertEquals(1, t.celda(new Posicion(1, 2)).vecinas());
        assertEquals(0, t.celda(new Posicion(2, 2)).vecinas());
    }

    @Test
    void lasEsquinasTienenTresVecinasYElCentroOcho() {
        Tablero t = new Tablero(3, 3);
        assertEquals(3, t.vecinas(new Posicion(0, 0)).size());
        assertEquals(5, t.vecinas(new Posicion(0, 1)).size());
        assertEquals(8, t.vecinas(new Posicion(1, 1)).size());
    }

    @Test
    void laAperturaEnCadenaRecorreLaRegionVaciaYSusBordes() {
        Tablero t = new Tablero(4, 4);
        t.celda(new Posicion(0, 0)).ponerMina();
        t.contarVecinas();
        // Todo menos la mina: 15 casillas seguras se abren desde la esquina opuesta.
        assertEquals(15, t.revelarEnCadena(new Posicion(3, 3)));
        assertEquals(EstadoCelda.OCULTA, t.celda(new Posicion(0, 0)).estado());
    }

    @Test
    void unNumeroNoAbreSusVecinas() {
        Tablero t = new Tablero(4, 4);
        t.celda(new Posicion(0, 0)).ponerMina();
        t.contarVecinas();
        assertEquals(1, t.revelarEnCadena(new Posicion(1, 1))); // vale 1: solo se destapa ella
    }

    @Test
    void laAperturaEnCadenaRespetaLasBanderas() {
        Tablero t = new Tablero(4, 4);
        t.celda(new Posicion(0, 0)).ponerMina();
        t.contarVecinas();
        t.celda(new Posicion(3, 3)).alternarBandera();
        assertEquals(14, t.revelarEnCadena(new Posicion(3, 0)));
        assertEquals(EstadoCelda.BANDERA, t.celda(new Posicion(3, 3)).estado());
    }
}
