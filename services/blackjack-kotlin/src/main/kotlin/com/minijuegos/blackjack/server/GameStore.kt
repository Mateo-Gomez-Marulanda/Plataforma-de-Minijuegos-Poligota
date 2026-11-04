// Almacén en memoria de las sesiones en curso. Si el servicio se reinicia, se pierden (decisión aceptada del proyecto).
package com.minijuegos.blackjack.server

import com.minijuegos.blackjack.logic.GameState
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.random.Random

class GameStore(private val newSeed: () -> Long = { Random.nextLong() }) {
    private val games = ConcurrentHashMap<String, GameState>()

    /** Semilla para una sesión nueva. */
    fun nextSeed(): Long = newSeed()

    /** Guarda una sesión nueva y devuelve su identificador. */
    fun add(state: GameState): String = UUID.randomUUID().toString().take(8).also { games[it] = state }

    fun find(id: String): GameState? = games[id]

    /**
     * Aplica [transform] a la sesión de forma atómica (dos jugadas simultáneas no se pisan) y devuelve su resultado,
     * o null si la sesión no existe. Si la transformación falla, la sesión queda como estaba.
     */
    fun update(id: String, transform: (GameState) -> Result<GameState>): Result<GameState>? {
        var outcome: Result<GameState>? = null
        games.computeIfPresent(id) { _, state -> transform(state).also { outcome = it }.getOrDefault(state) }
        return outcome
    }

    /** Elimina la sesión (idempotente). */
    fun remove(id: String) {
        games.remove(id)
    }
}
