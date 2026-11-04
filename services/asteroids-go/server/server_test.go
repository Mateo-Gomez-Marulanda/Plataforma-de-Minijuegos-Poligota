// Pruebas de la capa de servidor: interpretación de mensajes, sesión con reloj simulado y WebSocket real.
package server

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"asteroids/logic"

	"github.com/coder/websocket"
)

func TestParse(t *testing.T) {
	casos := []struct {
		entrada string
		quiero  any
	}{
		{`{"type":"pause"}`, Pause{}},
		{`{"type":"resume"}`, Resume{}},
		{`{"type":"start"}`, Start{}},
		{`{"type":"input","key":"fire"}`, Input{Key: logic.Fire}},
		{`not json`, ProtocolError{"INVALID_JSON", "El mensaje no es JSON válido"}},
		{`{"key":"fire"}`, ProtocolError{"UNKNOWN_TYPE", "Falta el campo 'type'"}},
		{`{"type":"dance"}`, ProtocolError{"UNKNOWN_TYPE", "Tipo de mensaje desconocido: dance"}},
		{`{"type":"input","key":"left"}`, ProtocolError{"UNKNOWN_KEY", "Tecla no reconocida"}},
		{`{"type":"input"}`, ProtocolError{"UNKNOWN_KEY", "Tecla no reconocida"}},
	}
	for _, c := range casos {
		if got := Parse([]byte(c.entrada)); got != c.quiero {
			t.Errorf("Parse(%s) = %#v, quiero %#v", c.entrada, got, c.quiero)
		}
	}
}

func TestParseSemillaYPressed(t *testing.T) {
	if s, ok := Parse([]byte(`{"type":"start","options":{"seed":42}}`)).(Start); !ok || s.Seed == nil || *s.Seed != 42 {
		t.Errorf("semilla no leída: %#v", s)
	}
	if s := Parse([]byte(`{"type":"start","options":{"seed":"x"}}`)); s != (Start{}) {
		// "x" no es número: json.Unmarshal falla -> error de JSON, no un Start con semilla
		if _, ok := s.(ProtocolError); !ok {
			t.Errorf("semilla inválida debe ignorarse o rechazarse: %#v", s)
		}
	}
	for _, p := range []bool{true, false} {
		in := Parse([]byte(`{"type":"input","key":"thrust","pressed":` + map[bool]string{true: "true", false: "false"}[p] + `}`)).(Input)
		if in.Pressed == nil || *in.Pressed != p {
			t.Errorf("pressed=%v no leído: %#v", p, in)
		}
	}
}

// sesion crea una sesión que guarda lo que envía y expone canales para manejarla a mano.
func sesion(t *testing.T) (inbox chan Message, ticks chan time.Time, enviados *[]map[string]any, parar func()) {
	t.Helper()
	inbox = make(chan Message) // sin búfer: cada envío espera a que la sesión lo reciba, así el orden es determinista
	ticks = make(chan time.Time)
	out := []map[string]any{}
	s := NewSession(func(b []byte) error {
		var m map[string]any
		if err := json.Unmarshal(b, &m); err != nil {
			t.Fatalf("JSON inválido: %v", err)
		}
		out = append(out, m)
		return nil
	})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { s.Run(ctx, inbox, ticks); close(done) }()
	return inbox, ticks, &out, func() { cancel(); <-done }
}

// tickear entrega n ticks al reloj (cada envío espera a que la sesión lo consuma).
func tickear(ticks chan time.Time, n int) {
	for i := 0; i < n; i++ {
		ticks <- time.Time{}
	}
}

func TestSesionSinStartResponde_NOT_STARTED(t *testing.T) {
	inbox, _, enviados, parar := sesion(t)
	inbox <- Input{Key: logic.Thrust}
	parar()
	if len(*enviados) != 1 || (*enviados)[0]["error"] != "NOT_STARTED" {
		t.Fatalf("enviados: %v", *enviados)
	}
}

func TestSesionEnviaEstadoCadaDosTicksConEventos(t *testing.T) {
	inbox, ticks, enviados, parar := sesion(t)
	inbox <- Start{Seed: new(uint64)}
	tickear(ticks, 4)
	parar()
	if len(*enviados) != 3 { // start + ticks 2 y 4
		t.Fatalf("se esperaban 3 mensajes, hay %d", len(*enviados))
	}
	m := (*enviados)[2]
	if m["type"] != "state" || m["tick"] != float64(4) || m["status"] != "playing" || m["board"] != nil {
		t.Fatalf("mensaje: %v", m)
	}
	if _, ok := m["events"].([]any); !ok {
		t.Fatalf("events debe ser una lista: %v", m["events"])
	}
	data := m["data"].(map[string]any)
	for _, campo := range []string{"ship", "asteroids", "bullets", "score", "combo", "lives", "wave"} {
		if _, ok := data[campo]; !ok {
			t.Errorf("falta data.%s", campo)
		}
	}
}

