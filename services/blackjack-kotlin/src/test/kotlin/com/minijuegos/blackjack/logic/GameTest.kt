// Pruebas de la lógica de Blackjack: valor de manos, zapato, reparto, liquidación y los casos límite de las reglas.
// Para controlar las cartas se amaña el zapato: el orden de reparto es jugador, crupier, jugador, crupier y luego las pedidas.
package com.minijuegos.blackjack.logic

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

// Carta por su texto ("A", "K", "7"...). El palo da igual salvo en las pruebas que lo miran.
private fun c(label: String, suit: Suit = Suit.HEARTS) = Card(Rank.entries.first { it.label == label }, suit)

private fun cards(vararg labels: String) = labels.map { c(it) }

// Sesión nueva con el zapato amañado: primero salen las cartas indicadas y después, de relleno, doses.
private fun rigged(vararg labels: String, chips: Int = STARTING_CHIPS): GameState =
    newGame(seed = 1, chips = chips).copy(shoe = Shoe(cards(*labels) + List(60) { c("2") }))

private fun GameState.act(action: Action): GameState = applyAction(this, action).getOrThrow()

private fun GameState.fails(action: Action): String = applyAction(this, action).exceptionOrNull()!!.also { assertIs<InvalidMove>(it) }.message!!

private fun GameState.results() = (phase as Phase.RoundOver).results

// ---------- Valor de la mano ----------

class HandValueTest {
    @Test fun `un As y un seis es un 17 suave`() = assertEquals(HandValue(17, soft = true), handValue(cards("A", "6")))

    @Test fun `un As con un total que se pasaria cuenta 1 y la mano deja de ser suave`() =
        assertEquals(HandValue(17, soft = false), handValue(cards("A", "6", "10")))

    @Test fun `A mas A mas 9 vale 21`() = assertEquals(HandValue(21, soft = true), handValue(cards("A", "A", "9")))

    @Test fun `varios Ases solo cuentan 11 uno de ellos`() = assertEquals(HandValue(12, soft = true), handValue(cards("A", "A")))

    @Test fun `las figuras valen 10`() = assertEquals(20, handValue(cards("K", "Q")).total)

    @Test fun `solo dos cartas que suman 21 son Blackjack natural`() {
        assertTrue(isNatural(cards("A", "K")))
        assertFalse(isNatural(cards("7", "7", "7")))
    }
}

// ---------- Zapato ----------

class ShoeTest {
    @Test fun `el zapato tiene seis mazos completos`() {
        val shoe = Shoe.shuffled(kotlin.random.Random(1))
        assertEquals(312, shoe.cards.size)
        assertTrue(Rank.entries.all { rank -> shoe.cards.count { it.rank == rank } == 24 })
        assertTrue(Suit.entries.all { suit -> shoe.cards.count { it.suit == suit } == 78 })
    }

    @Test fun `la misma semilla da el mismo orden y otra semilla uno distinto`() {
        assertEquals(newGame(5).shoe, newGame(5).shoe)
        assertNotEquals(newGame(5).shoe, newGame(6).shoe)
    }

    @Test fun `pide rebarajar al repartir el 75 por ciento`() {
        val shoe = newGame(1).shoe
        assertFalse(shoe.copy(position = 233).needsShuffle)
        assertTrue(shoe.copy(position = 234).needsShuffle)
    }

    @Test fun `repartir una carta no modifica el zapato original`() {
        val shoe = newGame(1).shoe
        val (card, rest) = shoe.draw()
        assertEquals(0, shoe.position)
        assertEquals(1, rest.position)
        assertEquals(shoe.cards[0], card)
    }
}

// ---------- Apuestas y reparto ----------

class BetTest {
    @Test fun `la sesion empieza en apuesta con 1000 fichas`() {
        val state = newGame(1)
        assertEquals(Phase.Betting, state.phase)
        assertEquals(1000, state.chips)
        assertEquals(listOf(ActionType.BET), allowedActions(state))
    }

    @Test fun `rechaza apuestas fuera de los limites`() {
        val state = newGame(1)
        state.fails(Action.Bet(9))
        state.fails(Action.Bet(501))
        state.fails(Action.Bet(0))
        state.fails(Action.Bet(-50))
    }

    @Test fun `no se puede apostar mas fichas de las que se tienen`() {
        newGame(1, chips = 100).fails(Action.Bet(150))
    }

