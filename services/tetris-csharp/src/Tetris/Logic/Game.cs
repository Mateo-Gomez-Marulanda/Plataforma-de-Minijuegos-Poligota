// Reglas del Tetris como funciones puras: aparición de piezas, movimiento, giro con wall kicks SRS,
// gravedad, caída rápida, limpieza de líneas, puntaje y niveles. No conoce red, JSON ni temporizadores.
// Interfaz del diseño: NewGame (nuevo_juego), Apply (aplicar_accion), Tick (tick) y IsOver (terminado).
using System.Collections.Immutable;

namespace Tetris.Logic;

/// <summary>Reglas del juego. Todas las operaciones devuelven un estado nuevo.</summary>
public static class Game
{
    // Puntos por 1, 2, 3 y 4 líneas a la vez (se multiplican por el nivel).
    private static readonly int[] PuntosPorLineas = [0, 100, 300, 500, 800];

    /// <summary>Partida nueva. Con la misma semilla las piezas salen en el mismo orden.</summary>
    public static GameState NewGame(int seed)
    {
        var (bolsa1, rng) = SevenBag.Generate(Rng.FromSeed(seed));
        var (bolsa2, rng2) = SevenBag.Generate(rng);
        var inicial = new GameState(Board.Empty, Piece.Spawn(Tetromino.I), bolsa1.AddRange(bolsa2), rng2, 0, 0, GameStatus.Playing);
        return SpawnNext(inicial);
    }

    /// <summary>Aplica una acción del jugador. Si la partida terminó, no cambia nada.</summary>
    public static GameState Apply(GameState state, PlayerAction action)
    {
        if (state.Status == GameStatus.GameOver)
        {
            return state;
        }
        var limpio = state with { LastCleared = 0 }; // la limpieza de líneas solo cuenta en la acción que la provoca
        return action switch
        {
            PlayerAction.Left => Shift(limpio, 0, -1),
            PlayerAction.Right => Shift(limpio, 0, 1),
            PlayerAction.Rotate => Rotate(limpio),
            PlayerAction.SoftDrop => SoftDrop(limpio),
            PlayerAction.HardDrop => HardDrop(limpio),
            _ => limpio,
        };
    }

    /// <summary>Gravedad: la pieza baja una fila; si no puede, se fija y aparece la siguiente.</summary>
    public static GameState Tick(GameState state)
    {
        if (state.Status == GameStatus.GameOver)
        {
            return state;
        }
        var limpio = state with { LastCleared = 0 };
        var abajo = limpio.Current.Moved(1, 0);
        return Fits(limpio.Board, abajo) ? limpio with { Current = abajo } : Lock(limpio);
    }

    /// <summary>Indica si la partida terminó: devuelve el motivo ("top_out") o null si sigue.</summary>
    public static string? IsOver(GameState state) => state.Status == GameStatus.GameOver ? "top_out" : null;

    /// <summary>Milisegundos entre ticks de gravedad según el nivel (fórmula de la guía oficial, con un mínimo de 60 ms).</summary>
    public static int IntervalMs(GameState state)
    {
        int nivel = state.Level;
        double segundos = Math.Pow(0.8 - (nivel - 1) * 0.007, nivel - 1);
        return (int)Math.Max(60, segundos * 1000);
    }

    /// <summary>
    /// Matriz que se dibuja: casillas fijadas, la pieza activa (1 a 7) y su sombra de aterrizaje (8) en las casillas libres.
    /// </summary>
    public static int[][] ToMatrix(GameState state)
    {
        var matriz = state.Board.ToMatrix();
        if (state.Status == GameStatus.Playing)
        {
            Paint(matriz, Landing(state.Board, state.Current).Cells, GhostCode, soloVacias: true);
        }
        Paint(matriz, state.Current.Cells, (int)state.Current.Type, soloVacias: false);
        return matriz;
    }

    /// <summary>Código de la sombra de aterrizaje en la matriz del tablero.</summary>
    public const int GhostCode = 8;