func TestSesionPausaDetieneElReloj(t *testing.T) {
	inbox, ticks, enviados, parar := sesion(t)
	inbox <- Start{}
	inbox <- Pause{}
	tickear(ticks, 10)
	inbox <- Resume{}
	tickear(ticks, 2)
	parar()
	// start, pausa (paused=true), reanudar (paused=false), tick 2 → 4 mensajes y tick final = 2
	if len(*enviados) != 4 {
		t.Fatalf("mensajes: %d %v", len(*enviados), *enviados)
	}
	if (*enviados)[1]["data"].(map[string]any)["paused"] != true || (*enviados)[3]["tick"] != float64(2) {
		t.Fatalf("la pausa no detuvo el reloj: %v", *enviados)
	}
}

func TestSesionTeclasMantenidasYGameOver(t *testing.T) {
	inbox, ticks, enviados, parar := sesion(t)
	seed := uint64(5)
	inbox <- Start{Seed: &seed}
	verdadero := true
	inbox <- Input{Key: logic.Thrust, Pressed: &verdadero}
	tickear(ticks, 2)
	parar()
	nave := (*enviados)[1]["data"].(map[string]any)["ship"].(map[string]any)
	if nave["thrusting"] != true {
		t.Fatalf("la tecla mantenida debe aplicarse en el tick: %v", nave)
	}
}

func TestSesionGameOverEnviaEstadoFinalYGameOver(t *testing.T) {
	var enviados []map[string]any
	s := NewSession(func(b []byte) error {
		var m map[string]any
		json.Unmarshal(b, &m)
		enviados = append(enviados, m)
		return nil
	})
	s.game = logic.NewGame(1)
	s.game.Lives = 1
	s.game.Ship.Invulnerable = 0
	s.game.Asteroids = []logic.Asteroid{{ID: 99, Pos: s.game.Ship.Pos, Size: logic.Large}}
	if err := s.step(); err != nil {
		t.Fatal(err)
	}
	if len(enviados) != 2 || enviados[0]["status"] != "lost" || enviados[1]["type"] != "game_over" {
		t.Fatalf("enviados: %v", enviados)
	}
	if evs := enviados[0]["events"].([]any); len(evs) != 2 || evs[1] != "game_over" {
		t.Fatalf("events: %v", evs)
	}
	if enviados[1]["data"].(map[string]any)["reason"] != "no_lives" {
		t.Fatalf("game_over: %v", enviados[1])
	}
	if s.game != nil {
		t.Fatal("tras terminar la sesión queda sin partida")
	}
}

// Prueba de punta a punta: cliente WebSocket real contra el servidor HTTP.
func TestWebSocketReal(t *testing.T) {
	srv := httptest.NewServer(NewHandler())
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()

	leer := func() map[string]any {
		_, data, err := c.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var m map[string]any
		json.Unmarshal(data, &m)
		return m
	}
	escribir := func(s string) {
		if err := c.Write(ctx, websocket.MessageText, []byte(s)); err != nil {
			t.Fatal(err)
		}
	}

	escribir(`{"type":"input","key":"fire"}`)
	if m := leer(); m["error"] != "NOT_STARTED" {
		t.Fatalf("esperaba NOT_STARTED: %v", m)
	}
	escribir(`{"type":"start","options":{"seed":1}}`)
	if m := leer(); m["type"] != "state" || m["tick"] != float64(0) {
		t.Fatalf("esperaba el estado inicial: %v", m)
	}
	m := leer() // el siguiente llega solo, por el reloj
	if m["type"] != "state" || m["tick"] != float64(2) {
		t.Fatalf("esperaba el tick 2: %v", m)
	}
	escribir(`{"type":"input","key":"zzz"}`)
	for {
		if m := leer(); m["type"] == "error" {
			if m["error"] != "UNKNOWN_KEY" {
				t.Fatalf("error: %v", m)
			}
			break
		}
	}
}

func TestHealth(t *testing.T) {
	srv := httptest.NewServer(NewHandler())
	defer srv.Close()
	r := httptest.NewRecorder()
	NewHandler().ServeHTTP(r, httptest.NewRequest("GET", "/health", nil))
	if r.Code != 200 || !strings.Contains(r.Body.String(), `"ok"`) {
		t.Fatalf("health: %d %s", r.Code, r.Body)
	}
}
