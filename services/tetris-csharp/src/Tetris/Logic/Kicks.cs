// Tablas de "wall kicks" del SRS: desplazamientos que se prueban, en orden, al girar una pieza
// cuando la posición girada choca con una pared, el suelo o bloques fijados.
namespace Tetris.Logic;

/// <summary>Desplazamientos del SRS para girar en sentido horario.</summary>
public static class Kicks
{
    // Las tablas oficiales usan (x derecha, y ARRIBA); aquí se convierten a (fila abajo, columna).
    private static Offset[] Tabla(params (int X, int Y)[] pruebas) =>
        [.. pruebas.Select(p => new Offset(-p.Y, p.X))];

    // Para J, L, S, T y Z. Índice = orientación de partida (0, R, 2, L).
    private static readonly Offset[][] JLSTZ =
    [
        Tabla((0, 0), (-1, 0), (-1, 1), (0, -2), (-1, -2)), // 0 -> R
        Tabla((0, 0), (1, 0), (1, -1), (0, 2), (1, 2)),     // R -> 2
        Tabla((0, 0), (1, 0), (1, 1), (0, -2), (1, -2)),    // 2 -> L
        Tabla((0, 0), (-1, 0), (-1, -1), (0, 2), (-1, 2)),  // L -> 0
    ];

    // Para la I, que usa sus propios desplazamientos.
    private static readonly Offset[][] I =
    [
        Tabla((0, 0), (-2, 0), (1, 0), (-2, -1), (1, 2)),   // 0 -> R
        Tabla((0, 0), (-1, 0), (2, 0), (-1, 2), (2, -1)),   // R -> 2
        Tabla((0, 0), (2, 0), (-1, 0), (2, 1), (-1, -2)),   // 2 -> L
        Tabla((0, 0), (1, 0), (-2, 0), (1, -2), (-2, 1)),   // L -> 0
    ];

    /// <summary>Desplazamientos a probar, en orden, al girar en sentido horario desde la orientación `from`. La O no tiene.</summary>
    public static IReadOnlyList<Offset> For(Tetromino type, int from) => type switch
    {
        Tetromino.O => [new Offset(0, 0)],
        Tetromino.I => I[from % 4],
        _ => JLSTZ[from % 4],
    };
}
