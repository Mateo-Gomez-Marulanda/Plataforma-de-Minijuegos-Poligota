// Conexión WebSocket de un jugador: lee mensajes del socket y los mete en una cola; una GameSession
// los procesa en orden y es la única que escribe en el socket (un WebSocket no admite envíos concurrentes).
using System.Net.WebSockets;
using System.Text;
using System.Threading.Channels;

namespace Tetris.Server;

/// <summary>Pegamento entre un WebSocket y una GameSession.</summary>
public static class TetrisSocket
{
    /// <summary>Atiende la conexión hasta que el cliente se va o el servidor se detiene.</summary>
    public static async Task HandleAsync(WebSocket socket, ITickPolicy policy, CancellationToken stopping)
    {
        var inbox = Channel.CreateUnbounded<ClientMessage>(new UnboundedChannelOptions { SingleReader = true, SingleWriter = true });
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(stopping);
        var lectura = ReadLoopAsync(socket, inbox.Writer, cts.Token);
        var session = new GameSession(
            (json, ct) => socket.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, ct),
            policy);

        try
        {
            await session.RunAsync(inbox.Reader, cts.Token);
        }
        catch (Exception e) when (e is WebSocketException or OperationCanceledException)
        {
            // La conexión se cerró de golpe: no hay nada más que hacer.
        }
        finally
        {
            await cts.CancelAsync();
            await lectura;
            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                try
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                }
                catch (WebSocketException)
                {
                    // El cliente ya se había ido.
                }
            }
        }
    }

    // Lee mensajes de texto del socket y los encola; al terminar cierra la cola.
    private static async Task ReadLoopAsync(WebSocket socket, ChannelWriter<ClientMessage> inbox, CancellationToken ct)
    {
        var buffer = new byte[4096];
        try
        {
            while (!ct.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                using var mensaje = new MemoryStream();
                WebSocketReceiveResult resultado;
                do
                {
                    resultado = await socket.ReceiveAsync(buffer, ct);
                    if (resultado.MessageType == WebSocketMessageType.Close)
                    {
                        return;
                    }
                    mensaje.Write(buffer, 0, resultado.Count);
                }
                while (!resultado.EndOfMessage);

                inbox.TryWrite(resultado.MessageType == WebSocketMessageType.Text
                    ? MessageParser.Parse(Encoding.UTF8.GetString(mensaje.ToArray()))
                    : new ProtocolError("INVALID_JSON", "Solo se aceptan mensajes de texto"));
            }
        }
        catch (Exception e) when (e is WebSocketException or OperationCanceledException)
        {
            // Desconexión abrupta o cancelación: se cierra la cola igual.
        }
        finally
        {
            inbox.TryComplete();
        }
    }
}
