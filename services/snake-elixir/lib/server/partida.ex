# Proceso de una partida: un GenServer que guarda el estado del juego y marca el reloj (tick).
# Envía cada estado nuevo a su dueño (el proceso del WebSocket) y se detiene al terminar la
# partida o si el dueño se desconecta, de modo que cerrar el socket libera la partida.
defmodule Snake.Server.Partida do
  @moduledoc "GenServer con el bucle de juego de una partida."
  use GenServer, restart: :temporary

  alias Snake.Logic.Juego

  @doc "Inicia la partida. Opciones: :owner (pid que recibe los mensajes) y :juego (estado inicial)."
  def start_link(opts), do: GenServer.start_link(__MODULE__, opts)

  @doc "Encola un giro (:up | :down | :left | :right)."
  def input(pid, tecla), do: GenServer.cast(pid, {:input, tecla})

  @doc "Detiene el reloj sin perder el estado."
  def pausar(pid), do: GenServer.cast(pid, :pausar)

  @doc "Reanuda el reloj tras una pausa."
  def reanudar(pid), do: GenServer.cast(pid, :reanudar)

  # Envía el estado inicial (tick 0) y programa el primer tick.
  @impl true
  def init(owner: owner, juego: juego) do
    Process.monitor(owner)
    estado = %{owner: owner, juego: juego, tick: 0, token: nil, pausado: false}
    notificar(estado)
    {:ok, programar(estado)}
  end

  @impl true
  def handle_cast({:input, tecla}, estado) do
    {:noreply, %{estado | juego: Juego.aplicar_accion(estado.juego, tecla)}}
  end

  def handle_cast(:pausar, %{pausado: false} = estado) do
    estado = %{estado | pausado: true, token: nil}
    notificar(estado)
    {:noreply, estado}
  end

  def handle_cast(:reanudar, %{pausado: true} = estado) do
    estado = programar(%{estado | pausado: false})
    notificar(estado)
    {:noreply, estado}
  end

  def handle_cast(_otro, estado), do: {:noreply, estado}

  # Avanza el juego un tick; si terminó avisa y se detiene, si no reprograma el reloj.
  @impl true
  def handle_info({:tick, token}, %{token: token} = estado) do
    juego = Juego.tick(estado.juego)
    estado = %{estado | juego: juego, tick: estado.tick + 1}

    case Juego.terminado(juego) do
      nil ->
        notificar(estado)
        {:noreply, programar(estado)}

      _ ->
        send(estado.owner, {:snake_game_over, self(), estado.tick, juego})
        {:stop, :normal, estado}
    end
  end

  # Tick antiguo (de antes de una pausa): se ignora.
  def handle_info({:tick, _viejo}, estado), do: {:noreply, estado}

  # El dueño se desconectó: no tiene sentido seguir con la partida.
  def handle_info({:DOWN, _ref, :process, _pid, _motivo}, estado), do: {:stop, :normal, estado}

  # Programa el siguiente tick con un token nuevo para poder descartar ticks obsoletos.
  defp programar(estado) do
    token = make_ref()
    Process.send_after(self(), {:tick, token}, Juego.intervalo_ms(estado.juego))
    %{estado | token: token}
  end

  # Envía el estado actual al dueño.
  defp notificar(estado) do
    send(estado.owner, {:snake_state, self(), estado.tick, estado.juego, estado.pausado})
  end
end
