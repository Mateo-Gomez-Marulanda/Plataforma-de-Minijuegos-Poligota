// Conexión WebSocket de un jugador: una goroutine lee los mensajes y los pasa por un channel a la sesión,
// que es la única que escribe en el socket. También expone /health para comprobar que el servicio vive.
package server

import (
	"context"
	"net/http"
	"time"

	"github.com/coder/websocket"
)

// NewHandler devuelve el manejador HTTP del servicio: /health y /ws.
func NewHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("GET /ws", serveWS)
	return mux
}

// serveWS acepta la conexión y atiende una partida hasta que el cliente se va.
func serveWS(w http.ResponseWriter, r *http.Request) {
	// El servicio solo es alcanzable a través del gateway, que reenvía el Origin del navegador: no se filtra aquí.
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{"*"}})
	if err != nil {
		return
	}
	defer conn.CloseNow()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	inbox := make(chan Message, 64)
	go readLoop(ctx, conn, inbox)

	ticker := time.NewTicker(TickInterval)
	defer ticker.Stop()

	session := NewSession(func(data []byte) error {
		wctx, wcancel := context.WithTimeout(ctx, 5*time.Second)
		defer wcancel()
		return conn.Write(wctx, websocket.MessageText, data)
	})
	if session.Run(ctx, inbox, ticker.C) == nil {
		conn.Close(websocket.StatusNormalClosure, "")
	}
}

// readLoop lee mensajes de texto del socket y los encola; al terminar cierra la cola.
func readLoop(ctx context.Context, conn *websocket.Conn, inbox chan<- Message) {
	defer close(inbox)
	for {
		kind, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		var msg Message = ProtocolError{"INVALID_JSON", "Solo se aceptan mensajes de texto"}
		if kind == websocket.MessageText {
			msg = Parse(data)
		}
		select {
		case inbox <- msg:
		case <-ctx.Done():
			return
		}
	}
}
