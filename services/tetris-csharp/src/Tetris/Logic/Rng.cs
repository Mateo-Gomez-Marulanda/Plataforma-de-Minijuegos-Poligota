// Generador de números pseudoaleatorios puro (SplitMix64): su estado es un valor, así que el juego
// entero sigue siendo una función del estado anterior y se puede reproducir con una semilla.
namespace Tetris.Logic;

/// <summary>Estado de un generador aleatorio. Pedir un número devuelve también el generador siguiente.</summary>
public readonly record struct Rng(ulong State)
{
    /// <summary>Generador a partir de una semilla.</summary>
    public static Rng FromSeed(int seed) => new((ulong)seed);

    /// <summary>Número entre 0 (incluido) y `bound` (excluido), más el generador para el siguiente.</summary>
    public (int Value, Rng Next) NextInt(int bound)
    {
        unchecked
        {
            ulong estado = State + 0x9E3779B97F4A7C15UL;
            ulong z = estado;
            z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
            z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
            z ^= z >> 31;
            return ((int)(z % (ulong)bound), new Rng(estado));
        }
    }
}
