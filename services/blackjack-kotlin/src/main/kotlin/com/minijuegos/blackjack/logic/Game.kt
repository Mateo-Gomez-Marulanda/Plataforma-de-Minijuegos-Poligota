// Reglas de Blackjack: máquina de estados de la ronda (apuesta -> turno del jugador -> crupier -> liquidación).
// Es lógica pura: cada acción recibe un estado y devuelve otro nuevo (o un error), sin tocar el original.
package com.minijuegos.blackjack.logic

import kotlin.random.Random

const val STARTING_CHIPS = 1000
const val MIN_BET = 10
const val MAX_BET = 500

/** Fichas mínimas al terminar una ronda: si el jugador queda por debajo, se le sube a esta cantidad (nunca se queda sin juego). */
const val MIN_CHIPS = 50

// Constante de Weyl para derivar una semilla distinta en cada barajado a partir de la semilla de la partida.
private const val SEED_STEP = -7046029254386353131L

/** Resultado de una mano al liquidar la ronda. */
enum class HandResult { BLACKJACK, WIN, PUSH, LOSE, BUST }

/** Fase de la ronda. Al ser una jerarquía cerrada, todo `when` sobre ella debe cubrir los cuatro casos. */
sealed interface Phase {
    data object Betting : Phase
    data class PlayerTurn(val activeHand: Int) : Phase
    data object DealerTurn : Phase
    data class RoundOver(val results: List<HandResult>) : Phase
}

/** Una mano del jugador. `finished` es verdadero cuando ya no puede recibir más cartas. */
data class Hand(
    val cards: List<Card>,
    val bet: Int,
    val fromSplit: Boolean = false,
    val finished: Boolean = false,
) {
    val value: HandValue get() = handValue(cards)
    val isBust: Boolean get() = value.total > 21

    /** Una mano dividida nunca cuenta como Blackjack, aunque sea As + 10. */
    val isBlackjack: Boolean get() = !fromSplit && isNatural(cards)
}

/** Estado completo de una sesión. La semilla y el contador de barajados hacen reproducible cada zapato. */
data class GameState(
    val chips: Int,
    val phase: Phase,
    val dealer: List<Card>,
    val hands: List<Hand>,
    val shoe: Shoe,
    val seed: Long,
    val shuffles: Int,
)

/** Acciones del jugador. */
sealed interface Action {
    data class Bet(val amount: Int) : Action
    data object Hit : Action
    data object Stand : Action
    data object Double : Action
    data object Split : Action
    data object NextRound : Action
}

/** Tipos de acción, para informar al cliente de cuáles puede usar en cada momento. */
enum class ActionType { BET, HIT, STAND, DOUBLE, SPLIT, NEXT_ROUND }

/** Acción rechazada por las reglas. Viaja dentro de un [Result] fallido; nunca se lanza desde la lógica. */
class InvalidMove(message: String) : Exception(message)

/** Crea una sesión nueva en fase de apuesta, con el zapato barajado según la semilla. */
fun newGame(seed: Long, chips: Int = STARTING_CHIPS): GameState =
    GameState(chips, Phase.Betting, emptyList(), emptyList(), Shoe.shuffled(shoeRandom(seed, 0)), seed, 0)

/** Aplica una acción: devuelve el estado nuevo o un [InvalidMove] si no es válida en este momento. */
fun applyAction(state: GameState, action: Action): Result<GameState> = when (action) {
    is Action.Bet -> bet(state, action.amount)
    Action.Hit -> hit(state)
    Action.Stand -> stand(state)
    Action.Double -> double(state)
    Action.Split -> split(state)
    Action.NextRound -> nextRound(state)
}

/** Acciones válidas ahora mismo (el frontend las usa para habilitar botones sin conocer las reglas). */
fun allowedActions(state: GameState): List<ActionType> = when (val phase = state.phase) {
    Phase.Betting -> listOf(ActionType.BET)
    is Phase.PlayerTurn -> buildList {
        add(ActionType.HIT)
        add(ActionType.STAND)
        if (canDouble(state, phase)) add(ActionType.DOUBLE)
        if (canSplit(state, phase)) add(ActionType.SPLIT)
    }
    Phase.DealerTurn -> emptyList()
    is Phase.RoundOver -> listOf(ActionType.NEXT_ROUND)
}

