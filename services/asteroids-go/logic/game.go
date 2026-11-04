// Lógica pura de Asteroids: física de la nave, disparos, asteroides, colisiones, combo, oleadas y vidas.
// No sabe nada de WebSockets, JSON ni relojes: el servidor llama a Tick una vez por cada paso de simulación.
package logic

import (
	"math"
	"math/rand/v2"
)

// Dimensiones del mundo y ritmo de la simulación.
const (
	WorldW   = 800.0
	WorldH   = 600.0
	TickRate = 60
	Dt       = 1.0 / TickRate // segundos que avanza cada Tick
)

// Parámetros de la nave y los disparos.
const (
	ShipRadius      = 12.0
	RotationSpeed   = 4.5   // rad/s
	ThrustAccel     = 260.0 // unidades/s²
	Friction        = 0.55  // fracción de velocidad que se conserva tras 1 s sin acelerar
	MaxShipSpeed    = 380.0
	BulletSpeed     = 460.0
	BulletRadius    = 2.0
	BulletLife      = 1.2 // s
	MaxBullets      = 4
	FireCooldown    = 0.2 // s entre disparos
	StartLives      = 3
	Invulnerability = 2.0 // s tras aparecer
)

// Parámetros del combo, las oleadas y los asteroides.
const (
	ComboWindow  = 2.0 // s para encadenar otra destrucción
	MaxCombo     = 8
	SafeDistance = 150.0 // distancia mínima a la nave al generar una oleada
	MaxLarge     = 10    // tope de asteroides grandes por oleada
)

// Size es el tamaño de un asteroide.
type Size int

const (
	Large Size = iota
	Medium
	Small
)

// String devuelve el nombre del tamaño tal como viaja en el contrato.
func (s Size) String() string {
	switch s {
	case Large:
		return "large"
	case Medium:
		return "medium"
	default:
		return "small"
	}
}

// Radius es el radio de colisión del tamaño.
func (s Size) Radius() float64 {
	switch s {
	case Large:
		return 40
	case Medium:
		return 22
	default:
		return 12
	}
}

// points son los puntos base (antes del combo) por destruir un asteroide.
func (s Size) points() int {
	switch s {
	case Large:
		return 20
	case Medium:
		return 50
	default:
		return 100
	}
}

// baseSpeed es la velocidad típica del tamaño: cuanto más pequeño, más rápido.
func (s Size) baseSpeed() float64 {
	switch s {
	case Large:
		return 45
	case Medium:
		return 75
	default:
		return 110
	}
}

// Key es una tecla del jugador.
type Key int

const (
	RotateLeft Key = iota
	RotateRight
	Thrust
	Fire
	numKeys
)

// Event es algo que ocurrió durante un tick; el frontend lo usa solo para efectos visuales y sonoros.
type Event string

const (
	AsteroidDestroyed Event = "asteroid_destroyed"
	ComboUp           Event = "combo_up"
	ComboLost         Event = "combo_lost"
	ShipDestroyed     Event = "ship_destroyed"
	WaveCleared       Event = "wave_cleared"
	GameOver          Event = "game_over"
)

// Ship es la nave del jugador.
type Ship struct {
	Pos          Vec
	Vel          Vec
	Angle        float64
	Thrusting    bool
	Invulnerable float64 // segundos de invulnerabilidad que quedan
}

// Asteroid es un asteroide con identificador estable para que el cliente pueda dibujarlo siempre igual.
type Asteroid struct {
	ID   int
	Pos  Vec
	Vel  Vec
	Size Size
}

// Bullet es un disparo.
type Bullet struct {
	Pos  Vec
	Vel  Vec
	Life float64 // segundos que le quedan
}

// State es el estado completo de una partida. Solo se modifica a través de sus métodos.
type State struct {
	Ship      Ship
	Asteroids []Asteroid
	Bullets   []Bullet
	Score     int
	Combo     int
	Lives     int
	Wave      int
	Over      bool

	comboTimer float64
	cooldown   float64
	nextID     int
	held       [numKeys]bool // teclas mantenidas hasta que se suelten
	tapped     [numKeys]bool // pulsaciones sueltas: valen para un solo tick
	rng        *rand.Rand    // generador con la semilla guardada en el estado: la partida es reproducible
}

