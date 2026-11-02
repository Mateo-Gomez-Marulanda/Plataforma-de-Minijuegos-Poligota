# Prueba de integración del contrato WebSocket: levanta el servicio real y lo usa con un cliente WebSockex.
defmodule Snake.Server.WsTest do
  use ExUnit.Case, async: false

  # Cliente de prueba que reenvía cada mensaje recibido al proceso del test.
  defmodule Cliente do
    use WebSockex

    # Conecta al servicio y envía los mensajes a `padre`.
    def conectar(padre), do: WebSockex.start_link("ws://localhost:8003/ws", __MODULE__, padre)

    # Envía un mapa como JSON.
    def enviar(pid, mapa), do: WebSockex.send_frame(pid, {:text, Jason.encode!(mapa)})

    @impl true
    def handle_frame({:text, texto}, padre) do
      send(padre, {:ws, Jason.decode!(texto)})
      {:ok, padre}
    end
  end

  # Abre una conexión nueva para cada prueba.
  setup do
    {:ok, c} = Cliente.conectar(self())
    {:ok, c: c}
  end

  # Espera el siguiente mensaje del servicio (con tiempo límite).
  defp recibir(timeout \\ 1000) do
    receive do
      {:ws, msg} -> msg
    after
      timeout -> :timeout
    end
  end

  test "start devuelve el estado inicial y luego avanza por ticks", %{c: c} do
    Cliente.enviar(c, %{type: "start"})

    assert %{
             "type" => "state",
             "tick" => 0,
             "status" => "playing",
             "board" => board,
             "data" => %{"score" => 0}
           } = recibir()

    assert length(board) == 20 and length(hd(board)) == 20
    assert %{"type" => "state", "tick" => 1} = recibir()
  end

  test "pause detiene el reloj y resume lo reanuda", %{c: c} do
    Cliente.enviar(c, %{type: "start"})
    recibir()
    Cliente.enviar(c, %{type: "pause"})
    # Se vacían los mensajes en vuelo hasta ver la confirmación de pausa.
    assert Enum.find(1..5, fn _ -> match?(%{"data" => %{"paused" => true}}, recibir()) end)
    assert recibir(500) == :timeout
    Cliente.enviar(c, %{type: "resume"})
    assert %{"data" => %{"paused" => false}} = recibir()
    assert %{"type" => "state"} = recibir()
  end

  test "chocar con la pared envía game_over", %{c: c} do
    Cliente.enviar(c, %{type: "start", options: %{width: 5, height: 5}})

    final =
      Stream.repeatedly(fn -> recibir(2000) end)
      |> Enum.find(&(&1 == :timeout or &1["type"] == "game_over"))

    assert %{
             "type" => "game_over",
             "data" => %{"reason" => "wall", "result" => "lost", "score" => _}
           } = final
  end

  test "errores del contrato", %{c: c} do
    Cliente.enviar(c, %{type: "input", key: "left"})
    assert %{"type" => "error", "error" => "NOT_STARTED"} = recibir()
    Cliente.enviar(c, %{type: "start"})
    recibir()
    Cliente.enviar(c, %{type: "input", key: "salto"})
    assert %{"type" => "error", "error" => "UNKNOWN_KEY"} = recibir()
    Cliente.enviar(c, %{type: "baila"})
    assert %{"type" => "error", "error" => "UNKNOWN_TYPE"} = recibir()
    WebSockex.send_frame(c, {:text, "no es json"})
    assert %{"type" => "error", "error" => "INVALID_JSON"} = recibir()
    Cliente.enviar(c, %{type: "start", options: %{width: 2}})
    assert %{"type" => "error", "error" => "INVALID_OPTIONS"} = recibir()
  end
end