// ---------- Acciones ----------

private fun fail(message: String): Result<GameState> = Result.failure(InvalidMove(message))

private fun ok(state: GameState): Result<GameState> = Result.success(state)

// Apuesta: descuenta las fichas, rebaraja si hace falta y reparte (jugador, crupier, jugador, crupier).
private fun bet(state: GameState, amount: Int): Result<GameState> {
    if (state.phase != Phase.Betting) return fail("Solo se puede apostar al inicio de la ronda")
    if (amount !in MIN_BET..MAX_BET) return fail("La apuesta debe estar entre $MIN_BET y $MAX_BET fichas")
    if (amount > state.chips) return fail("No tienes fichas suficientes para apostar $amount")
    val (p1, s1) = reshuffleIfNeeded(state).draw()
    val (d1, s2) = s1.draw()
    val (p2, s3) = s2.draw()
    val (d2, s4) = s3.draw()
    val dealt = s4.copy(
        chips = state.chips - amount,
        phase = Phase.PlayerTurn(0),
        dealer = listOf(d1, d2),
        hands = listOf(Hand(listOf(p1, p2), amount)),
    )
    // Si alguno tiene Blackjack natural la ronda termina de inmediato, sin turno del jugador.
    return ok(if (isNatural(dealt.dealer) || dealt.hands[0].isBlackjack) settle(dealt) else dealt)
}

// Pedir carta: si la mano se pasa o llega a 21 se planta sola.
private fun hit(state: GameState): Result<GameState> = withActiveHand(state) { index, hand ->
    val (card, drawn) = state.draw()
    val cards = hand.cards + card
    ok(drawn.withHand(index, hand.copy(cards = cards, finished = handValue(cards).total >= 21)).moveOn())
}

// Plantarse: la mano deja de recibir cartas.
private fun stand(state: GameState): Result<GameState> = withActiveHand(state) { index, hand ->
    ok(state.withHand(index, hand.copy(finished = true)).moveOn())
}

// Doblar: solo con dos cartas y fichas para igualar la apuesta; una única carta y la mano se planta.
private fun double(state: GameState): Result<GameState> = withActiveHand(state) { index, hand ->
    when {
        hand.cards.size != 2 -> return@withActiveHand fail("Solo se puede doblar con las dos primeras cartas")
        state.chips < hand.bet -> return@withActiveHand fail("No tienes fichas suficientes para doblar")
    }
    val (card, drawn) = state.draw()
    val doubled = hand.copy(cards = hand.cards + card, bet = hand.bet * 2, finished = true)
    ok(drawn.copy(chips = state.chips - hand.bet).withHand(index, doubled).moveOn())
}

// Dividir: una sola vez, con dos cartas del mismo rango y fichas para una segunda apuesta igual.
private fun split(state: GameState): Result<GameState> = withActiveHand(state) { _, hand ->
    when {
        state.hands.size != 1 -> return@withActiveHand fail("Solo se puede dividir una vez")
        hand.cards.size != 2 || hand.cards[0].rank != hand.cards[1].rank ->
            return@withActiveHand fail("Para dividir hacen falta dos cartas del mismo rango")
        state.chips < hand.bet -> return@withActiveHand fail("No tienes fichas suficientes para dividir")
    }
    val aces = hand.cards[0].rank == Rank.ACE
    val (c1, s1) = state.draw()
    val (c2, s2) = s1.draw()
    // Cada mano nueva recibe una carta. Los Ases divididos no pueden pedir más; un 21 tampoco necesita hacerlo.
    fun newHand(first: Card, second: Card): Hand {
        val cards = listOf(first, second)
        return Hand(cards, hand.bet, fromSplit = true, finished = aces || handValue(cards).total == 21)
    }
    ok(s2.copy(chips = state.chips - hand.bet, hands = listOf(newHand(hand.cards[0], c1), newHand(hand.cards[1], c2))).moveOn())
}

// Nueva ronda: vuelve a la fase de apuesta.
private fun nextRound(state: GameState): Result<GameState> =
    if (state.phase is Phase.RoundOver) ok(state.copy(phase = Phase.Betting, dealer = emptyList(), hands = emptyList()))
    else fail("La ronda todavía no ha terminado")

