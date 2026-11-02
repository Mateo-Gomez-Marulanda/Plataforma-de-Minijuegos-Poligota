// Decide cada cuánto cae la pieza. Es una interfaz para poder acelerar el juego en las pruebas.
using Tetris.Logic;

namespace Tetris.Server;

/// <summary>Intervalo de gravedad de una partida.</summary>
public interface ITickPolicy
{
    TimeSpan Interval(GameState game);
}

/// <summary>Política real: el intervalo depende del nivel (se acelera al subir).</summary>
public sealed class LevelTickPolicy : ITickPolicy
{
    public TimeSpan Interval(GameState game) => TimeSpan.FromMilliseconds(Game.IntervalMs(game));
}
