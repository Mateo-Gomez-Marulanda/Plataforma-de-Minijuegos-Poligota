// Pruebas de las reglas del juego: bolsa de 7, movimiento, giros con wall kicks, gravedad, caídas,
// limpieza de líneas, puntaje, niveles, fin de partida y la matriz que se dibuja.
using Tetris.Logic;
using Xunit;

namespace Tetris.Tests;

public class GameTests
{
    // Partida con la pieza activa colocada a mano (tablero vacío salvo que se indique otro).
    private static GameState Con(Tetromino tipo, int rotacion, int fila, int col, Board? tablero = null) =>
        Game.NewGame(1) with { Current = new Piece(tipo, rotacion, fila, col), Board = tablero ?? Board.Empty };

    // Posiciones de las casillas de la pieza activa.
    private static List<(int Row, int Col)> Celdas(GameState e) => e.Current.Cells.Select(c => (c.Row, c.Col)).ToList();

    // ---- Piezas y bolsa de 7 ----

    [Fact]
    public void LaMismaSemillaDaLasMismasPiezasYOtraDistintaNo()
    {
        var a = Game.NewGame(42);
        var b = Game.NewGame(42);
        Assert.Equal(a.Current.Type, b.Current.Type);
        Assert.Equal(a.Upcoming, b.Upcoming);
        Assert.NotEqual(Game.NewGame(1).Upcoming, Game.NewGame(2).Upcoming);
    }

    [Fact]
    public void LasPiezasSalenEnBolsasDeSieteSinRepetirDentroDeCadaBolsa()
    {
        var e = Game.NewGame(7);
        var todas = new[] { e.Current.Type }.Concat(e.Upcoming).ToList(); // 14 piezas: dos bolsas
        Assert.Equal(14, todas.Count);
        var todos = Enum.GetValues<Tetromino>().Order();
        Assert.Equal(todos, todas.Take(7).Order());
        Assert.Equal(todos, todas.Skip(7).Take(7).Order());
    }

    [Fact]
    public void LaColaSeRellenaSolaYNuncaSeAgota()
    {
        var e = Game.NewGame(3);
        for (int i = 0; i < 40 && e.Status == GameStatus.Playing; i++)
        {
            e = Game.Apply(e, PlayerAction.HardDrop);
            Assert.True(e.Upcoming.Count >= 7);
        }
    }

    [Fact]
    public void LaPiezaSiguienteEsLaQueApareceTrasFijarLaActual()
    {
        var e = Game.NewGame(5);
        var siguiente = e.Next;
        Assert.Equal(siguiente, Game.Apply(e, PlayerAction.HardDrop).Current.Type);
    }

    // ---- Movimiento ----

    [Fact]
    public void LaPiezaSeMueveALosLados()
    {
        var e = Con(Tetromino.T, 0, 5, 3);
        Assert.Equal(2, Game.Apply(e, PlayerAction.Left).Current.Col);
        Assert.Equal(4, Game.Apply(e, PlayerAction.Right).Current.Col);
    }

    [Fact]
    public void LasParedesDetienenElMovimiento()
    {
        var izquierda = Con(Tetromino.T, 0, 5, 0);
        Assert.Equal(izquierda.Current, Game.Apply(izquierda, PlayerAction.Left).Current);
        var derecha = Con(Tetromino.T, 0, 5, 7); // sus casillas llegan a la columna 9
        Assert.Equal(derecha.Current, Game.Apply(derecha, PlayerAction.Right).Current);
    }

    [Fact]
    public void LosBloquesFijadosDetienenElMovimiento()
    {
        var tablero = Board.Empty.Place([new Offset(5, 2)], 1);
        var e = Con(Tetromino.T, 0, 4, 3, tablero); // la T ocupa (5,3): pegada al bloque
        Assert.Equal(e.Current, Game.Apply(e, PlayerAction.Left).Current);
    }

    // ---- Giros y wall kicks SRS ----

    [Fact]
    public void GirarCuatroVecesDejaLaPiezaComoEmpezo()
    {
        var inicial = Con(Tetromino.T, 0, 8, 3);
        var e = inicial;
        for (int i = 1; i <= 4; i++)
        {
            e = Game.Apply(e, PlayerAction.Rotate);
            Assert.Equal(i % 4, e.Current.Rotation);
        }
        Assert.Equal(inicial.Current, e.Current);
    }

    [Fact]
    public void LaONoGira()
    {
        var e = Con(Tetromino.O, 0, 8, 3);
        Assert.Equal(e.Current, Game.Apply(e, PlayerAction.Rotate).Current);
    }

