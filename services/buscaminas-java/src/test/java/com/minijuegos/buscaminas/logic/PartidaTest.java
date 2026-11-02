package com.minijuegos.buscaminas.logic;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** Pruebas de las reglas de la partida: primer clic, victoria, derrota, banderas, errores y vista del jugador. */
class PartidaTest {

    private static Accion revelar(int f, int c) {
        return new Accion.Revelar(new Posicion(f, c));
    }

    private static Accion bandera(int f, int c) {
        return new Accion.Bandera(new Posicion(f, c));
    }

    // Tablero 4x4 con una sola mina en la esquina (0,0): números 1 junto a ella y ceros en el resto.
    private static Partida unaMina() {
        return Partida.conMinas(4, 4, List.of(new Posicion(0, 0)));
    }

    // Mensaje de la excepción que lanza una acción inválida.
    private static String mensajeDe(Partida p, Accion a) {
        return assertThrows(MovimientoInvalido.class, () -> p.aplicar(a)).getMessage();
    }

    @Test
    void elPrimerClicNuncaPierdeYNoHayMinasHastaEntonces() {
        for (long semilla = 0; semilla < 200; semilla++) {
            Partida p = Partida.nueva(new Opciones(9, 9, 72), new Random(semilla)); // 72 = 81 - 9, el máximo: solo queda libre la zona segura
            p.aplicar(revelar(4, 4));
            // Con el máximo de minas las 9 casillas libres son la zona segura: el clic abre todas y se gana.
            assertNotEquals(EstadoPartida.PERDIDA, p.estado(), "semilla " + semilla);
        }
    }

    @Test
    void unaPartidaNuevaMuestraSoloCasillasOcultas() {
        Partida p = Partida.nueva(Opciones.porDefecto(), new Random(1));
        for (int[] fila : p.vista()) {
            for (int v : fila) {
                assertEquals(Partida.OCULTA, v);
            }
        }
    }

    @Test
    void durantePartidaLaVistaNuncaMuestraMinasOcultas() {
        Partida p = Partida.nueva(new Opciones(9, 9, 10), new Random(7));
        p.aplicar(revelar(4, 4));
        for (int[] fila : p.vista()) {
            for (int v : fila) {
                assertTrue(v < Partida.MINA, "la vista no debe revelar minas, valor " + v);
            }
        }
    }

    @Test
    void destaparUnaMinaPierdeYMuestraTodasLasMinas() {
        Partida p = Partida.conMinas(4, 4, List.of(new Posicion(0, 0), new Posicion(3, 3)));
        p.aplicar(revelar(0, 0));
        assertEquals(EstadoPartida.PERDIDA, p.estado());
        int[][] v = p.vista();
        assertEquals(Partida.MINA_EXPLOTADA, v[0][0]);
        assertEquals(Partida.MINA, v[3][3]);
        assertEquals(Partida.OCULTA, v[2][2]);
    }

    @Test
    void alPerderLasBanderasMalPuestasSeMarcan() {
        Partida p = Partida.conMinas(4, 4, List.of(new Posicion(0, 0), new Posicion(3, 3)));
        p.aplicar(bandera(1, 2)); // sin mina
        p.aplicar(bandera(3, 3)); // con mina
        p.aplicar(revelar(0, 0));
        int[][] v = p.vista();
        assertEquals(Partida.BANDERA_ERRONEA, v[1][2]);
        assertEquals(Partida.BANDERA, v[3][3]);
    }

    @Test
    void destaparTodasLasSegurasGanaYMarcaLasMinasConBandera() {
        Partida p = unaMina();
        p.aplicar(revelar(3, 3));
        assertEquals(EstadoPartida.GANADA, p.estado());
        assertEquals(Partida.BANDERA, p.vista()[0][0]);
    }

    @Test
    void laVistaMuestraLosNumerosDeMinasVecinas() {
        Partida p = unaMina();
        p.aplicar(revelar(3, 3));
        int[][] v = p.vista();
        // La mina ya se muestra como bandera al ganar; los números vecinos valen 1 y el resto 0.
        assertEquals(1, v[0][1]);
        assertEquals(1, v[1][0]);
        assertEquals(1, v[1][1]);
        assertEquals(0, v[3][3]);
    }

    @Test
    void laBanderaSeAlternaYCuentaLasMinasRestantes() {
        Partida p = Partida.conMinas(4, 4, List.of(new Posicion(0, 0), new Posicion(3, 3)));
        p.aplicar(bandera(1, 1));
        assertEquals(1, p.banderas());
        assertEquals(1, p.minasRestantes());
        p.aplicar(bandera(1, 1));
        assertEquals(0, p.banderas());
        p.aplicar(bandera(1, 1));
        p.aplicar(bandera(1, 2));
        p.aplicar(bandera(2, 2));
        assertEquals(-1, p.minasRestantes());
    }

    @Test
    void unaCasillaConBanderaNoSeDestapaYLaAperturaNoLaTraspasa() {
        Partida p = unaMina();
        p.aplicar(bandera(3, 3));
        assertEquals("La celda tiene una bandera; quítala antes de destaparla", mensajeDe(p, revelar(3, 3)));
        p.aplicar(revelar(2, 2));
        assertEquals(EstadoPartida.JUGANDO, p.estado());
        assertEquals(Partida.BANDERA, p.vista()[3][3]);
        p.aplicar(bandera(3, 3)); // se quita
        p.aplicar(revelar(3, 3));
        assertEquals(EstadoPartida.GANADA, p.estado());
    }

    @Test
    void sePuedePonerBanderaAntesDelPrimerClic() {
        Partida p = Partida.nueva(new Opciones(9, 9, 10), new Random(3));
        p.aplicar(bandera(0, 0));
        assertEquals(Partida.BANDERA, p.vista()[0][0]);
    }

    @Test
    void rechazaAccionesInvalidas() {
        Partida p = unaMina();
        p.aplicar(revelar(3, 3));
        // La partida ya está ganada: cualquier acción se rechaza.
        assertEquals("La partida ya terminó", mensajeDe(p, revelar(0, 1)));
        assertEquals("La partida ya terminó", mensajeDe(p, bandera(0, 1)));
    }

    @Test
    void rechazaCasillasYaReveladasYFueraDelTablero() {
        Partida p = Partida.conMinas(5, 5, List.of(new Posicion(0, 0)));
        p.aplicar(revelar(1, 1)); // un 1: no abre vecinas
        assertEquals("La celda ya está revelada", mensajeDe(p, revelar(1, 1)));
        assertEquals("No se puede poner bandera en una celda revelada", mensajeDe(p, bandera(1, 1)));
        assertEquals("La celda está fuera del tablero", mensajeDe(p, revelar(5, 0)));
        assertEquals("La celda está fuera del tablero", mensajeDe(p, bandera(0, -1)));
    }

    @Test
    void validaLasOpciones() {
        assertThrows(MovimientoInvalido.class, () -> new Opciones(2, 10, 5));
        assertThrows(MovimientoInvalido.class, () -> new Opciones(10, 51, 5));
        assertThrows(MovimientoInvalido.class, () -> new Opciones(10, 10, 0));
        assertThrows(MovimientoInvalido.class, () -> new Opciones(5, 5, 17)); // máximo 25 - 9 = 16
        assertEquals(16, new Opciones(5, 5, 16).minas());
        assertEquals(new Opciones(16, 16, 40), Opciones.porDefecto());
    }
}
