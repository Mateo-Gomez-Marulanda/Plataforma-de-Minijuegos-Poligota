// Tablero de 10 columnas por 20 filas con las casillas ya fijadas. Es inmutable: cada cambio devuelve un tablero nuevo.
using System.Collections.Immutable;

namespace Tetris.Logic;

/// <summary>Casillas fijadas del tablero (0 = vacía, 1 a 7 = pieza que la ocupa).</summary>
public sealed class Board
{
    public const int Width = 10;
    public const int Height = 20;

    private readonly byte[] _cells;

    private Board(byte[] cells) => _cells = cells;

    /// <summary>Tablero vacío.</summary>
    public static Board Empty { get; } = new(new byte[Width * Height]);

    /// <summary>Valor de una casilla dentro del tablero.</summary>
    public byte this[int row, int col] => _cells[row * Width + col];

    /// <summary>
    /// Indica si una casilla está libre. Fuera por los lados o por abajo no lo está;
    /// por encima del tablero sí (las piezas pueden asomar al aparecer o al girar).
    /// </summary>
    public bool IsFree(int row, int col) =>
        col is >= 0 and < Width && row < Height && (row < 0 || _cells[row * Width + col] == 0);

    /// <summary>Devuelve un tablero con las casillas dadas fijadas con `value`; ignora las que estén por encima del tablero.</summary>
    public Board Place(IEnumerable<Offset> cells, byte value)
    {
        var copia = (byte[])_cells.Clone();
        foreach (var c in cells.Where(c => c.Row >= 0))
        {
            copia[c.Row * Width + c.Col] = value;
        }
        return new Board(copia);
    }

    /// <summary>Elimina las filas completas y baja lo que había encima. Devuelve el tablero nuevo y cuántas filas se limpiaron.</summary>
    public (Board Board, int Cleared) ClearLines()
    {
        var restantes = Enumerable.Range(0, Height)
            .Where(f => Enumerable.Range(0, Width).Any(c => _cells[f * Width + c] == 0))
            .ToList();
        int limpiadas = Height - restantes.Count;
        if (limpiadas == 0)
        {
            return (this, 0);
        }

        var nuevas = new byte[Width * Height];
        // Las filas que sobreviven se apilan abajo, conservando su orden.
        for (int i = 0; i < restantes.Count; i++)
        {
            Array.Copy(_cells, restantes[i] * Width, nuevas, (limpiadas + i) * Width, Width);
        }
        return (new Board(nuevas), limpiadas);
    }

    /// <summary>Copia del tablero como matriz de enteros [fila][columna].</summary>
    public int[][] ToMatrix() =>
        [.. Enumerable.Range(0, Height).Select(f => Enumerable.Range(0, Width).Select(c => (int)_cells[f * Width + c]).ToArray())];
}
