// La pieza que está cayendo: su tipo, su orientación y la posición de la esquina superior izquierda de su caja.
namespace Tetris.Logic;

/// <summary>Pieza activa. Es inmutable: mover o girar crea otra con `with`.</summary>
public sealed record Piece(Tetromino Type, int Rotation, int Row, int Col)
{
    /// <summary>Casillas que ocupa la pieza en el tablero, en coordenadas absolutas.</summary>
    public IEnumerable<Offset> Cells =>
        Shapes.Cells(Type, Rotation).Select(o => new Offset(Row + o.Row, Col + o.Col));

    /// <summary>La misma pieza desplazada.</summary>
    public Piece Moved(int dRow, int dCol) => this with { Row = Row + dRow, Col = Col + dCol };

    /// <summary>Pieza recién aparecida: centrada arriba y con su casilla más alta en la fila 0.</summary>
    public static Piece Spawn(Tetromino type) => new(type, 0, -Shapes.TopRow(type), 3);
}
