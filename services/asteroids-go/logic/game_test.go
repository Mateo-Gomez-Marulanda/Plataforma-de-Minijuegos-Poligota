// Pruebas de la lógica de Asteroids: física, envolvimiento, disparos, división, combo, oleadas, vidas y reproducibilidad.
package logic

import (
	"math"
	"reflect"
	"slices"
	"testing"
)

// vacia crea una partida sin asteroides para probar una regla aislada.
func vacia() *State {
	s := NewGame(1)
	s.Asteroids = nil
	return s
}

// avanzar ejecuta n ticks y junta los eventos.
func avanzar(s *State, n int) []Event {
	var todos []Event
	for i := 0; i < n; i++ {
		todos = append(todos, s.Tick()...)
	}
	return todos
}

// asteroide añade un asteroide quieto y devuelve su posición en la lista.
func asteroide(s *State, pos Vec, size Size) {
	s.nextID++
	s.Asteroids = append(s.Asteroids, Asteroid{ID: s.nextID, Pos: pos, Size: size})
}

func TestPartidaNueva(t *testing.T) {
	s := NewGame(7)
	if s.Lives != 3 || s.Wave != 1 || s.Combo != 1 || s.Score != 0 || s.Over {
		t.Fatalf("estado inicial inesperado: %+v", s)
	}
	if s.Ship.Pos != (Vec{400, 300}) || s.Ship.Invulnerable != Invulnerability {
		t.Fatalf("la nave debe estar en el centro e invulnerable: %+v", s.Ship)
	}
	if len(s.Asteroids) != 4 {
		t.Fatalf("la oleada 1 tiene 4 asteroides grandes, hay %d", len(s.Asteroids))
	}
	for _, a := range s.Asteroids {
		if a.Size != Large || wrappedDist(a.Pos, s.Ship.Pos) < SafeDistance {
			t.Fatalf("asteroide mal colocado: %+v", a)
		}
	}
}

func TestRotacion(t *testing.T) {
	s := vacia()
	s.SetKey(RotateRight, true)
	avanzar(s, 60)
	if math.Abs(s.Ship.Angle-RotationSpeed) > 1e-9 {
		t.Fatalf("tras 1 s a la derecha el ángulo debe ser %v, es %v", RotationSpeed, s.Ship.Angle)
	}
	s.SetKey(RotateRight, false)
	s.SetKey(RotateLeft, true)
	avanzar(s, 60)
	if math.Abs(s.Ship.Angle) > 1e-9 {
		t.Fatalf("girar a la izquierda debe deshacer el giro, ángulo %v", s.Ship.Angle)
	}
}

func TestEmpujeAceleraEnLaDireccionDeLaNave(t *testing.T) {
	s := vacia()
	s.SetKey(Thrust, true)
	avanzar(s, 30)
	if s.Ship.Vel.Y >= 0 || math.Abs(s.Ship.Vel.X) > 1e-9 {
		t.Fatalf("ángulo 0 apunta hacia arriba (Y negativa): %+v", s.Ship.Vel)
	}
	if !s.Ship.Thrusting {
		t.Fatal("thrusting debe ser verdadero mientras se acelera")
	}
}

func TestInerciaYFriccion(t *testing.T) {
	s := vacia()
	s.Ship.Vel = Vec{100, 0}
	avanzar(s, 60)
	if v := s.Ship.Vel.Len(); math.Abs(v-100*Friction) > 1e-6 {
		t.Fatalf("tras 1 s sin empuje queda la fracción %v de la velocidad, hay %v", Friction, v)
	}
	if s.Ship.Pos.X <= 400 {
		t.Fatal("la nave debe seguir avanzando por inercia")
	}
}

func TestVelocidadMaxima(t *testing.T) {
	s := vacia()
	s.SetKey(Thrust, true)
	avanzar(s, 600)
	if v := s.Ship.Vel.Len(); v > MaxShipSpeed+1e-9 {
		t.Fatalf("la velocidad %v supera el máximo %v", v, MaxShipSpeed)
	}
}

