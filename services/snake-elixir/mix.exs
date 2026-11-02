# Definición del proyecto Mix del servicio Snake: versión de Elixir, aplicación OTP y dependencias.
defmodule Snake.MixProject do
  use Mix.Project

  # Metadatos del proyecto.
  def project do
    [
      app: :snake,
      version: "0.1.0",
      elixir: "~> 1.17",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  # Aplicación OTP: arranca Snake.Application.
  def application do
    [extra_applications: [:logger], mod: {Snake.Application, []}]
  end

  # Bandit (servidor HTTP), Plug (rutas), WebSockAdapter (upgrade a WebSocket) y Jason (JSON).
  # WebSockex solo se usa en pruebas, como cliente WebSocket.
  defp deps do
    [
      {:bandit, "~> 1.5"},
      {:plug, "~> 1.16"},
      {:websock_adapter, "~> 0.5"},
      {:jason, "~> 1.4"},
      {:websockex, "~> 0.4", only: :test}
    ]
  end
end
