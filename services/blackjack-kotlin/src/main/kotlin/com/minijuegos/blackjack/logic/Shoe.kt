// El zapato: seis mazos barajados de los que se reparten las cartas en orden.
package com.minijuegos.blackjack.logic

import kotlin.random.Random

const val DECKS = 6

/**
 * Las cartas del zapato y cuántas se han repartido. Es inmutable: [draw] devuelve la carta y un zapato nuevo
 * (la lista de cartas se comparte; solo avanza la posición).
 */
data class Shoe(val cards: List<Card>, val position: Int = 0) {
    /** Cartas que quedan por repartir. */
    val remaining: Int get() = cards.size - position

    /** Verdadero cuando ya se repartió el 75 % o más de las cartas: hay que rebarajar al empezar la ronda. */
    val needsShuffle: Boolean get() = position * 4 >= cards.size * 3

    /** Reparte la siguiente carta. */
    fun draw(): Pair<Card, Shoe> = cards[position] to copy(position = position + 1)

    companion object {
        /** Seis mazos completos barajados con Fisher-Yates (`shuffled` de la librería estándar) usando [random]. */
        fun shuffled(random: Random): Shoe {
            val deck = Suit.entries.flatMap { suit -> Rank.entries.map { rank -> Card(rank, suit) } }
            return Shoe(List(DECKS) { deck }.flatten().shuffled(random))
        }
    }
}