// ---------- Validaciones compartidas ----------

private fun canDouble(state: GameState, phase: Phase.PlayerTurn): Boolean {
    val hand = state.hands[phase.activeHand]
    return hand.cards.size == 2 && state.chips >= hand.bet
}

private fun canSplit(state: GameState, phase: Phase.PlayerTurn): Boolean {
    val hand = state.hands[phase.activeHand]
    return state.hands.size == 1 && hand.cards.size == 2 && hand.cards[0].rank == hand.cards[1].rank &&
        state.chips >= hand.bet
}

// Ejecuta una acción sobre la mano activa; falla si no es el turno del jugador.
private fun withActiveHand(state: GameState, block: (Int, Hand) -> Result<GameState>): Result<GameState> {
    val phase = state.phase as? Phase.PlayerTurn ?: return fail("Ahora no es el turno del jugador")
    return block(phase.activeHand, state.hands[phase.activeHand])
}

private fun GameState.withHand(index: Int, hand: Hand): GameState =
    copy(hands = hands.mapIndexed { i, h -> if (i == index) hand else h })

// Reparte la siguiente carta del zapato.
private fun GameState.draw(): Pair<Card, GameState> {
    val (card, rest) = shoe.draw()
    return card to copy(shoe = rest)
}

// Al empezar la ronda, si ya se usó el 75 % del zapato se baraja uno nuevo (con una semilla derivada).
private fun reshuffleIfNeeded(state: GameState): GameState {
    if (!state.shoe.needsShuffle) return state
    val shuffles = state.shuffles + 1
    return state.copy(shoe = Shoe.shuffled(shoeRandom(state.seed, shuffles)), shuffles = shuffles)
}

private fun shoeRandom(seed: Long, shuffles: Int) = Random(seed xor (shuffles * SEED_STEP))

// ---------- Fin de la ronda ----------

// Pasa a la mano siguiente sin terminar o, si ya no quedan, juega el crupier.
private fun GameState.moveOn(): GameState {
    val next = hands.indexOfFirst { !it.finished }
    return if (next >= 0) copy(phase = Phase.PlayerTurn(next)) else playDealer()
}

// Turno del crupier (S17): pide hasta llegar a 17 y se planta en cualquier 17, también en el suave.
// Si todas las manos del jugador se pasaron, no necesita pedir.
private fun GameState.playDealer(): GameState {
    var current = copy(phase = Phase.DealerTurn)
    if (hands.all { it.isBust }) return settle(current)
    while (handValue(current.dealer).total < 17) {
        val (card, next) = current.draw()
        current = next.copy(dealer = next.dealer + card)
    }
    return settle(current)
}

// Calcula el resultado de cada mano, paga y termina la ronda. Las fichas nunca quedan por debajo de MIN_CHIPS al terminar.
private fun settle(state: GameState): GameState {
    val results = state.hands.map { result(it, state.dealer) }
    val winnings = state.hands.zip(results).sumOf { (hand, result) -> payout(hand.bet, result) }
    return state.copy(chips = maxOf(state.chips + winnings, MIN_CHIPS), phase = Phase.RoundOver(results))
}

private fun result(hand: Hand, dealer: List<Card>): HandResult {
    val dealerTotal = handValue(dealer).total
    return when {
        hand.isBust -> HandResult.BUST
        hand.isBlackjack -> if (isNatural(dealer)) HandResult.PUSH else HandResult.BLACKJACK
        isNatural(dealer) -> HandResult.LOSE
        dealerTotal > 21 -> HandResult.WIN
        hand.value.total > dealerTotal -> HandResult.WIN
        hand.value.total == dealerTotal -> HandResult.PUSH
        else -> HandResult.LOSE
    }
}

// Fichas que vuelven al jugador: la apuesta ya estaba descontada, así que una victoria devuelve el doble
// y el Blackjack natural paga 3:2 (la mitad de la apuesta se redondea hacia abajo).
private fun payout(bet: Int, result: HandResult): Int = when (result) {
    HandResult.BLACKJACK -> bet + bet * 3 / 2
    HandResult.WIN -> bet * 2
    HandResult.PUSH -> bet
    HandResult.LOSE, HandResult.BUST -> 0
}