    [Fact]
    public void UnaIVerticalPegadaALaParedSeEmpujaConElKickCorrecto()
    {
        // I vertical con su columna en la 0. Al girar a horizontal necesita las columnas 0 a 3:
        // la prueba (0,0) y la (-1,0) chocan con la pared; la tercera, (+2,0), cabe.
        var e = Game.Apply(Con(Tetromino.I, 1, 5, -2), PlayerAction.Rotate);
        Assert.Equal(2, e.Current.Rotation);
        Assert.Equal(new[] { 0, 1, 2, 3 }, Celdas(e).Select(c => c.Col).Order());
        Assert.All(Celdas(e), c => Assert.Equal(7, c.Row));
    }

    [Fact]
    public void GirarJuntoAlSueloSubeLaPiezaConElKick()
    {
        // La T plana en las filas 18-19 necesitaría la fila 20 al girar: se cumple el kick (x=-1, y=+1).
        var e = Game.Apply(Con(Tetromino.T, 0, 18, 3), PlayerAction.Rotate);
        Assert.Equal(1, e.Current.Rotation);
        Assert.Equal(17, e.Current.Row);
        Assert.Equal(2, e.Current.Col);
        Assert.All(Celdas(e), c => Assert.InRange(c.Row, 0, 19));
    }

    [Fact]
    public void SiNingunKickCabeLaPiezaNoGira()
    {
        var pieza = new Piece(Tetromino.T, 0, 8, 3);
        var libres = pieza.Cells.ToHashSet();
        var ocupadas = Enumerable.Range(0, Board.Height)
            .SelectMany(f => Enumerable.Range(0, Board.Width).Select(c => new Offset(f, c)))
            .Where(c => !libres.Contains(c));
        var e = Game.NewGame(1) with { Current = pieza, Board = Board.Empty.Place(ocupadas, 1) };
        Assert.Equal(pieza, Game.Apply(e, PlayerAction.Rotate).Current);
    }

    // ---- Gravedad y caídas ----

    [Fact]
    public void ElTickBajaLaPiezaUnaFila()
    {
        var e = Con(Tetromino.T, 0, 5, 3);
        Assert.Equal(6, Game.Tick(e).Current.Row);
    }

    [Fact]
    public void ElTickEnElSueloFijaLaPiezaYApareceLaSiguiente()
    {
        var e = Con(Tetromino.T, 0, 18, 3);
        var siguiente = e.Next;
        var despues = Game.Tick(e);
        Assert.NotEqual(0, despues.Board[19, 4]);
        Assert.Equal(siguiente, despues.Current.Type);
        Assert.Equal(Piece.Spawn(siguiente), despues.Current);
        Assert.Equal(GameStatus.Playing, despues.Status);
    }

    [Fact]
    public void LaCaidaSuaveBajaUnaFilaYDaUnPunto()
    {
        var e = Game.Apply(Con(Tetromino.T, 0, 5, 3), PlayerAction.SoftDrop);
        Assert.Equal(6, e.Current.Row);
        Assert.Equal(1, e.Score);
    }

    [Fact]
    public void LaCaidaSuaveEnElSueloNoHaceNadaHastaElSiguienteTick()
    {
        var e = Con(Tetromino.T, 0, 18, 3);
        Assert.Equal(e, Game.Apply(e, PlayerAction.SoftDrop));
    }

    [Fact]
    public void LaCaidaRapidaLlegaAlFondoDaDosPuntosPorFilaYFija()
    {
        var e = Game.Apply(Con(Tetromino.T, 0, 2, 3), PlayerAction.HardDrop); // baja 16 filas: de la fila 2 a la 18
        Assert.Equal(32, e.Score);
        Assert.NotEqual(0, e.Board[19, 4]);
        Assert.NotEqual(0, e.Board[18, 4]);
    }

    // ---- Líneas, puntaje y niveles ----

    // Tablero con `k` filas inferiores llenas salvo la columna 9, y una I vertical lista para caer en ella.
    private static GameState PozoParaLaI(int k, int lineasPrevias = 0)
    {
        var tablero = Enumerable.Range(20 - k, k).Aggregate(Board.Empty, (b, f) => b.Place(BoardTests.Fila(f, 9), 1));
        return Con(Tetromino.I, 1, 10, 7, tablero) with { Lines = lineasPrevias };
    }

    [Theory]
    [InlineData(1, 100)]
    [InlineData(2, 300)]
    [InlineData(3, 500)]
    [InlineData(4, 800)]
    public void LimpiarLineasPuntuaSegunCuantasSeaCompletan(int lineas, int puntos)
    {
        var e = Game.Apply(PozoParaLaI(lineas), PlayerAction.HardDrop);
        Assert.Equal(lineas, e.Lines);
        Assert.Equal(puntos + 2 * 6, e.Score); // más 2 por cada una de las 6 filas de caída
    }

