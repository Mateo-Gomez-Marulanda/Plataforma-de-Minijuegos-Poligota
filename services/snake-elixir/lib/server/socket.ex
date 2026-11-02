# Manejador del WebSocket (comportamiento WebSock). Una conexión corresponde a una partida:
# traduce los mensajes del cliente a llamadas a Partida y reenvía al cliente lo que Partida emite.
defmodule Snake.Server.Socket do
  @moduledoc "Conexión WebSocket de un jugador de Snake."
  @behaviour WebSock

  alias Snake.Logic.Juego
  alias Snake.Server.{Mensajes, Partida}

  # Al conectar todavía no hay partida; empieza con el mensaje `start`.
  @impl true
  def init(_args), do: {:ok, %{partida: nil}}

  # Recibe un mensaje del cliente, lo decodifica y lo ejecuta.
  @impl true
  def handle_in({texto, opcode: :text}, estado) do
    case Mensajes.decodificar(texto) do
      {:ok, mensaje} -> ejecutar(mensaje, estado)
      {:error, codigo, detalle} -> responder_error(codigo, detalle, estado)
    end
  end

  def handle_in(_binario, estado),
    do: responder_error("INVALID_JSON", "Solo se aceptan mensajes de texto", estado)

  # Mensajes que llegan desde la Partida: estado nuevo o fin de juego.
  @impl true
  def handle_info({:snake_state, pid, tick, juego, pausado}, %{partida: pid} = estado) do
    {:push, {:text, Mensajes.estado(tick, juego, pausado)}, estado}
  end

  def handle_info({:snake_game_over, pid, tick, juego}, %{partida: pid} = estado) do
    {:push, {:text, Mensajes.game_over(tick, juego)}, %{estado | partida: nil}}
  end

  # Mensajes de una partida anterior (tras reiniciar): se descartan.
  def handle_info(_otro, estado), do: {:ok, estado}

  # start: reemplaza cualquier partida previa y crea una nueva.
  defp ejecutar({:start, opciones}, estado) do
    detener(estado.partida)

    with {:ok, juego} <- Juego.nuevo_juego(opciones),
         {:ok, pid} <-
           DynamicSupervisor.start_child(
             Snake.Server.PartidaSupervisor,
             {Partida, owner: self(), juego: juego}
           ) do
      {:ok, %{estado | partida: pid}}
    else
      {:error, :tamano_invalido} ->
        responder_error("INVALID_OPTIONS", "width y height deben estar entre 5 y 50", %{
          estado
          | partida: nil
        })

      {:error, _} ->
        responder_error("START_FAILED", "No se pudo crear la partida", %{estado | partida: nil})
    end
  end

  defp ejecutar(_mensaje, %{partida: nil} = estado),
    do: responder_error("NOT_STARTED", "Envía primero un mensaje start", estado)

  defp ejecutar({:input, tecla}, estado),
    do: tap({:ok, estado}, fn _ -> Partida.input(estado.partida, tecla) end)

  defp ejecutar(:pause, estado),
    do: tap({:ok, estado}, fn _ -> Partida.pausar(estado.partida) end)

  defp ejecutar(:resume, estado),
    do: tap({:ok, estado}, fn _ -> Partida.reanudar(estado.partida) end)

  # Detiene una partida en curso (si la hay).
  defp detener(nil), do: :ok
  defp detener(pid), do: DynamicSupervisor.terminate_child(Snake.Server.PartidaSupervisor, pid)

  # Responde al cliente con un mensaje `error`.
  defp responder_error(codigo, detalle, estado),
    do: {:push, {:text, Mensajes.error(codigo, detalle)}, estado}
end