    @Test fun `apostar descuenta las fichas y reparte jugador crupier jugador crupier`() {
        val state = rigged("10", "9", "6", "7", "K").act(Action.Bet(100))
        assertEquals(900, state.chips)
        assertEquals(Phase.PlayerTurn(0), state.phase)
        assertEquals(cards("10", "6"), state.hands[0].cards)
        assertEquals(100, state.hands[0].bet)
        assertEquals(cards("9", "7"), state.dealer)
    }

    @Test fun `no se puede apostar fuera de la fase de apuesta`() {
        rigged("10", "9", "6", "7").act(Action.Bet(50)).fails(Action.Bet(50))
    }

    @Test fun `al repartir el 75 por ciento del zapato se rebaraja con otra semilla`() {
        val base = newGame(1)
        val used = base.copy(shoe = base.shoe.copy(position = 240))
        val state = used.act(Action.Bet(10))
        assertEquals(1, state.shuffles)
        assertEquals(4, state.shoe.position)
        assertNotEquals(base.shoe, state.shoe)
    }

    @Test fun `por debajo del 75 por ciento no se rebaraja`() {
        val base = newGame(1)
        val state = base.copy(shoe = base.shoe.copy(position = 100)).act(Action.Bet(10))
        assertEquals(0, state.shuffles)
        assertEquals(104, state.shoe.position)
    }
}

// ---------- Blackjack natural ----------

class NaturalTest {
    @Test fun `el Blackjack natural termina la ronda y paga 3 a 2`() {
        val state = rigged("A", "5", "K", "6").act(Action.Bet(100))
        assertEquals(listOf(HandResult.BLACKJACK), state.results())
        assertEquals(1150, state.chips)
    }

    @Test fun `la mitad de una apuesta impar se redondea hacia abajo`() {
        assertEquals(1022, rigged("A", "5", "K", "6").act(Action.Bet(15)).chips)
    }

    @Test fun `un 21 con tres cartas no es Blackjack y paga 1 a 1`() {
        val state = rigged("5", "9", "6", "7", "K", "10").act(Action.Bet(100)).act(Action.Hit)
        assertEquals(listOf(HandResult.WIN), state.results())
        assertEquals(1100, state.chips)
    }

    @Test fun `si el crupier tiene Blackjack la ronda termina y el jugador pierde`() {
        val state = rigged("10", "A", "9", "K").act(Action.Bet(100))
        assertEquals(listOf(HandResult.LOSE), state.results())
        assertEquals(900, state.chips)
    }

    @Test fun `si los dos tienen Blackjack es empate`() {
        val state = rigged("A", "A", "K", "K").act(Action.Bet(100))
        assertEquals(listOf(HandResult.PUSH), state.results())
        assertEquals(1000, state.chips)
    }
}

// ---------- Turno del jugador y del crupier ----------

class PlayTest {
    @Test fun `pasarse de 21 pierde y el crupier no pide cartas`() {
        val state = rigged("10", "9", "6", "7", "K").act(Action.Bet(100)).act(Action.Hit)
        assertEquals(listOf(HandResult.BUST), state.results())
        assertEquals(2, state.dealer.size)
        assertEquals(900, state.chips)
    }

    @Test fun `al llegar a 21 la mano se planta sola`() {
        val state = rigged("5", "9", "6", "7", "10", "10").act(Action.Bet(100)).act(Action.Hit)
        assertIs<Phase.RoundOver>(state.phase)
    }

    @Test fun `el crupier se planta en un 17 suave`() {
        val state = rigged("10", "A", "9", "6").act(Action.Bet(100)).act(Action.Stand)
        assertEquals(2, state.dealer.size)
        assertEquals(listOf(HandResult.WIN), state.results())
    }

    @Test fun `el crupier pide con 16 hasta pasar de 16`() {
        val state = rigged("10", "10", "9", "6", "4").act(Action.Bet(100)).act(Action.Stand)
        assertEquals(cards("10", "6", "4"), state.dealer)
        assertEquals(listOf(HandResult.LOSE), state.results())
    }

    @Test fun `si el crupier se pasa el jugador gana`() {
        val state = rigged("10", "10", "9", "6", "K").act(Action.Bet(100)).act(Action.Stand)
        assertEquals(listOf(HandResult.WIN), state.results())
        assertEquals(1100, state.chips)
    }

    @Test fun `con el mismo total es empate y se devuelve la apuesta`() {
        val state = rigged("10", "10", "9", "9").act(Action.Bet(100)).act(Action.Stand)
        assertEquals(listOf(HandResult.PUSH), state.results())
        assertEquals(1000, state.chips)
    }