    // Dibuja casillas en la matriz, ignorando las que quedan fuera del tablero.
    private static void Paint(int[][] matriz, IEnumerable<Offset> casillas, int valor, bool soloVacias)
    {
        foreach (var c in casillas.Where(c => c.Row is >= 0 and < Board.Height && c.Col is >= 0 and < Board.Width))
        {
            if (!soloVacias || matriz[c.Row][c.Col] == 0)
            {
                matriz[c.Row][c.Col] = valor;
            }
        }
    }

    // Indica si la pieza cabe en el tablero (dentro de los límites y sin pisar casillas fijadas).
    private static bool Fits(Board board, Piece piece) => piece.Cells.All(c => board.IsFree(c.Row, c.Col));

    // Mueve la pieza de lado si cabe.
    private static GameState Shift(GameState state, int dRow, int dCol)
    {
        var movida = state.Current.Moved(dRow, dCol);
        return Fits(state.Board, movida) ? state with { Current = movida } : state;
    }

    // Caída suave: baja una fila y da 1 punto; si no puede bajar no hace nada (se fijará en el siguiente tick).
    private static GameState SoftDrop(GameState state)
    {
        var abajo = state.Current.Moved(1, 0);
        return Fits(state.Board, abajo) ? state with { Current = abajo, Score = state.Score + 1 } : state;
    }

    // Caída rápida: la pieza llega al fondo de golpe (2 puntos por fila) y se fija.
    private static GameState HardDrop(GameState state)
    {
        var aterrizada = Landing(state.Board, state.Current);
        int filas = aterrizada.Row - state.Current.Row;
        return Lock(state with { Current = aterrizada, Score = state.Score + 2 * filas });
    }

    // Gira en sentido horario probando los wall kicks del SRS en orden; si ninguno cabe, no gira.
    private static GameState Rotate(GameState state)
    {
        var pieza = state.Current;
        if (pieza.Type == Tetromino.O)
        {
            return state;
        }
        int destino = (pieza.Rotation + 1) % 4;
        var girada = Kicks.For(pieza.Type, pieza.Rotation)
            .Select(k => pieza with { Rotation = destino, Row = pieza.Row + k.Row, Col = pieza.Col + k.Col })
            .FirstOrDefault(candidata => Fits(state.Board, candidata));
        return girada is null ? state : state with { Current = girada };
    }

    // Posición donde aterrizaría la pieza si cayera en vertical.
    private static Piece Landing(Board board, Piece piece)
    {
        while (Fits(board, piece.Moved(1, 0)))
        {
            piece = piece.Moved(1, 0);
        }
        return piece;
    }

    // Fija la pieza activa, limpia líneas, suma puntos, sube de nivel y hace aparecer la siguiente.
    private static GameState Lock(GameState state)
    {
        var (tablero, limpiadas) = state.Board.Place(state.Current.Cells, (byte)state.Current.Type).ClearLines();
        int puntos = PuntosPorLineas[limpiadas] * state.Level;
        return SpawnNext(state with { Board = tablero, Score = state.Score + puntos, Lines = state.Lines + limpiadas, LastCleared = limpiadas });
    }

    // Toma la siguiente pieza de la cola (rellenándola con otra bolsa si hace falta). Si no cabe al aparecer, fin de la partida.
    private static GameState SpawnNext(GameState state)
    {
        var tipo = state.Upcoming[0];
        var resto = state.Upcoming.RemoveAt(0);
        var rng = state.Rng;
        if (resto.Count < 7)
        {
            var (bolsa, siguienteRng) = SevenBag.Generate(rng);
            resto = resto.AddRange(bolsa);
            rng = siguienteRng;
        }
        var pieza = Piece.Spawn(tipo);
        return state with
        {
            Current = pieza,
            Upcoming = resto,
            Rng = rng,
            Status = Fits(state.Board, pieza) ? GameStatus.Playing : GameStatus.GameOver,
        };
    }
}
