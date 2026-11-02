// Pruebas de integración del contrato WebSocket: se levanta el servidor real en memoria (con la gravedad acelerada)
// y se juega con un cliente WebSocket. Cubren inicio, ticks, teclas, pausa, fin de partida, errores y orden de mensajes.
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Tetris.Logic;
using Tetris.Server;
using Xunit;

namespace Tetris.Tests;

/// <summary>Gravedad acelerada (20 ms) para que las pruebas no tarden segundos.</summary>
public sealed class FastTickPolicy : ITickPolicy
{
    public TimeSpan Interval(GameState game) => TimeSpan.FromMilliseconds(20);
}

public class WebSocketTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public WebSocketTests(WebApplicationFactory<Program> factory) =>
        _factory = factory.WithWebHostBuilder(b => b.ConfigureServices(s =>
        {
            s.RemoveAll<ITickPolicy>();
            s.AddSingleton<ITickPolicy, FastTickPolicy>();
        }));

    // Cliente de prueba: envía JSON y recibe mensajes con tiempo límite.
    private sealed class Cliente(WebSocket socket)
    {
        public async Task Enviar(string json) =>
            await socket.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, CancellationToken.None);

        // Siguiente mensaje del servidor, o null si no llega ninguno en `espera`.
        public async Task<JsonElement?> Recibir(int espera = 3000)
        {
            using var cts = new CancellationTokenSource(espera);
            var buffer = new byte[16384];
            using var ms = new MemoryStream();
            try
            {
                WebSocketReceiveResult r;
                do
                {
                    r = await socket.ReceiveAsync(buffer, cts.Token);
                    ms.Write(buffer, 0, r.Count);
                }
                while (!r.EndOfMessage);
            }
            catch (OperationCanceledException)
            {
                return null;
            }
            return JsonDocument.Parse(ms.ToArray()).RootElement.Clone();
        }

        // Recibe mensajes hasta que uno cumpla la condición (con un máximo para no colgarse).
        public async Task<JsonElement> RecibirHasta(Func<JsonElement, bool> condicion, int maximo = 400)
        {
            for (int i = 0; i < maximo; i++)
            {
                var m = await Recibir() ?? throw new TimeoutException("El servidor dejó de enviar mensajes");
                if (condicion(m))
                {
                    return m;
                }
            }
            throw new TimeoutException("No llegó el mensaje esperado");
        }
    }

    // Abre una conexión nueva contra el servidor en memoria.
    private async Task<Cliente> Conectar()
    {
        var socket = await _factory.Server.CreateWebSocketClient().ConnectAsync(new Uri("ws://localhost/ws"), CancellationToken.None);
        return new Cliente(socket);
    }

    private static string Tipo(JsonElement m) => m.GetProperty("type").GetString()!;

    // Casillas de la pieza activa (valores 1 a 7; la sombra vale 8).
    private static List<(int Fila, int Col)> Activa(JsonElement estado) =>
        estado.GetProperty("board").EnumerateArray().SelectMany((fila, f) =>
            fila.EnumerateArray().Select((v, c) => (v.GetInt32(), f, c))).Where(t => t.Item1 is >= 1 and <= 7).Select(t => (t.f, t.c)).ToList();

    [Fact]
    public async Task StartDevuelveElEstadoInicialDelContrato()
    {
        var c = await Conectar();
        await c.Enviar("""{"type":"start","options":{"seed":1}}""");
        var m = (await c.Recibir())!.Value;
        Assert.Equal("state", Tipo(m));
        Assert.Equal(0, m.GetProperty("tick").GetInt32());
        Assert.Equal("playing", m.GetProperty("status").GetString());
        Assert.Equal(20, m.GetProperty("board").GetArrayLength());
        Assert.Equal(4, Activa(m).Count);
        Assert.False(m.GetProperty("data").GetProperty("paused").GetBoolean());
    }

    [Fact]
    public async Task LaGravedadHaceCaerLaPiezaTickAfterTick()
    {
        var c = await Conectar();
        await c.Enviar("""{"type":"start","options":{"seed":1}}""");
        var inicial = Activa((await c.Recibir())!.Value).Min(p => p.Fila);
        var tick3 = await c.RecibirHasta(m => Tipo(m) == "state" && m.GetProperty("tick").GetInt32() == 3);
        Assert.Equal(inicial + 3, Activa(tick3).Min(p => p.Fila));
    }

    [Fact]
    public async Task LasTeclasMuevenLaPiezaDeInmediato()
    {
        var c = await Conectar();
        await c.Enviar("""{"type":"start","options":{"seed":1}}""");
        var antes = Activa((await c.Recibir())!.Value).Min(p => p.Col);
        await c.Enviar("""{"type":"input","key":"left"}""");
        var movida = await c.RecibirHasta(m => Tipo(m) == "state" && Activa(m).Min(p => p.Col) == antes - 1);
        Assert.Equal("playing", movida.GetProperty("status").GetString());
    }

    [Fact]
    public async Task LaCaidaRapidaFijaLaPiezaSumaPuntosYApareceOtra()
    {
        var c = await Conectar();
        await c.Enviar("""{"type":"start","options":{"seed":1}}""");
        await c.Recibir();
        await c.Enviar("""{"type":"input","key":"hard_drop"}""");
        var m = await c.RecibirHasta(m => Tipo(m) == "state" && m.GetProperty("data").GetProperty("score").GetInt32() > 0);
        var ultimaFila = m.GetProperty("board")[19].EnumerateArray().Select(v => v.GetInt32());
        Assert.Contains(ultimaFila, v => v is >= 1 and <= 7); // la pieza fijada en el suelo
        Assert.Equal(8, Activa(m).Count);                      // 4 casillas fijadas + 4 de la pieza nueva
    }

    [Fact]
    public async Task LaPausaDetieneElRelojYReanudarLoRetoma()
    {
        var c = await Conectar();
        await c.Enviar("""{"type":"start","options":{"seed":1}}""");
        await c.Recibir();
        await c.Enviar("""{"type":"pause"}""");
        await c.RecibirHasta(m => Tipo(m) == "state" && m.GetProperty("data").GetProperty("paused").GetBoolean());
        Assert.Null(await c.Recibir(400)); // en pausa no llegan ticks
        await c.Enviar("""{"type":"input","key":"left"}"""); // y las teclas se ignoran
        Assert.Null(await c.Recibir(300));
        await c.Enviar("""{"type":"resume"}""");
        var m = await c.RecibirHasta(m => Tipo(m) == "state");
        Assert.False(m.GetProperty("data").GetProperty("paused").GetBoolean());
        Assert.NotNull(await c.Recibir()); // el reloj sigue
    }

    [Fact]
    public async Task ApilarPiezasHastaArribaTerminaConGameOver()
    {
        var c = await Conectar();
        await c.Enviar("""{"type":"start","options":{"seed":1}}""");
        await c.Recibir();
        JsonElement? fin = null;
        for (int i = 0; i < 60 && fin is null; i++)
        {
            await c.Enviar("""{"type":"input","key":"hard_drop"}""");
            var m = await c.RecibirHasta(m => Tipo(m) is "state" or "game_over");
            fin = Tipo(m) == "game_over" ? m : null;
        }
        Assert.NotNull(fin);
        var datos = fin!.Value.GetProperty("data");
        Assert.Equal("top_out", datos.GetProperty("reason").GetString());
        Assert.True(datos.GetProperty("score").GetInt32() > 0);

        // Tras terminar no hay partida: las teclas piden empezar otra.
        await c.Enviar("""{"type":"input","key":"left"}""");
        var error = await c.RecibirHasta(m => Tipo(m) == "error");
        Assert.Equal("NOT_STARTED", error.GetProperty("error").GetString());
    }

    [Fact]
    public async Task SePuedeReiniciarLaPartidaConUnNuevoStart()
    {
        var c = await Conectar();
        await c.Enviar("""{"type":"start","options":{"seed":1}}""");
        await c.RecibirHasta(m => m.GetProperty("tick").GetInt32() >= 3);
        await c.Enviar("""{"type":"start","options":{"seed":2}}""");
        await c.RecibirHasta(m => Tipo(m) == "state" && m.GetProperty("tick").GetInt32() == 0);
    }

    [Fact]
    public async Task LosErroresDelContratoSeResponden()
    {
        var c = await Conectar();
        await c.Enviar("""{"type":"input","key":"left"}""");
        Assert.Equal("NOT_STARTED", (await c.Recibir())!.Value.GetProperty("error").GetString());
        await c.Enviar("""{"type":"pause"}""");
        Assert.Equal("NOT_STARTED", (await c.Recibir())!.Value.GetProperty("error").GetString());
        await c.Enviar("""{"type":"start","options":{"seed":1}}""");
        await c.RecibirHasta(m => Tipo(m) == "state");
        await c.Enviar("""{"type":"input","key":"salto"}""");
        Assert.Equal("UNKNOWN_KEY", (await c.RecibirHasta(m => Tipo(m) == "error")).GetProperty("error").GetString());
        await c.Enviar("""{"type":"baila"}""");
        Assert.Equal("UNKNOWN_TYPE", (await c.RecibirHasta(m => Tipo(m) == "error")).GetProperty("error").GetString());
        await c.Enviar("no es json");
        Assert.Equal("INVALID_JSON", (await c.RecibirHasta(m => Tipo(m) == "error")).GetProperty("error").GetString());
    }

    [Fact]
    public async Task RafagasDeTeclasYTicksSeProcesanEnOrdenSinPerderLaConexion()
    {
        // 300 teclas seguidas mientras la gravedad corre a 20 ms: todo pasa por una única cola, así que
        // los ticks que ve el cliente nunca retroceden y la conexión sigue viva y respondiendo.
        var c = await Conectar();
        await c.Enviar("""{"type":"start","options":{"seed":5}}""");
        string[] teclas = ["left", "right", "rotate", "soft_drop"];
        for (int i = 0; i < 300; i++)
        {
            await c.Enviar($$"""{"type":"input","key":"{{teclas[i % 4]}}"}""");
        }

        int ultimo = -1;
        JsonElement? m;
        while ((m = await c.Recibir(500)) is not null && Tipo(m.Value) == "state")
        {
            int tick = m.Value.GetProperty("tick").GetInt32();
            Assert.True(tick >= ultimo, $"el tick retrocedió: {ultimo} -> {tick}");
            ultimo = tick;
            if (ultimo > 40)
            {
                break;
            }
        }
        Assert.True(ultimo > 0, "no llegaron ticks");
        await c.Enviar("""{"type":"pause"}""");
        await c.RecibirHasta(m => Tipo(m) == "state" && m.GetProperty("data").GetProperty("paused").GetBoolean());
    }
}