    @Test fun `pedir o plantarse fuera del turno del jugador es invalido`() {
        newGame(1).fails(Action.Hit)
        newGame(1).fails(Action.Stand)
        rigged("A", "5", "K", "6").act(Action.Bet(100)).fails(Action.Hit)
    }
}

// ---------- Doblar ----------

class DoubleTest {
    @Test fun `doblar duplica la apuesta, da una sola carta y planta la mano`() {
        val state = rigged("5", "9", "6", "7", "K", "10").act(Action.Bet(100)).act(Action.Double)
        assertEquals(cards("5", "6", "K"), state.hands[0].cards)
        assertEquals(200, state.hands[0].bet)
        assertEquals(listOf(HandResult.WIN), state.results())
        assertEquals(1200, state.chips) // 1000 - 100 - 100 + 400
    }

    @Test fun `solo se puede doblar con las dos primeras cartas`() {
        val state = rigged("2", "9", "3", "7", "2").act(Action.Bet(50)).act(Action.Hit)
        assertFalse(ActionType.DOUBLE in allowedActions(state))
        state.fails(Action.Double)
    }

    @Test fun `no se puede doblar sin fichas para igualar la apuesta`() {
        val state = rigged("5", "9", "6", "7", chips = 150).act(Action.Bet(100))
        assertFalse(ActionType.DOUBLE in allowedActions(state))
        assertEquals("No tienes fichas suficientes para doblar", state.fails(Action.Double))
    }

    @Test fun `doblar y pasarse pierde la apuesta doble`() {
        val state = rigged("10", "9", "6", "7", "K").act(Action.Bet(100)).act(Action.Double)
        assertEquals(listOf(HandResult.BUST), state.results())
        assertEquals(800, state.chips)
    }
}

// ---------- Dividir ----------

class SplitTest {
    @Test fun `dividir crea dos manos con la misma apuesta y una carta nueva cada una`() {
        val state = rigged("8", "9", "8", "7", "3", "4").act(Action.Bet(100)).act(Action.Split)
        assertEquals(800, state.chips)
        assertEquals(listOf(cards("8", "3"), cards("8", "4")), state.hands.map { it.cards })
        assertEquals(listOf(100, 100), state.hands.map { it.bet })
        assertEquals(Phase.PlayerTurn(0), state.phase)
    }

    @Test fun `la segunda mano se juega despues de plantarse en la primera`() {
        val state = rigged("8", "9", "8", "7", "3", "4").act(Action.Bet(100)).act(Action.Split).act(Action.Stand)
        assertEquals(Phase.PlayerTurn(1), state.phase)
    }

    @Test fun `hacen falta dos cartas del mismo rango, no del mismo valor`() {
        val state = rigged("K", "9", "Q", "7").act(Action.Bet(100))
        assertFalse(ActionType.SPLIT in allowedActions(state))
        state.fails(Action.Split)
    }

    @Test fun `solo se puede dividir una vez`() {
        val state = rigged("8", "9", "8", "7", "8", "4").act(Action.Bet(100)).act(Action.Split)
        assertFalse(ActionType.SPLIT in allowedActions(state))
        state.fails(Action.Split)
    }

    @Test fun `no se puede dividir sin fichas para la segunda apuesta`() {
        val state = rigged("8", "9", "8", "7", chips = 150).act(Action.Bet(100))
        assertFalse(ActionType.SPLIT in allowedActions(state))
        state.fails(Action.Split)
    }

    @Test fun `los Ases divididos reciben una carta cada uno y no pueden pedir mas`() {
        val state = rigged("A", "9", "A", "7", "K", "5", "10").act(Action.Bet(100)).act(Action.Split)
        assertEquals(listOf(cards("A", "K"), cards("A", "5")), state.hands.map { it.cards })
        assertIs<Phase.RoundOver>(state.phase) // las dos manos quedaron terminadas y el crupier jugó
    }

    @Test fun `un As mas 10 tras dividir es 21 pero no Blackjack`() {
        val state = rigged("A", "9", "A", "7", "K", "5", "10").act(Action.Bet(100)).act(Action.Split)
        assertEquals(listOf(HandResult.WIN, HandResult.WIN), state.results())
        assertEquals(1200, state.chips) // 1000 - 200 + 2 * 200
    }

