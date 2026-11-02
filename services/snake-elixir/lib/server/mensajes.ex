# Traducción entre el JSON del contrato WebSocket (sección 4.2) y términos de Elixir.
# Es el único módulo que conoce el formato de los mensajes; la lógica nunca ve JSON.
defmodule Snake.Server.Mensajes do
  @moduledoc "Decodifica mensajes del cliente y codifica los del servidor."

  alias Snake.Logic.Juego

  @teclas %{"up" => :up, "down" => :down, "left" => :left, "right" => :right}

  @doc "Convierte el texto del cliente en {:ok, mensaje} o {:error, código, texto}."
  def decodificar(texto) do
    case Jason.decode(texto) do
      {:ok, %{"type" => tipo} = msg} -> por_tipo(tipo, msg)
      {:ok, _} -> {:error, "UNKNOWN_TYPE", "Falta el campo 'type'"}
      {:error, _} -> {:error, "INVALID_JSON", "El mensaje no es JSON válido"}
    end
  end

  # Interpreta cada tipo de mensaje del cliente.
  defp por_tipo("start", msg), do: {:ok, {:start, opciones(msg["options"])}}
  defp por_tipo("pause", _), do: {:ok, :pause}
  defp por_tipo("resume", _), do: {:ok, :resume}

  defp por_tipo("input", msg) do
    case Map.fetch(@teclas, msg["key"]) do
      {:ok, tecla} -> {:ok, {:input, tecla}}
      :error -> {:error, "UNKNOWN_KEY", "Tecla no reconocida"}
    end
  end

  defp por_tipo(tipo, _),
    do: {:error, "UNKNOWN_TYPE", "Tipo de mensaje desconocido: #{inspect(tipo)}"}

  # Pasa las opciones del JSON (width/height) a las de la lógica.
  defp opciones(%{} = o),
    do: Enum.reject([ancho: o["width"], alto: o["height"]], fn {_, v} -> is_nil(v) end)

  defp opciones(_), do: []

  @doc "Mensaje `state` con el tablero y los datos del juego."
  def estado(tick, %Juego{} = juego, pausado) do
    encode(%{
      type: "state",
      tick: tick,
      status: "playing",
      board: Juego.a_tablero(juego),
      data: %{score: juego.puntaje, paused: pausado, interval_ms: Juego.intervalo_ms(juego)}
    })
  end

  @doc "Mensaje `game_over` con el puntaje y el motivo (wall, self o board_full)."
  def game_over(tick, %Juego{} = juego) do
    {resultado, razon} = Juego.terminado(juego)

    encode(%{
      type: "game_over",
      data: %{
        score: juego.puntaje,
        reason: Atom.to_string(razon),
        result: if(resultado == :won, do: "won", else: "lost"),
        tick: tick
      }
    })
  end

  @doc "Mensaje `error` con código y texto."
  def error(codigo, texto), do: encode(%{type: "error", error: codigo, message: texto})

  # Serializa a JSON.
  defp encode(mapa), do: Jason.encode!(mapa)
end
