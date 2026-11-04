// Traduce un GameState al JSON del contrato (sección 4.1 del diseño). Es el único sitio que decide qué ve el cliente:
// la carta oculta del crupier nunca sale del servidor mientras el jugador no haya terminado su turno.
package com.minijuegos.blackjack.server

import com.minijuegos.blackjack.logic.ActionType
import com.minijuegos.blackjack.logic.Card
import com.minijuegos.blackjack.logic.GameState
import com.minijuegos.blackjack.logic.Hand
import com.minijuegos.blackjack.logic.MAX_BET
import com.minijuegos.blackjack.logic.MIN_BET
import com.minijuegos.blackjack.logic.Phase
import com.minijuegos.blackjack.logic.allowedActions
import com.minijuegos.blackjack.logic.handValue
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Nombre de cada acción tal como viaja en el contrato (`type` de las acciones y `allowedActions`). */
fun ActionType.wireName(): String = name.lowercase()

/** Estado completo de la partida `id` en el formato del contrato. */
fun present(id: String, state: GameState): JsonObject = buildJsonObject {
    put("id", id)
    put("game", "blackjack")
    put("status", "playing") // la sesión no termina: las fichas nunca bajan de MIN_CHIPS al acabar una ronda
    put("board", JsonNull)
    put("data", data(state))
    put("message", JsonNull)
}

private fun data(state: GameState): JsonObject = buildJsonObject {
    put("phase", phaseName(state.phase))
    put("chips", state.chips)
    put("minBet", MIN_BET)
    put("maxBet", MAX_BET)
    put("dealer", dealer(state))
    put("hands", JsonArray(state.hands.mapIndexed { i, hand -> hand(hand, state.phase, i) }))
    put("activeHand", (state.phase as? Phase.PlayerTurn)?.let { JsonPrimitive(it.activeHand) } ?: JsonNull)
    put("allowedActions", JsonArray(allowedActions(state).map { JsonPrimitive(it.wireName()) }))
}

private fun phaseName(phase: Phase): String = when (phase) {
    Phase.Betting -> "betting"
    is Phase.PlayerTurn -> "player_turn"
    Phase.DealerTurn -> "dealer_turn"
    is Phase.RoundOver -> "round_over"
}

// Mientras el jugador juega, el crupier solo enseña su primera carta; la segunda va como {"hidden": true}.
private fun dealer(state: GameState): JsonObject = buildJsonObject {
    val hidden = state.phase is Phase.PlayerTurn
    val shown = if (hidden) state.dealer.take(1) else state.dealer
    put("cards", JsonArray(shown.map(::card) + if (hidden) listOf(buildJsonObject { put("hidden", true) }) else emptyList()))
    put("value", if (hidden || state.dealer.isEmpty()) JsonNull else JsonPrimitive(handValue(state.dealer).total))
}

private fun hand(hand: Hand, phase: Phase, index: Int): JsonObject = buildJsonObject {
    put("cards", JsonArray(hand.cards.map(::card)))
    put("value", hand.value.total)
    put("soft", hand.value.soft)
    put("bet", hand.bet)
    val result = (phase as? Phase.RoundOver)?.results?.get(index)
    put("result", result?.let { JsonPrimitive(it.name.lowercase()) } ?: JsonNull)
}

private fun card(card: Card): JsonObject = buildJsonObject {
    put("rank", card.rank.label)
    put("suit", card.suit.name.lowercase())
}
