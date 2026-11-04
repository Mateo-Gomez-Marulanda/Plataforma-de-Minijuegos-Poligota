// Modelo de cartas y valor de una mano. Todo son tipos inmutables y funciones puras.
package com.minijuegos.blackjack.logic

/** Palo de la carta. */
enum class Suit { HEARTS, DIAMONDS, CLUBS, SPADES }

/** Rango de la carta, con el texto que se muestra y su valor base (el As cuenta 1; ver [handValue]). */
enum class Rank(val label: String, val points: Int) {
    ACE("A", 1), TWO("2", 2), THREE("3", 3), FOUR("4", 4), FIVE("5", 5), SIX("6", 6), SEVEN("7", 7),
    EIGHT("8", 8), NINE("9", 9), TEN("10", 10), JACK("J", 10), QUEEN("Q", 10), KING("K", 10),
}

data class Card(val rank: Rank, val suit: Suit)

/** Valor de una mano: el mejor total sin pasarse y si es *suave* (cuenta un As como 11). */
data class HandValue(val total: Int, val soft: Boolean)

/** Suma los Ases como 1 y, si hay alguno y sumar 10 no pasa de 21, uno de ellos cuenta 11 (mano suave). */
fun handValue(cards: List<Card>): HandValue {
    val hard = cards.sumOf { it.rank.points }
    val canUpgradeAce = cards.any { it.rank == Rank.ACE } && hard + 10 <= 21
    return if (canUpgradeAce) HandValue(hard + 10, soft = true) else HandValue(hard, soft = false)
}

/** Blackjack natural: exactamente dos cartas que suman 21 (As y una carta de valor 10). */
fun isNatural(cards: List<Card>): Boolean = cards.size == 2 && handValue(cards).total == 21
