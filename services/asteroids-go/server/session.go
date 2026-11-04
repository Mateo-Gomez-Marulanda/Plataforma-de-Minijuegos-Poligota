// Sesión de una partida: un único bucle (una goroutine) es la autoridad del estado.
// Recibe los mensajes del jugador por un channel y los ticks del reloj por otro, dentro de un select.
// Como nadie más toca el estado ni escribe en el socket, no hacen falta mutex.
package server

import (
	"context"
	"time"

	"asteroids/logic"
)

// SendEvery es cada cuántos ticks de simulación (60 Hz) se envía el estado: 2 = 30 veces por segundo.
const SendEvery = 2

// TickInterval es el periodo del reloj de simulación.
const TickInterval = time.Second / logic.TickRate

// Session es una partida asociada a una conexión.
type Session struct {
	send func([]byte) error

	game    *logic.State // nil = sin partida (antes de `start`)
	tick    int
	paused  bool
	pending []logic.Event // eventos acumulados desde el último envío
}

// NewSession crea una sesión que escribe sus mensajes con send.
func NewSession(send func([]byte) error) *Session { return &Session{send: send} }

// Run procesa mensajes y ticks hasta que se cancela el contexto, se cierra la cola o falla un envío.
func (s *Session) Run(ctx context.Context, inbox <-chan Message, ticks <-chan time.Time) error {
	for {
		select {
		case <-ctx.Done():
			return nil
		case msg, ok := <-inbox:
			if !ok {
				return nil // el cliente se desconectó
			}
			if err := s.handle(msg); err != nil {
				return err
			}
		case <-ticks:
			if err := s.step(); err != nil {
				return err
			}
		}
	}
}

// handle atiende un mensaje del cliente.
func (s *Session) handle(msg Message) error {
	switch m := msg.(type) {
	case ProtocolError:
		return s.send(ErrorMessage(m.Code, m.Text))
	case Start:
		seed := uint64(time.Now().UnixNano())
		if m.Seed != nil {
			seed = *m.Seed
		}
		s.game, s.tick, s.paused, s.pending = logic.NewGame(seed), 0, false, nil
		return s.publish()
	}
	if s.game == nil {
		return s.send(ErrorMessage("NOT_STARTED", "Envía primero un mensaje start"))
	}
	switch m := msg.(type) {
	case Input:
		if m.Pressed == nil {
			s.game.Tap(m.Key)
		} else {
			s.game.SetKey(m.Key, *m.Pressed)
		}
	case Pause:
		if !s.paused {
			s.paused = true
			return s.publish()
		}
	case Resume:
		if s.paused {
			s.paused = false
			return s.publish()
		}
	}
	return nil
}

// step avanza un tick de simulación y, cada SendEvery ticks (o al terminar), envía el estado.
func (s *Session) step() error {
	if s.game == nil || s.paused {
		return nil
	}
	s.tick++
	s.pending = append(s.pending, s.game.Tick()...)
	if s.game.Over || s.tick%SendEvery == 0 {
		return s.publish()
	}
	return nil
}

// publish envía el estado actual con los eventos acumulados; si la partida terminó, envía además `game_over`.
func (s *Session) publish() error {
	events := s.pending
	s.pending = nil
	if err := s.send(StateMessage(s.tick, s.game, s.paused, events)); err != nil {
		return err
	}
	if s.game.Over {
		over := GameOverMessage(s.tick, s.game)
		s.game = nil
		return s.send(over)
	}
	return nil
}