    @Test fun `se puede doblar despues de dividir`() {
        val state = rigged("8", "9", "8", "7", "3", "2", "K").act(Action.Bet(100)).act(Action.Split).act(Action.Double)
        assertEquals(200, state.hands[0].bet)
        assertEquals(cards("8", "3", "K"), state.hands[0].cards)
        assertEquals(700, state.chips)
        assertEquals(Phase.PlayerTurn(1), state.phase)
    }

    @Test fun `con las dos manos pasadas el crupier no pide cartas`() {
        val state = rigged("10", "9", "10", "7", "5", "6", "K", "K").act(Action.Bet(100)).act(Action.Split)
            .act(Action.Hit).act(Action.Hit)
        assertEquals(listOf(HandResult.BUST, HandResult.BUST), state.results())
        assertEquals(2, state.dealer.size)
    }
}

// ---------- Rondas y fin de la sesión ----------

class SessionTest {
    @Test fun `tras la liquidacion se puede empezar otra ronda`() {
        val over = rigged("10", "10", "9", "9").act(Action.Bet(100)).act(Action.Stand)
        assertEquals(listOf(ActionType.NEXT_ROUND), allowedActions(over))
        val next = over.act(Action.NextRound)
        assertEquals(Phase.Betting, next.phase)
        assertTrue(next.hands.isEmpty() && next.dealer.isEmpty())
        assertEquals(1000, next.chips)
    }

    @Test fun `no se puede pasar a otra ronda antes de que termine la actual`() {
        newGame(1).fails(Action.NextRound)
        rigged("10", "9", "6", "7").act(Action.Bet(10)).fails(Action.NextRound)
    }

    @Test fun `perder con pocas fichas deja el minimo de 50 y se puede seguir jugando`() {
        val state = rigged("10", "10", "6", "9", chips = 10).act(Action.Bet(10)).act(Action.Stand)
        assertEquals(listOf(HandResult.LOSE), state.results())
        assertEquals(MIN_CHIPS, state.chips)
        assertEquals(listOf(ActionType.NEXT_ROUND), allowedActions(state))
        assertEquals(Phase.Betting, state.act(Action.NextRound).phase)
    }

    @Test fun `perder una apuesta grande deja el minimo en lugar de dejar el resto`() {
        // 120 - 100 apostados = 20, que queda por debajo del minimo.
        assertEquals(MIN_CHIPS, rigged("10", "10", "6", "9", chips = 120).act(Action.Bet(100)).act(Action.Stand).chips)
    }

    @Test fun `por encima del minimo se conserva lo que queda`() {
        // 200 - 100 apostados = 100, por encima del minimo: no se toca.
        assertEquals(100, rigged("10", "10", "6", "9", chips = 200).act(Action.Bet(100)).act(Action.Stand).chips)
    }

    @Test fun `ganar no se ve afectado por el minimo`() {
        assertEquals(110, rigged("10", "10", "9", "6", "K", chips = 100).act(Action.Bet(10)).act(Action.Stand).chips) // 90 + 20
    }

    @Test fun `durante la ronda las fichas apostadas si se descuentan y el minimo solo se aplica al terminar`() {
        val state = rigged("10", "9", "6", "7", chips = 100).act(Action.Bet(100))
        assertEquals(0, state.chips)
        assertIs<Phase.PlayerTurn>(state.phase)
    }

    @Test fun `perder varias rondas seguidas nunca baja del minimo`() {
        var state = rigged("10", "10", "6", "9", "10", "10", "6", "9", "10", "10", "6", "9", chips = 50)
        repeat(3) {
            state = state.act(Action.Bet(50)).act(Action.Stand)
            assertEquals(MIN_CHIPS, state.chips)
            state = state.act(Action.NextRound)
        }
    }

    @Test fun `las acciones permitidas dependen de la fase`() {
        val turn = rigged("8", "9", "8", "7").act(Action.Bet(100))
        assertEquals(listOf(ActionType.HIT, ActionType.STAND, ActionType.DOUBLE, ActionType.SPLIT), allowedActions(turn))
    }

    @Test fun `una accion no cambia el estado original`() {
        val before = rigged("10", "9", "6", "7")
        before.act(Action.Bet(100))
        assertEquals(Phase.Betting, before.phase)
        assertEquals(1000, before.chips)
        assertEquals(0, before.shoe.position)
    }

    @Test fun `con la misma semilla las rondas son identicas`() {
        val a = newGame(42).act(Action.Bet(50)).act(Action.Stand)
        val b = newGame(42).act(Action.Bet(50)).act(Action.Stand)
        assertEquals(a, b)
    }
}