func TestMundoEnvolvente(t *testing.T) {
	s := vacia()
	s.Ship.Pos = Vec{WorldW - 1, 1}
	s.Ship.Vel = Vec{200, -200}
	avanzar(s, 10)
	if s.Ship.Pos.X >= 100 || s.Ship.Pos.Y <= WorldH-100 {
		t.Fatalf("la nave debe reaparecer por el borde opuesto: %+v", s.Ship.Pos)
	}
	if got := wrapCoord(-5, WorldW); got != WorldW-5 {
		t.Fatalf("wrapCoord(-5) = %v", got)
	}
}

func TestDistanciaEnvolvente(t *testing.T) {
	if d := wrappedDist(Vec{5, 300}, Vec{795, 300}); math.Abs(d-10) > 1e-9 {
		t.Fatalf("a través del borde la distancia es 10, es %v", d)
	}
	if d := wrappedDist(Vec{5, 5}, Vec{795, 595}); math.Abs(d-math.Hypot(10, 10)) > 1e-9 {
		t.Fatalf("también en diagonal, es %v", d)
	}
}

func TestDisparoHeredaVelocidadYExpira(t *testing.T) {
	s := vacia()
	s.Ship.Vel = Vec{50, 0}
	s.SetKey(Fire, true)
	s.Tick()
	if len(s.Bullets) != 1 {
		t.Fatalf("debe haber 1 bala, hay %d", len(s.Bullets))
	}
	b := s.Bullets[0]
	if b.Vel.X < 40 || b.Vel.Y > -BulletSpeed+1 {
		t.Fatalf("la bala hereda la velocidad de la nave: %+v", b.Vel)
	}
	s.SetKey(Fire, false)
	avanzar(s, int(BulletLife*TickRate)+2)
	if len(s.Bullets) != 0 {
		t.Fatalf("la bala debe expirar tras %v s", BulletLife)
	}
}

func TestEnfriamientoYMaximoDeBalas(t *testing.T) {
	s := vacia()
	s.SetKey(Fire, true)
	avanzar(s, 5) // 5 ticks < enfriamiento (12 ticks): solo 1 bala
	if len(s.Bullets) != 1 {
		t.Fatalf("el enfriamiento limita a 1 bala, hay %d", len(s.Bullets))
	}
	avanzar(s, 60) // con la tecla mantenida nunca pasan de MaxBullets
	if len(s.Bullets) > MaxBullets {
		t.Fatalf("máximo %d balas, hay %d", MaxBullets, len(s.Bullets))
	}
	if len(s.Bullets) != MaxBullets {
		t.Fatalf("disparando sin parar se debe llegar al máximo, hay %d", len(s.Bullets))
	}
}

func TestPulsacionSueltaDuraUnTick(t *testing.T) {
	s := vacia()
	s.Tap(RotateRight)
	avanzar(s, 10)
	if want := RotationSpeed * Dt; math.Abs(s.Ship.Angle-want) > 1e-9 {
		t.Fatalf("un Tap gira exactamente un tick: %v, es %v", want, s.Ship.Angle)
	}
}

func TestBalaDestruyeAsteroideGrandeYLoDivide(t *testing.T) {
	s := vacia()
	asteroide(s, Vec{400, 200}, Large)
	s.Bullets = []Bullet{{Pos: Vec{400, 200}, Life: 1}}
	events := avanzar(s, 1)
	if len(s.Bullets) != 0 {
		t.Fatal("la bala se consume al impactar")
	}
	if len(s.Asteroids) != 2 || s.Asteroids[0].Size != Medium || s.Asteroids[1].Size != Medium {
		t.Fatalf("un grande se divide en dos medianos: %+v", s.Asteroids)
	}
	if s.Score != 20 || s.Combo != 2 {
		t.Fatalf("puntaje %d, combo %d", s.Score, s.Combo)
	}
	if !slices.Contains(events, AsteroidDestroyed) || !slices.Contains(events, ComboUp) {
		t.Fatalf("eventos: %v", events)
	}
}

