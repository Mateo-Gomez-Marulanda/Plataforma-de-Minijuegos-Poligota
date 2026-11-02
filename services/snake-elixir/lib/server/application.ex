# Arranque de la aplicación OTP: supervisor de partidas y servidor HTTP/WebSocket (Bandit).
# El puerto se toma de la variable PORT (8003 por defecto).
defmodule Snake.Application do
  @moduledoc false
  use Application

  # Inicia el supervisor dinámico de partidas y el servidor web.
  @impl true
  def start(_type, _args) do
    port = String.to_integer(System.get_env("PORT", "8003"))

    children = [
      {DynamicSupervisor, strategy: :one_for_one, name: Snake.Server.PartidaSupervisor},
      {Bandit, plug: Snake.Server.Router, port: port}
    ]

    Supervisor.start_link(children, strategy: :one_for_one, name: Snake.Supervisor)
  end
end