    [Fact]
    public void ElPuntajePorLineasSeMultiplicaPorElNivel()
    {
        var e = Game.Apply(PozoParaLaI(4, lineasPrevias: 10), PlayerAction.HardDrop); // nivel 2
        Assert.Equal(800 * 2 + 12, e.Score);
    }

    [Fact]
    public void CadaDiezLineasSubeElNivelYAcelerala()
    {
        var e = Game.Apply(PozoParaLaI(1, lineasPrevias: 9), PlayerAction.HardDrop);
        Assert.Equal(10, e.Lines);
        Assert.Equal(2, e.Level);
        Assert.True(Game.IntervalMs(e) < Game.IntervalMs(Game.NewGame(1)));
    }

    [Fact]
    public void ElIntervaloDeGravedadEmpiezaEn1000msYTieneUnMinimo()
    {
        Assert.Equal(1000, Game.IntervalMs(Game.NewGame(1)));
        Assert.Equal(60, Game.IntervalMs(Game.NewGame(1) with { Lines = 300 }));
    }

    // ---- Fin de partida ----

    [Fact]
    public void SiLaPiezaNuevaNoCabeAlAparecerTerminaLaPartida()
    {
        // La zona de aparición (filas 0-1, columnas 3-6) está ocupada; la pieza activa se fija en el suelo.
        var bloqueo = Enumerable.Range(0, 2).SelectMany(f => Enumerable.Range(3, 4).Select(c => new Offset(f, c)));
        var e = Con(Tetromino.O, 0, 18, 3, Board.Empty.Place(bloqueo, 1));
        var fin = Game.Tick(e);
        Assert.Equal(GameStatus.GameOver, fin.Status);
        Assert.Equal("top_out", Game.IsOver(fin));
        Assert.Null(Game.IsOver(e));
    }

    [Fact]
    public void TrasTerminarYaNoSeAceptanAccionesNiTicks()
    {
        var fin = Game.Tick(Con(Tetromino.O, 0, 18, 3, Board.Empty.Place([new Offset(0, 4), new Offset(1, 4)], 1)));
        Assert.Equal(GameStatus.GameOver, fin.Status);
        Assert.Equal(fin, Game.Apply(fin, PlayerAction.Left));
        Assert.Equal(fin, Game.Tick(fin));
    }

    // ---- Matriz que se dibuja ----

    [Fact]
    public void LaMatrizIncluyeLaPiezaActivaYSuSombraDeAterrizaje()
    {
        var e = Con(Tetromino.T, 0, 3, 3);
        var matriz = Game.ToMatrix(e);
        var plano = matriz.SelectMany(f => f).ToList();
        Assert.Equal(4, plano.Count(v => v == (int)Tetromino.T));
        Assert.Equal(4, plano.Count(v => v == Game.GhostCode));
        // La sombra queda en las dos filas inferiores.
        Assert.All(Enumerable.Range(0, 18), f => Assert.DoesNotContain(Game.GhostCode, matriz[f]));
        Assert.Contains(Game.GhostCode, matriz[19]);
    }

    [Fact]
    public void LaSombraNoTapaLaPiezaCuandoYaEstaApoyada()
    {
        var e = Con(Tetromino.T, 0, 18, 3);
        var plano = Game.ToMatrix(e).SelectMany(f => f).ToList();
        Assert.Equal(4, plano.Count(v => v == (int)Tetromino.T));
        Assert.Equal(0, plano.Count(v => v == Game.GhostCode));
    }

    [Fact]
    public void LaMatrizSiempreTieneVeinteFilasPorDiezColumnas()
    {
        var e = Game.Apply(Con(Tetromino.I, 0, -1, 3), PlayerAction.Rotate); // pieza asomando por arriba
        var matriz = Game.ToMatrix(e);
        Assert.Equal(20, matriz.Length);
        Assert.All(matriz, f => Assert.Equal(10, f.Length));
    }

    [Fact]
    public void ElGeneradorAleatorioEsPuroYReproducible()
    {
        var rng = Rng.FromSeed(9);
        var (v1, siguiente) = rng.NextInt(100);
        Assert.Equal(v1, rng.NextInt(100).Value);       // el mismo estado da el mismo número
        Assert.NotEqual(rng, siguiente);                // y pedir uno avanza el estado
        Assert.All(Enumerable.Range(0, 200).Select(i => Rng.FromSeed(i).NextInt(7).Value), v => Assert.InRange(v, 0, 6));
    }
}