func TestMedianoSeDivideEnPequenosYPequenoDesaparece(t *testing.T) {
	s := vacia()
	asteroide(s, Vec{100, 100}, Medium)
	s.Bullets = []Bullet{{Pos: Vec{100, 100}, Life: 1}}
	s.Tick()
	if len(s.Asteroids) != 2 || s.Asteroids[0].Size != Small {
		t.Fatalf("un mediano da dos pequeños: %+v", s.Asteroids)
	}
	pequeno := s.Asteroids[0]
	s.Bullets = []Bullet{{Pos: pequeno.Pos.Add(pequeno.Vel.Scale(Dt)), Life: 1}}
	s.Tick()
	if len(s.Asteroids) != 1 {
		t.Fatalf("un pequeño desaparece sin dejar fragmentos: %+v", s.Asteroids)
	}
}

func TestPuntosPorTamanoYCombo(t *testing.T) {
	s := vacia()
	for _, size := range []Size{Small, Medium, Large} {
		asteroide(s, Vec{100, 100}, size)
		s.Bullets = []Bullet{{Pos: Vec{100, 100}, Life: 1}}
		s.Asteroids = s.Asteroids[len(s.Asteroids)-1:] // solo el recién añadido
		s.Tick()
	}
	// pequeño 100 x1 + mediano 50 x2 + grande 20 x3
	if s.Score != 100+100+60 {
		t.Fatalf("puntaje %d, se esperaba 260", s.Score)
	}
}

func TestComboTieneTopeYSeReiniciaPorTiempo(t *testing.T) {
	s := vacia()
	s.Combo = MaxCombo
	s.comboTimer = ComboWindow
	asteroide(s, Vec{100, 100}, Small)
	s.Bullets = []Bullet{{Pos: Vec{100, 100}, Life: 1}}
	s.Tick()
	if s.Combo != MaxCombo {
		t.Fatalf("el combo no pasa de %d: %d", MaxCombo, s.Combo)
	}
	asteroide(s, Vec{700, 500}, Large) // evita que la oleada termine
	events := avanzar(s, int(ComboWindow*TickRate)+1)
	if s.Combo != 1 || !slices.Contains(events, ComboLost) {
		t.Fatalf("a los %v s sin destruir el combo vuelve a x1: combo %d, eventos %v", ComboWindow, s.Combo, events)
	}
}

func TestColisionDeBalaCruzandoElBorde(t *testing.T) {
	s := vacia()
	asteroide(s, Vec{2, 300}, Large)
	s.Bullets = []Bullet{{Pos: Vec{WorldW - 3, 300}, Life: 1}}
	s.Tick()
	if s.Score == 0 {
		t.Fatal("la bala al otro lado del borde debe poder chocar con el asteroide")
	}
}

func TestChoqueConLaNaveCuestaUnaVida(t *testing.T) {
	s := vacia()
	s.Ship.Invulnerable = 0
	s.Ship.Vel = Vec{80, 0}
	asteroide(s, s.Ship.Pos, Medium)
	events := avanzar(s, 1)
	if s.Lives != 2 || !slices.Contains(events, ShipDestroyed) {
		t.Fatalf("vidas %d, eventos %v", s.Lives, events)
	}
	if s.Ship.Pos != (Vec{400, 300}) || s.Ship.Vel != (Vec{}) || s.Ship.Invulnerable != Invulnerability {
		t.Fatalf("la nave reaparece quieta, en el centro e invulnerable: %+v", s.Ship)
	}
}

func TestInvulnerabilidadProtegeYSeAcaba(t *testing.T) {
	s := vacia()
	asteroide(s, s.Ship.Pos, Large)
	avanzar(s, 60)
	if s.Lives != 3 {
		t.Fatal("durante la invulnerabilidad no se pierden vidas")
	}
	avanzar(s, 61)
	if s.Lives != 2 {
		t.Fatalf("tras los %v s el asteroide sí hace daño: vidas %d", Invulnerability, s.Lives)
	}
}

func TestChoqueCruzandoElBorde(t *testing.T) {
	s := vacia()
	s.Ship.Invulnerable = 0
	s.Ship.Pos = Vec{3, 300}
	asteroide(s, Vec{WorldW - 5, 300}, Small)
	avanzar(s, 1)
	if s.Lives != 2 {
		t.Fatal("un asteroide al otro lado del borde debe poder chocar con la nave")
	}
}

