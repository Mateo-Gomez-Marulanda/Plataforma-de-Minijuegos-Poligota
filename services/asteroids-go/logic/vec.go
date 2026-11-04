// Vectores 2D y utilidades del mundo envolvente (800 x 600): lo mínimo que necesita la física.
package logic

import "math"

// Vec es un punto o una velocidad en el plano.
type Vec struct{ X, Y float64 }

// Add suma dos vectores.
func (a Vec) Add(b Vec) Vec { return Vec{a.X + b.X, a.Y + b.Y} }

// Scale multiplica el vector por un escalar.
func (a Vec) Scale(k float64) Vec { return Vec{a.X * k, a.Y * k} }

// Len devuelve la longitud del vector.
func (a Vec) Len() float64 { return math.Hypot(a.X, a.Y) }

// dirFromAngle devuelve el vector unitario de un ángulo. Ángulo 0 = hacia arriba, crece en sentido horario.
func dirFromAngle(angle float64) Vec { return Vec{math.Sin(angle), -math.Cos(angle)} }

// wrapCoord devuelve v dentro de [0, max): lo que sale por un borde reaparece por el opuesto.
func wrapCoord(v, max float64) float64 {
	v = math.Mod(v, max)
	if v < 0 {
		v += max
	}
	return v
}

// wrap aplica el envolvimiento a una posición.
func wrap(p Vec) Vec { return Vec{wrapCoord(p.X, WorldW), wrapCoord(p.Y, WorldH)} }

// wrappedDist es la distancia más corta entre dos puntos contando que los bordes se comunican.
func wrappedDist(a, b Vec) float64 {
	dx := math.Abs(a.X - b.X)
	dy := math.Abs(a.Y - b.Y)
	return math.Hypot(math.Min(dx, WorldW-dx), math.Min(dy, WorldH-dy))
}
