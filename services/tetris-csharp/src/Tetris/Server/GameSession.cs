// Sesión de una partida: procesa, UNO A UNO y en un solo bucle, los mensajes del jugador y los ticks de gravedad.
// Como solo este bucle toca el estado y envía mensajes, no hay condiciones de carrera entre el reloj y las teclas.
// El reloj no es un hilo aparte: es el tiempo de espera de la lectura de la cola (si vence, toca un tick).
using System.Threading.Channels;
using Tetris.Logic;

namespace Tetris.Server;

/// <summary>Una partida en curso asociada a una conexión.</summary>
public sealed class GameSession(Func<string, CancellationToken, Task> send, ITickPolicy policy)
{
    private GameState? _game;      // null = sin partida (antes de `start` o tras terminar)
    private int _tick;
    private bool _paused;
    private long _nextTickAt;      // instante (ms) del siguiente tick de gravedad

    /// <summary>Bucle principal: termina cuando se cancela o cuando la cola se cierra (el cliente se desconectó).</summary>
    public async Task RunAsync(ChannelReader<ClientMessage> inbox, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            using var espera = CancellationTokenSource.CreateLinkedTokenSource(ct);
            espera.CancelAfter(TimeUntilNextTick());
            ClientMessage message;
            try
            {
                message = await inbox.ReadAsync(espera.Token);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                await TickAsync(ct); // venció el reloj de gravedad
                continue;
            }
            catch (ChannelClosedException)
            {
                return;
            }
            await HandleAsync(message, ct);
        }
    }

    // Tiempo hasta el siguiente tick; sin partida o en pausa, espera indefinidamente.
    private TimeSpan TimeUntilNextTick() =>
        _game is null || _paused
            ? Timeout.InfiniteTimeSpan
            : TimeSpan.FromMilliseconds(Math.Max(0, _nextTickAt - Environment.TickCount64));

    // Programa el siguiente tick a partir de ahora.
    private void ScheduleTick() => _nextTickAt = Environment.TickCount64 + (long)policy.Interval(_game!).TotalMilliseconds;

    // Ejecuta un tick de gravedad y avisa al cliente.
    private async Task TickAsync(CancellationToken ct)
    {
        _game = Game.Tick(_game!);
        _tick++;
        ScheduleTick();
        await PublishAsync(ct);
    }

    // Atiende un mensaje del cliente.
    private async Task HandleAsync(ClientMessage message, CancellationToken ct)
    {
        switch (message)
        {
            case ProtocolError e:
                await send(MessageWriter.Error(e.Code, e.Text), ct);
                break;
            case StartMessage s:
                _game = Game.NewGame(s.Seed ?? Random.Shared.Next());
                _tick = 0;
                _paused = false;
                ScheduleTick();
                await PublishAsync(ct);
                break;
            case var _ when _game is null:
                await send(MessageWriter.Error("NOT_STARTED", "Envía primero un mensaje start"), ct);
                break;
            case InputMessage i when !_paused:
                _game = Game.Apply(_game!, i.Action);
                if (i.Action == PlayerAction.HardDrop)
                {
                    ScheduleTick(); // la pieza nueva tiene el intervalo completo
                }
                await PublishAsync(ct);
                break;
            case PauseMessage when !_paused:
                _paused = true;
                await PublishAsync(ct);
                break;
            case ResumeMessage when _paused:
                _paused = false;
                ScheduleTick();
                await PublishAsync(ct);
                break;
        }
    }

    // Envía el estado actual o, si la partida terminó, `game_over` (y deja la sesión sin partida).
    private async Task PublishAsync(CancellationToken ct)
    {
        var game = _game!;
        if (Game.IsOver(game) is not null)
        {
            _game = null;
            await send(MessageWriter.GameOver(_tick, game), ct);
        }
        else
        {
            await send(MessageWriter.State(_tick, game, _paused, (int)policy.Interval(game).TotalMilliseconds), ct);
        }
    }
}