func TestSinVidasTerminaLaPartida(t *testing.T) {
	s := vacia()
	s.Lives = 1
	s.Ship.Invulnerable = 0
	asteroide(s, s.Ship.Pos, Large)
	events := avanzar(s, 1)
	if !s.Over || !slices.Contains(events, GameOver) {
		t.Fatalf("over %v, eventos %v", s.Over, events)
	}
	if got := s.Tick(); got != nil {
		t.Fatalf("una partida terminada no avanza: %v", got)
	}
}

func TestOleadaLimpiaGeneraLaSiguiente(t *testing.T) {
	s := vacia()
	asteroide(s, Vec{100, 100}, Small)
	s.Bullets = []Bullet{{Pos: Vec{100, 100}, Life: 1}}
	events := avanzar(s, 1)
	if s.Wave != 2 || !slices.Contains(events, WaveCleared) {
		t.Fatalf("oleada %d, eventos %v", s.Wave, events)
	}
	if len(s.Asteroids) != 5 {
		t.Fatalf("la oleada 2 tiene 5 asteroides grandes, hay %d", len(s.Asteroids))
	}
	for _, a := range s.Asteroids {
		if wrappedDist(a.Pos, s.Ship.Pos) < SafeDistance {
			t.Fatalf("asteroide demasiado cerca de la nave: %+v", a)
		}
	}
}

// superarOleada deja la partida en la oleada n con un solo asteroide pequeño y lo destruye.
func superarOleada(s *State, n int) []Event {
	s.Wave = n
	s.Asteroids = nil
	asteroide(s, Vec{100, 100}, Small)
	s.Bullets = []Bullet{{Pos: Vec{100, 100}, Life: 1}}
	return avanzar(s, 1)
}

func TestVidaExtraCadaCuatroOleadas(t *testing.T) {
	for _, oleada := range []int{4, 8, 12} {
		s := vacia()
		events := superarOleada(s, oleada)
		if s.Lives != StartLives+1 || !slices.Contains(events, ExtraLife) {
			t.Fatalf("al superar la oleada %d se gana una vida: vidas %d, eventos %v", oleada, s.Lives, events)
		}
		if s.Wave != oleada+1 || !slices.Contains(events, WaveCleared) {
			t.Fatalf("la oleada %d debe dar paso a la siguiente: oleada %d, eventos %v", oleada, s.Wave, events)
		}
	}
}

func TestNoHayVidaExtraEnLasDemasOleadas(t *testing.T) {
	for _, oleada := range []int{1, 2, 3, 5, 6, 7, 9} {
		s := vacia()
		events := superarOleada(s, oleada)
		if s.Lives != StartLives || slices.Contains(events, ExtraLife) {
			t.Fatalf("la oleada %d no da vida extra: vidas %d, eventos %v", oleada, s.Lives, events)
		}
	}
}

func TestLasVidasExtraSeAcumulanSobreLasQueQuedan(t *testing.T) {
	s := vacia()
	s.Lives = 1
	superarOleada(s, 4)
	if s.Lives != 2 {
		t.Fatalf("1 vida + extra = 2, hay %d", s.Lives)
	}
	superarOleada(s, 8)
	if s.Lives != 3 {
		t.Fatalf("2 vidas + extra = 3, hay %d", s.Lives)
	}
}

func TestOleadasTienenTope(t *testing.T) {
	s := vacia()
	s.Wave = 50
	s.spawnWave()
	if len(s.Asteroids) != MaxLarge {
		t.Fatalf("tope de %d grandes, hay %d", MaxLarge, len(s.Asteroids))
	}
}

func TestMismaSemillaMismaPartida(t *testing.T) {
	a, b := NewGame(42), NewGame(42)
	for i := 0; i < 600; i++ {
		for _, s := range []*State{a, b} {
			s.SetKey(Thrust, i%90 < 30)
			s.SetKey(RotateRight, i%50 < 20)
			s.SetKey(Fire, true)
			s.Tick()
		}
	}
	if !reflect.DeepEqual(a.Asteroids, b.Asteroids) || a.Score != b.Score || a.Ship != b.Ship {
		t.Fatal("con la misma semilla y las mismas teclas la partida debe ser idéntica")
	}
	if c := NewGame(43); reflect.DeepEqual(c.Asteroids, NewGame(42).Asteroids) {
		t.Fatal("semillas distintas deben dar asteroides distintos")
	}
}
