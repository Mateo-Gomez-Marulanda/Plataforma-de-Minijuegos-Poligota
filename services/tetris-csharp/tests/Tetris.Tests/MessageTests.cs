// Pruebas de los mensajes JSON del contrato: lectura de lo que envía el cliente y forma de lo que envía el servidor.
using System.Text.Json;
using Tetris.Logic;
using Tetris.Server;
using Xunit;

namespace Tetris.Tests;

public class MessageTests
{
    [Theory]
    [InlineData("left", PlayerAction.Left)]
    [InlineData("right", PlayerAction.Right)]
    [InlineData("rotate", PlayerAction.Rotate)]
    [InlineData("soft_drop", PlayerAction.SoftDrop)]
    [InlineData("hard_drop", PlayerAction.HardDrop)]
    public void LasTeclasDelContratoSeTraducenALaAccionCorrespondiente(string tecla, PlayerAction accion)
    {
        Assert.Equal(new InputMessage(accion), MessageParser.Parse($$"""{"type":"input","key":"{{tecla}}"}"""));
    }

    [Fact]
    public void InterpretaStartPausaYReanudar()
    {
        Assert.Equal(new StartMessage(null), MessageParser.Parse("""{"type":"start"}"""));
        Assert.Equal(new StartMessage(null), MessageParser.Parse("""{"type":"start","options":{}}"""));
        Assert.Equal(new StartMessage(42), MessageParser.Parse("""{"type":"start","options":{"seed":42}}"""));
        Assert.IsType<PauseMessage>(MessageParser.Parse("""{"type":"pause"}"""));
        Assert.IsType<ResumeMessage>(MessageParser.Parse("""{"type":"resume"}"""));
    }

    [Theory]
    [InlineData("no es json", "INVALID_JSON")]
    [InlineData("""{"type":"baila"}""", "UNKNOWN_TYPE")]
    [InlineData("""{"sin":"tipo"}""", "UNKNOWN_TYPE")]
    [InlineData("[1,2]", "UNKNOWN_TYPE")]
    [InlineData("""{"type":"input","key":"salto"}""", "UNKNOWN_KEY")]
    [InlineData("""{"type":"input"}""", "UNKNOWN_KEY")]
    [InlineData("""{"type":"input","key":5}""", "UNKNOWN_KEY")]
    public void LosMensajesInvalidosSeConvierteEnErroresSinLanzarExcepciones(string texto, string codigo)
    {
        var error = Assert.IsType<ProtocolError>(MessageParser.Parse(texto));
        Assert.Equal(codigo, error.Code);
    }

    [Fact]
    public void ElMensajeStateUsaSnakeCaseYTrae20x10CasillasYLosDatosDelContrato()
    {
        var json = JsonDocument.Parse(MessageWriter.State(3, Game.NewGame(1), paused: true, intervalMs: 1000)).RootElement;
        Assert.Equal("state", json.GetProperty("type").GetString());
        Assert.Equal(3, json.GetProperty("tick").GetInt32());
        Assert.Equal("playing", json.GetProperty("status").GetString());
        Assert.Equal(20, json.GetProperty("board").GetArrayLength());
        Assert.Equal(10, json.GetProperty("board")[0].GetArrayLength());
        var datos = json.GetProperty("data");
        Assert.Equal(0, datos.GetProperty("score").GetInt32());
        Assert.Equal(1, datos.GetProperty("level").GetInt32());
        Assert.Equal(0, datos.GetProperty("lines").GetInt32());
        Assert.True(datos.GetProperty("paused").GetBoolean());
        Assert.Equal(1000, datos.GetProperty("interval_ms").GetInt32());
        Assert.Contains(datos.GetProperty("next").GetString(), Enum.GetNames<Tetromino>());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1, "lines_1")]
    [InlineData(2, "lines_2")]
    [InlineData(3, "lines_3")]
    [InlineData(4, "tetris")]
    [InlineData(5, "tetris")]
    public void LasLineasLimpiadasSeInformanComoEventos(int limpiadas, params string[] esperados) =>
        Assert.Equal(esperados, MessageWriter.EventsFor(limpiadas));

    [Fact]
    public void ElMensajeStateIncluyeLosEventosDeLaUltimaLimpieza()
    {
        var game = Game.NewGame(1) with { LastCleared = 4 };
        var json = JsonDocument.Parse(MessageWriter.State(1, game, paused: false, intervalMs: 1000)).RootElement;
        Assert.Equal(["tetris"], json.GetProperty("events").EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public void SinLimpiezaOAlReenviarElMismoEstadoLosEventosVanVacios()
    {
        var game = Game.NewGame(1) with { LastCleared = 2 };
        var sin = JsonDocument.Parse(MessageWriter.State(1, Game.NewGame(1), paused: false, intervalMs: 1000)).RootElement;
        var reenvio = JsonDocument.Parse(MessageWriter.State(1, game, paused: true, intervalMs: 1000, withEvents: false)).RootElement;
        Assert.Equal(0, sin.GetProperty("events").GetArrayLength());
        Assert.Equal(0, reenvio.GetProperty("events").GetArrayLength());
    }

    [Fact]
    public void GameOverYErrorSiguenElContrato()
    {
        var fin = Game.Tick(Game.NewGame(1) with
        {
            Current = new Piece(Tetromino.O, 0, 18, 3),
            Board = Board.Empty.Place(Enumerable.Range(0, 2).SelectMany(f => Enumerable.Range(3, 4).Select(c => new Offset(f, c))), 1),
        });
        var json = JsonDocument.Parse(MessageWriter.GameOver(9, fin)).RootElement;
        Assert.Equal("game_over", json.GetProperty("type").GetString());
        Assert.Equal("top_out", json.GetProperty("data").GetProperty("reason").GetString());
        Assert.Equal(9, json.GetProperty("data").GetProperty("tick").GetInt32());

        var error = JsonDocument.Parse(MessageWriter.Error("NOT_STARTED", "texto")).RootElement;
        Assert.Equal("error", error.GetProperty("type").GetString());
        Assert.Equal("NOT_STARTED", error.GetProperty("error").GetString());
    }
}
