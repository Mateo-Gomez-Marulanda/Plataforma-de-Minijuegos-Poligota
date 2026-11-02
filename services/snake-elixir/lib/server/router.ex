# Rutas HTTP del servicio: /ws (upgrade a WebSocket) y /health. El gateway reenvía
# /ws/snake a /ws de este servicio.
defmodule Snake.Server.Router do
  @moduledoc "Plug.Router con el endpoint WebSocket y la comprobación de salud."
  use Plug.Router

  plug(:match)
  plug(:dispatch)

  # Convierte la petición en una conexión WebSocket manejada por Snake.Server.Socket.
  get "/ws" do
    conn
    |> WebSockAdapter.upgrade(Snake.Server.Socket, [], timeout: 600_000)
    |> halt()
  end

  # Indica que el servicio está vivo.
  get "/health" do
    send_resp(conn, 200, ~s({"status":"ok"}))
  end

  # Cualquier otra ruta no existe.
  match _ do
    send_resp(conn, 404, ~s({"error":"NOT_FOUND"}))
  end
end
