// Traducción entre el JSON del contrato WebSocket (sección 4.2 del diseño) y los tipos de la lógica.
// Es el único lugar que conoce el formato de los mensajes; la lógica nunca ve JSON.
package server

import (
	"encoding/json"
	"math"

	"asteroids/logic"
)

// Message es un mensaje del cliente ya interpretado.
type Message interface{ isMessage() }

// Start empieza (o reinicia) una partida. Seed fija la partida (se usa en las pruebas).
type Start struct{ Seed *uint64 }

// Input es una tecla. Pressed es nil si el cliente no lo informó (pulsación única).
type Input struct {
	Key     logic.Key
	Pressed *bool
}

// Pause y Resume detienen y reanudan el reloj.
type Pause struct{}
type Resume struct{}

// ProtocolError es un mensaje inválido: se responde con un `error` sin tocar la partida.
type ProtocolError struct{ Code, Text string }

func (Start) isMessage()         {}
func (Input) isMessage()         {}
func (Pause) isMessage()         {}
func (Resume) isMessage()        {}
func (ProtocolError) isMessage() {}

// keys traduce la tecla del contrato a la de la lógica.
var keys = map[string]logic.Key{
	"rotate_left":  logic.RotateLeft,
	"rotate_right": logic.RotateRight,
	"thrust":       logic.Thrust,
	"fire":         logic.Fire,
}

// incoming es la forma común de los mensajes del cliente.
type incoming struct {
	Type    *string `json:"type"`
	Key     *string `json:"key"`
	Pressed *bool   `json:"pressed"`
	Options *struct {
		Seed *float64 `json:"seed"`
	} `json:"options"`
}

// Parse convierte el texto recibido en un mensaje; nunca falla: los errores son ProtocolError.
func Parse(data []byte) Message {
	var m incoming
	if err := json.Unmarshal(data, &m); err != nil {
		return ProtocolError{"INVALID_JSON", "El mensaje no es JSON válido"}
	}
	if m.Type == nil {
		return ProtocolError{"UNKNOWN_TYPE", "Falta el campo 'type'"}
	}
	switch *m.Type {
	case "start":
		if m.Options != nil && m.Options.Seed != nil && *m.Options.Seed >= 0 && *m.Options.Seed < math.MaxUint32 {
			seed := uint64(*m.Options.Seed)
			return Start{Seed: &seed}
		}
		return Start{}
	case "pause":
		return Pause{}
	case "resume":
		return Resume{}
	case "input":
		if m.Key != nil {
			if k, ok := keys[*m.Key]; ok {
				return Input{Key: k, Pressed: m.Pressed}
			}
		}
		return ProtocolError{"UNKNOWN_KEY", "Tecla no reconocida"}
	default:
		return ProtocolError{"UNKNOWN_TYPE", "Tipo de mensaje desconocido: " + *m.Type}
	}
}

// Formas JSON de los mensajes del servidor.
type (
	shipJSON struct {
		X            float64 `json:"x"`
		Y            float64 `json:"y"`
		Angle        float64 `json:"angle"`
		Thrusting    bool    `json:"thrusting"`
		Invulnerable bool    `json:"invulnerable"`
	}
	asteroidJSON struct {
		ID   int     `json:"id"`
		X    float64 `json:"x"`
		Y    float64 `json:"y"`
		Size string  `json:"size"`
		R    float64 `json:"r"`
	}
	bulletJSON struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	}
	dataJSON struct {
		Ship      shipJSON       `json:"ship"`
		Asteroids []asteroidJSON `json:"asteroids"`
		Bullets   []bulletJSON   `json:"bullets"`
		Score     int            `json:"score"`
		Combo     int            `json:"combo"`
		Lives     int            `json:"lives"`
		Wave      int            `json:"wave"`
		Paused    bool           `json:"paused"`
	}
	stateJSON struct {
		Type   string   `json:"type"`
		Tick   int      `json:"tick"`
		Status string   `json:"status"`
		Board  any      `json:"board"` // siempre null: este juego no tiene cuadrícula
		Data   dataJSON `json:"data"`
		Events []string `json:"events"`
	}
	gameOverJSON struct {
		Type string `json:"type"`
		Data struct {
			Score  int    `json:"score"`
			Wave   int    `json:"wave"`
			Reason string `json:"reason"`
			Tick   int    `json:"tick"`
		} `json:"data"`
	}
	errorJSON struct {
		Type    string `json:"type"`
		Error   string `json:"error"`
		Message string `json:"message"`
	}
)

// round1 redondea a un decimal para aligerar el JSON.
func round1(v float64) float64 { return math.Round(v*10) / 10 }

// StateMessage construye el mensaje `state`. Status es "playing" o "lost".
func StateMessage(tick int, g *logic.State, paused bool, events []logic.Event) []byte {
	d := dataJSON{
		Ship: shipJSON{
			X: round1(g.Ship.Pos.X), Y: round1(g.Ship.Pos.Y), Angle: math.Round(g.Ship.Angle*100) / 100,
			Thrusting: g.Ship.Thrusting, Invulnerable: g.Ship.Invulnerable > 0,
		},
		Asteroids: make([]asteroidJSON, 0, len(g.Asteroids)),
		Bullets:   make([]bulletJSON, 0, len(g.Bullets)),
		Score:     g.Score, Combo: g.Combo, Lives: g.Lives, Wave: g.Wave, Paused: paused,
	}
	for _, a := range g.Asteroids {
		d.Asteroids = append(d.Asteroids, asteroidJSON{a.ID, round1(a.Pos.X), round1(a.Pos.Y), a.Size.String(), a.Size.Radius()})
	}
	for _, b := range g.Bullets {
		d.Bullets = append(d.Bullets, bulletJSON{round1(b.Pos.X), round1(b.Pos.Y)})
	}
	status := "playing"
	if g.Over {
		status = "lost"
	}
	names := make([]string, len(events))
	for i, e := range events {
		names[i] = string(e)
	}
	return mustJSON(stateJSON{Type: "state", Tick: tick, Status: status, Data: d, Events: names})
}

// GameOverMessage construye el mensaje `game_over` con el resultado final.
func GameOverMessage(tick int, g *logic.State) []byte {
	var m gameOverJSON
	m.Type = "game_over"
	m.Data.Score, m.Data.Wave, m.Data.Reason, m.Data.Tick = g.Score, g.Wave, "no_lives", tick
	return mustJSON(m)
}

// ErrorMessage construye el mensaje `error`.
func ErrorMessage(code, text string) []byte {
	return mustJSON(errorJSON{Type: "error", Error: code, Message: text})
}

// mustJSON serializa estructuras propias; no puede fallar porque no contienen tipos no serializables.
func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
