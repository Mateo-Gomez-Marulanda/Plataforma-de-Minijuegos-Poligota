// Punto de entrada del servicio Asteroids: arranca el servidor HTTP/WebSocket en el puerto 8005 (o PORT).
package main

import (
	"log"
	"net/http"
	"os"

	"asteroids/server"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8005"
	}
	log.Printf("asteroids-service escuchando en :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, server.NewHandler()))
}