// NewGame crea una partida en la oleada 1. La misma semilla produce siempre la misma partida.
func NewGame(seed uint64) *State {
	s := &State{
		Combo: 1,
		Lives: StartLives,
		Wave:  1,
		rng:   rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15)),
	}
	s.respawn()
	s.spawnWave()
	return s
}

// SetKey marca una tecla como mantenida (pressed) o soltada.
func (s *State) SetKey(k Key, pressed bool) {
	if k >= 0 && k < numKeys {
		s.held[k] = pressed
	}
}

// Tap simula una pulsación breve: la tecla cuenta como activa solo en el siguiente tick.
func (s *State) Tap(k Key) {
	if k >= 0 && k < numKeys {
		s.tapped[k] = true
	}
}

// respawn coloca la nave quieta en el centro, apuntando hacia arriba y con invulnerabilidad.
func (s *State) respawn() {
	s.Ship = Ship{Pos: Vec{WorldW / 2, WorldH / 2}, Invulnerable: Invulnerability}
}

// Tick avanza la simulación un paso (Dt segundos) y devuelve los eventos ocurridos.
func (s *State) Tick() []Event {
	if s.Over {
		return nil
	}
	var events []Event
	s.moveShip()
	s.fire()
	s.moveBulletsAndAsteroids()
	s.tickCombo(&events)
	s.resolveBullets(&events)
	s.resolveShip(&events)
	if !s.Over && len(s.Asteroids) == 0 {
		s.Wave++
		s.spawnWave()
		events = append(events, WaveCleared)
	}
	return events
}

// active dice si una tecla cuenta como pulsada en este tick y consume las pulsaciones sueltas.
func (s *State) active(k Key) bool {
	on := s.held[k] || s.tapped[k]
	s.tapped[k] = false
	return on
}

// moveShip aplica rotación, empuje, fricción, velocidad máxima y movimiento con envolvimiento.
func (s *State) moveShip() {
	left, right, thrust := s.active(RotateLeft), s.active(RotateRight), s.active(Thrust)
	sh := &s.Ship
	if left {
		sh.Angle -= RotationSpeed * Dt
	}
	if right {
		sh.Angle += RotationSpeed * Dt
	}
	sh.Thrusting = thrust
	if thrust {
		sh.Vel = sh.Vel.Add(dirFromAngle(sh.Angle).Scale(ThrustAccel * Dt))
	}
	sh.Vel = sh.Vel.Scale(math.Pow(Friction, Dt))
	if speed := sh.Vel.Len(); speed > MaxShipSpeed {
		sh.Vel = sh.Vel.Scale(MaxShipSpeed / speed)
	}
	sh.Pos = wrap(sh.Pos.Add(sh.Vel.Scale(Dt)))
	sh.Invulnerable = math.Max(0, sh.Invulnerable-Dt)
}

// fire dispara si la tecla está activa, ha pasado el enfriamiento y no se superó el máximo de balas.
func (s *State) fire() {
	s.cooldown = math.Max(0, s.cooldown-Dt)
	if !s.active(Fire) || s.cooldown > 0 || len(s.Bullets) >= MaxBullets {
		return
	}
	dir := dirFromAngle(s.Ship.Angle)
	s.Bullets = append(s.Bullets, Bullet{
		Pos:  wrap(s.Ship.Pos.Add(dir.Scale(ShipRadius))),
		Vel:  s.Ship.Vel.Add(dir.Scale(BulletSpeed)), // hereda la velocidad de la nave
		Life: BulletLife,
	})
	s.cooldown = FireCooldown
}

