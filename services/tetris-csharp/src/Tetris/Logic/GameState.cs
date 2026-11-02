// Estado completo de una partida de Tetris, como un valor inmutable.
using System.Collections.Immutable;

namespace Tetris.Logic;

/// <summary>Acciones que puede pedir el jugador (las teclas del contrato).</summary>
public enum PlayerAction { Left, Right, Rotate, SoftDrop, HardDrop }

/// <summary>Fase de la partida.</summary>
public enum GameStatus { Playing, GameOver }

/// <summary>
/// Partida en un instante: tablero fijado, pieza activa, piezas por venir, generador aleatorio y puntuación.
/// Las funciones de <see cref="Game"/> reciben un estado y devuelven otro; este nunca se modifica.
/// </summary>
public sealed record GameState(
    Board Board,
    Piece Current,
    ImmutableList<Tetromino> Upcoming,
    Rng Rng,
    int Score,
    int Lines,
    GameStatus Status)
{
    /// <summary>Nivel actual: sube uno cada 10 líneas.</summary>
    public int Level => 1 + Lines / 10;

    /// <summary>Pieza siguiente (la que se ve en la vista previa).</summary>
    public Tetromino Next => Upcoming[0];
}
