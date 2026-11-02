// Traducción entre el JSON del contrato WebSocket (sección 4.2 del diseño) y tipos de C#.
// Es el único lugar que conoce el formato de los mensajes; la lógica nunca ve JSON.
using System.Text.Json;
using Tetris.Logic;

namespace Tetris.Server;

/// <summary>Mensaje que llega del cliente, ya interpretado.</summary>
public abstract record ClientMessage;

/// <summary>Empezar (o reiniciar) una partida. `Seed` fija el orden de las piezas (para pruebas).</summary>
public sealed record StartMessage(int? Seed) : ClientMessage;

/// <summary>Una tecla del jugador.</summary>
public sealed record InputMessage(PlayerAction Action) : ClientMessage;

public sealed record PauseMessage : ClientMessage;

public sealed record ResumeMessage : ClientMessage;

/// <summary>Mensaje inválido: se responde con un `error` sin tocar la partida.</summary>
public sealed record ProtocolError(string Code, string Text) : ClientMessage;

/// <summary>Interpreta los mensajes del cliente.</summary>
public static class MessageParser
{
    // Tecla del contrato -> acción de la lógica.
    private static readonly Dictionary<string, PlayerAction> Keys = new()
    {
        ["left"] = PlayerAction.Left,
        ["right"] = PlayerAction.Right,
        ["rotate"] = PlayerAction.Rotate,
        ["soft_drop"] = PlayerAction.SoftDrop,
        ["hard_drop"] = PlayerAction.HardDrop,
    };

    /// <summary>Convierte el texto recibido en un mensaje; nunca lanza: los fallos son ProtocolError.</summary>
    public static ClientMessage Parse(string text)
    {
        try
        {
            using var doc = JsonDocument.Parse(text);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("type", out var type))
            {
                return new ProtocolError("UNKNOWN_TYPE", "Falta el campo 'type'");
            }
            return type.GetString() switch
            {
                "start" => new StartMessage(ReadSeed(root)),
                "pause" => new PauseMessage(),
                "resume" => new ResumeMessage(),
                "input" => ParseInput(root),
                var other => new ProtocolError("UNKNOWN_TYPE", $"Tipo de mensaje desconocido: {other}"),
            };
        }
        catch (JsonException)
        {
            return new ProtocolError("INVALID_JSON", "El mensaje no es JSON válido");
        }
    }

    // Lee la tecla de un mensaje `input`.
    private static ClientMessage ParseInput(JsonElement root) =>
        root.TryGetProperty("key", out var key) && key.ValueKind == JsonValueKind.String && Keys.TryGetValue(key.GetString()!, out var action)
            ? new InputMessage(action)
            : new ProtocolError("UNKNOWN_KEY", "Tecla no reconocida");

    // Lee options.seed si viene y es un entero.
    private static int? ReadSeed(JsonElement root) =>
        root.TryGetProperty("options", out var options) && options.ValueKind == JsonValueKind.Object
            && options.TryGetProperty("seed", out var seed) && seed.TryGetInt32(out var value)
            ? value
            : null;
}

/// <summary>Construye los mensajes del servidor como texto JSON (propiedades en snake_case).</summary>
public static class MessageWriter
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    private sealed record StateMessage(string Type, int Tick, string Status, int[][] Board, StateData Data);

    private sealed record StateData(int Score, int Level, int Lines, string Next, bool Paused, int IntervalMs);

    private sealed record GameOverMessage(string Type, GameOverData Data);

    private sealed record GameOverData(int Score, int Level, int Lines, string Reason, int Tick);

    private sealed record ErrorMessage(string Type, string Error, string Message);

    /// <summary>Mensaje `state`: tablero y datos de la partida.</summary>
    public static string State(int tick, GameState game, bool paused, int intervalMs) =>
        JsonSerializer.Serialize(
            new StateMessage("state", tick, "playing", Game.ToMatrix(game),
                new StateData(game.Score, game.Level, game.Lines, game.Next.ToString(), paused, intervalMs)),
            Options);

    /// <summary>Mensaje `game_over` con el resultado final.</summary>
    public static string GameOver(int tick, GameState game) =>
        JsonSerializer.Serialize(
            new GameOverMessage("game_over", new GameOverData(game.Score, game.Level, game.Lines, Game.IsOver(game) ?? "top_out", tick)),
            Options);

    /// <summary>Mensaje `error` con código y texto.</summary>
    public static string Error(string code, string text) =>
        JsonSerializer.Serialize(new ErrorMessage("error", code, text), Options);
}
