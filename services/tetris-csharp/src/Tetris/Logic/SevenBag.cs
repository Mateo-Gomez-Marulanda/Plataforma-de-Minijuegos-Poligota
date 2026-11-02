// Generador de piezas "bolsa de 7": se barajan las siete piezas y se reparten todas antes de volver a barajar.
// Así nunca hay rachas largas sin ver una pieza.
using System.Collections.Immutable;

namespace Tetris.Logic;

/// <summary>Reparto de piezas por bolsas de siete.</summary>
public static class SevenBag
{
    /// <summary>Una bolsa nueva: las siete piezas en orden aleatorio (Fisher-Yates), y el generador resultante.</summary>
    public static (ImmutableList<Tetromino> Bag, Rng Rng) Generate(Rng rng)
    {
        var piezas = Enum.GetValues<Tetromino>();
        for (int i = piezas.Length - 1; i > 0; i--)
        {
            (int j, rng) = rng.NextInt(i + 1);
            (piezas[i], piezas[j]) = (piezas[j], piezas[i]);
        }
        return (piezas.ToImmutableList(), rng);
    }
}