// moveBulletsAndAsteroids mueve ambos con envolvimiento y descarta las balas que expiraron.
func (s *State) moveBulletsAndAsteroids() {
	alive := s.Bullets[:0]
	for _, b := range s.Bullets {
		b.Life -= Dt
		if b.Life <= 0 {
			continue
		}
		b.Pos = wrap(b.Pos.Add(b.Vel.Scale(Dt)))
		alive = append(alive, b)
	}
	s.Bullets = alive
	for i := range s.Asteroids {
		a := &s.Asteroids[i]
		a.Pos = wrap(a.Pos.Add(a.Vel.Scale(Dt)))
	}
}

// tickCombo descuenta el temporizador del combo y lo reinicia a x1 si se agota.
func (s *State) tickCombo(events *[]Event) {
	if s.Combo <= 1 {
		return
	}
	s.comboTimer -= Dt
	if s.comboTimer <= 0 {
		s.Combo = 1
		*events = append(*events, ComboLost)
	}
}

// resolveBullets destruye el primer asteroide que toca cada bala y reparte los fragmentos.
func (s *State) resolveBullets(events *[]Event) {
	var born []Asteroid
	remaining := s.Bullets[:0]
	for _, b := range s.Bullets {
		hit := -1
		for i, a := range s.Asteroids {
			if wrappedDist(b.Pos, a.Pos) < a.Size.Radius()+BulletRadius {
				hit = i
				break
			}
		}
		if hit < 0 {
			remaining = append(remaining, b)
			continue
		}
		a := s.Asteroids[hit]
		s.Asteroids = append(s.Asteroids[:hit], s.Asteroids[hit+1:]...)
		born = append(born, s.destroy(a, events)...)
	}
	s.Bullets = remaining
	s.Asteroids = append(s.Asteroids, born...)
}

// destroy suma los puntos con el combo actual, sube el combo y devuelve los fragmentos del asteroide.
func (s *State) destroy(a Asteroid, events *[]Event) []Asteroid {
	s.Score += a.Size.points() * s.Combo
	*events = append(*events, AsteroidDestroyed)
	if s.Combo < MaxCombo {
		s.Combo++
		*events = append(*events, ComboUp)
	}
	s.comboTimer = ComboWindow
	if a.Size == Small {
		return nil
	}
	return []Asteroid{s.newAsteroid(a.Pos, a.Size+1), s.newAsteroid(a.Pos, a.Size+1)}
}

// newAsteroid crea un asteroide con dirección aleatoria; la velocidad crece con el tamaño pequeño y la oleada.
func (s *State) newAsteroid(pos Vec, size Size) Asteroid {
	speed := size.baseSpeed() * (1 + 0.1*float64(s.Wave-1)) * (0.8 + 0.4*s.rng.Float64())
	s.nextID++
	return Asteroid{ID: s.nextID, Pos: pos, Vel: dirFromAngle(s.rng.Float64() * 2 * math.Pi).Scale(speed), Size: size}
}

// resolveShip quita una vida si un asteroide toca la nave (salvo que sea invulnerable).
func (s *State) resolveShip(events *[]Event) {
	if s.Ship.Invulnerable > 0 {
		return
	}
	for _, a := range s.Asteroids {
		if wrappedDist(s.Ship.Pos, a.Pos) < ShipRadius+a.Size.Radius() {
			s.Lives--
			*events = append(*events, ShipDestroyed)
			if s.Lives <= 0 {
				s.Over = true
				*events = append(*events, GameOver)
				return
			}
			s.respawn()
			s.Combo = 1
			return
		}
	}
}

// spawnWave genera los asteroides grandes de la oleada actual, siempre lejos de la nave.
func (s *State) spawnWave() {
	count := min(3+s.Wave, MaxLarge)
	for i := 0; i < count; i++ {
		pos := Vec{s.rng.Float64() * WorldW, s.rng.Float64() * WorldH}
		for try := 0; try < 100 && wrappedDist(pos, s.Ship.Pos) < SafeDistance+Large.Radius(); try++ {
			pos = Vec{s.rng.Float64() * WorldW, s.rng.Float64() * WorldH}
		}
		s.Asteroids = append(s.Asteroids, s.newAsteroid(pos, Large))
	}
}
