// Pruebas del tablero: límites, colocación inmutable y limpieza de líneas.
using Tetris.Logic;
using Xunit;

namespace Tetris.Tests;

public class BoardTests
{
    // Casillas de una fila completa, salvo las columnas indicadas.
    internal static IEnumerable<Offset> Fila(int fila, params int[] huecos) =>
        Enumerable.Range(0, Board.Width).Where(c => !huecos.Contains(c)).Select(c => new Offset(fila, c));

    [Fact]
    public void LosLimitesLateralesYElSueloNoEstanLibresPeroElTechoSi()
    {
        var tablero = Board.Empty;
        Assert.False(tablero.IsFree(5, -1));
        Assert.False(tablero.IsFree(5, Board.Width));
        Assert.False(tablero.IsFree(Board.Height, 0));
        Assert.True(tablero.IsFree(-1, 4));
        Assert.True(tablero.IsFree(0, 0));
    }

    [Fact]
    public void ColocarCasillasNoModificaElTableroOriginal()
    {
        var original = Board.Empty;
        var nuevo = original.Place([new Offset(19, 0), new Offset(-1, 3)], 5);
        Assert.Equal(0, original[19, 0]);
        Assert.Equal(5, nuevo[19, 0]);
        Assert.False(nuevo.IsFree(19, 0));
    }

    [Fact]
    public void SinFilasCompletasNoSeLimpiaNada()
    {
        var tablero = Board.Empty.Place(Fila(19, 4), 1);
        var (resultado, limpiadas) = tablero.ClearLines();
        Assert.Equal(0, limpiadas);
        Assert.Same(tablero, resultado);
    }

    [Fact]
    public void UnaFilaCompletaSeEliminaYLoDeEncimaBaja()
    {
        var tablero = Board.Empty.Place(Fila(19), 1).Place([new Offset(18, 2)], 3);
        var (resultado, limpiadas) = tablero.ClearLines();
        Assert.Equal(1, limpiadas);
        Assert.Equal(3, resultado[19, 2]);
        Assert.Equal(0, resultado[18, 2]);
        Assert.Equal(1, Enumerable.Range(0, Board.Width).Count(c => resultado[19, c] != 0));
    }

    [Fact]
    public void FilasCompletasNoAdyacentesSeEliminanYLasDemasConservanElOrden()
    {
        var tablero = Board.Empty
            .Place(Fila(19), 1)
            .Place(Fila(18, 0), 2)  // incompleta: debe sobrevivir
            .Place(Fila(17), 1)
            .Place([new Offset(16, 9)], 4);
        var (resultado, limpiadas) = tablero.ClearLines();
        Assert.Equal(2, limpiadas);
        Assert.Equal(0, resultado[19, 0]);   // la antigua fila 18 (hueco en la columna 0) ahora es la 19
        Assert.Equal(2, resultado[19, 1]);
        Assert.Equal(4, resultado[18, 9]);   // lo que estaba en la fila 16 bajó dos
    }

    [Fact]
    public void LaMatrizTieneVeinteFilasPorDiezColumnas()
    {
        var matriz = Board.Empty.Place([new Offset(3, 7)], 6).ToMatrix();
        Assert.Equal(20, matriz.Length);
        Assert.All(matriz, fila => Assert.Equal(10, fila.Length));
        Assert.Equal(6, matriz[3][7]);
    }
}
