// Arranque del servicio Tetris: servidor ASP.NET Core con /ws (WebSocket del juego) y /health.
// El gateway reenvía /ws/tetris a /ws de este servicio. El puerto sale de la variable PORT (8004 por defecto).
using Tetris.Server;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<ITickPolicy, LevelTickPolicy>();
builder.WebHost.UseUrls($"http://0.0.0.0:{Environment.GetEnvironmentVariable("PORT") ?? "8004"}");

var app = builder.Build();
app.UseWebSockets();

// Comprobación de que el servicio está vivo.
app.MapGet("/health", () => Results.Json(new { status = "ok" }));

// Convierte la petición en una conexión WebSocket y la entrega a TetrisSocket.
app.Map("/ws", async (HttpContext http, ITickPolicy policy, IHostApplicationLifetime lifetime) =>
{
    if (!http.WebSockets.IsWebSocketRequest)
    {
        http.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }
    using var socket = await http.WebSockets.AcceptWebSocketAsync();
    await TetrisSocket.HandleAsync(socket, policy, lifetime.ApplicationStopping);
});

app.Run();

// Necesario para que las pruebas de integración (WebApplicationFactory) vean el Program generado.
public partial class Program;
