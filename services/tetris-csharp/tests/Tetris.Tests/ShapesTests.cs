// Pruebas de las formas de las piezas, su aparición y las tablas de wall kicks del SRS.
using Tetris.Logic;
using Xunit;

namespace Tetris.Tests;

public class ShapesTests
{
    // Todas las combinaciones de pieza y orientación.
    public static TheoryData<Tetromino, int> PiezasYRotaciones()
    {
        var datos = new TheoryData<Tetromino, int>();
        foreach (var tipo in Enum.GetValues<Tetromino>())
        {
            for (int rotacion = 0; rotacion < 4; rotacion++)
            {
                datos.Add(tipo, rotacion);
            }
        }
        return datos;
    }

    [Theory]
    [MemberData(nameof(PiezasYRotaciones))]
    public void CadaOrientacionTieneCuatroCasillasDistintas(Tetromino tipo, int rotacion)
    {
        var casillas = Shapes.Cells(tipo, rotacion);
        Assert.Equal(4, casillas.Distinct().Count());
    }

    [Fact]
    public void LaIVerticalOcupaLaTerceraColumnaDeSuCaja()
    {
        Assert.Equal(new[] { new Offset(0, 2), new Offset(1, 2), new Offset(2, 2), new Offset(3, 2) }, Shapes.Cells(Tetromino.I, 1));
    }

    [Fact]
    public void LaTMiraALaDerechaTrasUnGiroHorario()
    {
        // Orientación R de la T: barra vertical con la punta a la derecha.
        var esperadas = new[] { new Offset(0, 1), new Offset(1, 1), new Offset(1, 2), new Offset(2, 1) };
        Assert.Equal(esperadas.OrderBy(o => o.Row).ThenBy(o => o.Col), Shapes.Cells(Tetromino.T, 1).OrderBy(o => o.Row).ThenBy(o => o.Col));
    }

    [Fact]
    public void LaOEsIgualEnTodasLasOrientaciones()
    {
        Assert.All(Enumerable.Range(0, 4), r => Assert.Equal(Shapes.Cells(Tetromino.O, 0), Shapes.Cells(Tetromino.O, r)));
    }

    [Theory]
    [InlineData(Tetromino.I)] [InlineData(Tetromino.O)] [InlineData(Tetromino.T)] [InlineData(Tetromino.S)]
    [InlineData(Tetromino.Z)] [InlineData(Tetromino.J)] [InlineData(Tetromino.L)]
    public void LasPiezasAparecenPegadasAlBordeSuperiorYCentradas(Tetromino tipo)
    {
        var celdas = Piece.Spawn(tipo).Cells.ToList();
        Assert.Equal(0, celdas.Min(c => c.Row));
        Assert.All(celdas, c => Assert.InRange(c.Col, 3, 6));
        Assert.All(celdas, c => Assert.True(Board.Empty.IsFree(c.Row, c.Col)));
    }

    [Theory]
    [InlineData(Tetromino.I)] [InlineData(Tetromino.T)] [InlineData(Tetromino.L)]
    public void CadaTablaDeKicksEmpiezaSinDesplazamientoYTieneCincoPruebas(Tetromino tipo)
    {
        for (int desde = 0; desde < 4; desde++)
        {
            var pruebas = Kicks.For(tipo, desde);
            Assert.Equal(5, pruebas.Count);
            Assert.Equal(new Offset(0, 0), pruebas[0]);
        }
    }

    [Fact]
    public void LaOSoloTieneLaPruebaSinDesplazamiento()
    {
        Assert.Equal(new[] { new Offset(0, 0) }, Kicks.For(Tetromino.O, 0));
    }

    [Fact]
    public void LaTablaDeKicksConvierteLaYHaciaArribaEnFilasHaciaAbajo()
    {
        // JLSTZ 0 -> R: la tercera prueba oficial es (x=-1, y=+1): una columna a la izquierda y una fila ARRIBA.
        Assert.Equal(new Offset(-1, -1), Kicks.For(Tetromino.T, 0)[2]);
    }
}
