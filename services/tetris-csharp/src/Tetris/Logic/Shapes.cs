// Formas de las piezas y sus rotaciones según el Super Rotation System (SRS).
// Cada pieza vive en una caja de 3x3 (4x4 para la I y la O); girar es una transformación de la caja.
using System.Collections.Immutable;

namespace Tetris.Logic;

/// <summary>Desplazamiento o casilla relativa (fila hacia abajo, columna hacia la derecha).</summary>
public readonly record struct Offset(int Row, int Col);

/// <summary>Formas de las piezas en sus cuatro orientaciones (0, R, 2 y L).</summary>
public static class Shapes
{
    // Casillas de cada pieza en su orientación inicial, dentro de su caja.
    private static readonly Dictionary<Tetromino, (int Size, Offset[] Cells)> Spawn = new()
    {
        [Tetromino.I] = (4, [new(1, 0), new(1, 1), new(1, 2), new(1, 3)]),
        [Tetromino.O] = (4, [new(0, 1), new(0, 2), new(1, 1), new(1, 2)]),
        [Tetromino.T] = (3, [new(0, 1), new(1, 0), new(1, 1), new(1, 2)]),
        [Tetromino.S] = (3, [new(0, 1), new(0, 2), new(1, 0), new(1, 1)]),
        [Tetromino.Z] = (3, [new(0, 0), new(0, 1), new(1, 1), new(1, 2)]),
        [Tetromino.J] = (3, [new(0, 0), new(1, 0), new(1, 1), new(1, 2)]),
        [Tetromino.L] = (3, [new(0, 2), new(1, 0), new(1, 1), new(1, 2)]),
    };

    // Las cuatro orientaciones de cada pieza, calculadas girando la inicial 90° en sentido horario.
    private static readonly Dictionary<Tetromino, ImmutableArray<Offset>[]> Rotations =
        Spawn.Keys.ToDictionary(tipo => tipo, BuildRotations);

    // Calcula las orientaciones 0, R, 2 y L de una pieza a partir de la inicial.
    private static ImmutableArray<Offset>[] BuildRotations(Tetromino type)
    {
        var (size, cells) = Spawn[type];
        var result = new ImmutableArray<Offset>[4];
        result[0] = [.. cells];
        for (int i = 1; i < 4; i++)
        {
            result[i] = RotateClockwise(result[i - 1], size);
        }
        return result;
    }

    /// <summary>Casillas de la pieza en la orientación dada (0 a 3), relativas a la esquina de su caja.</summary>
    public static ImmutableArray<Offset> Cells(Tetromino type, int rotation) =>
        // La O es un cuadrado: girarla no cambia nada.
        Rotations[type][type == Tetromino.O ? 0 : ((rotation % 4) + 4) % 4];

    /// <summary>Fila de la casilla más alta de la orientación inicial (para hacer aparecer la pieza pegada al borde superior).</summary>
    public static int TopRow(Tetromino type) => Spawn[type].Cells.Min(c => c.Row);

    // Gira un conjunto de casillas 90° en sentido horario dentro de una caja de n x n: (fila, col) -> (col, n-1-fila).
    private static ImmutableArray<Offset> RotateClockwise(ImmutableArray<Offset> cells, int n) =>
        [.. cells.Select(c => new Offset(c.Col, n - 1 - c.Row))];
}
