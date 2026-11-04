// Pruebas del almacén de sesiones: actualizaciones atómicas y errores que no modifican el estado.
package com.minijuegos.blackjack.server

import com.minijuegos.blackjack.logic.Action
import com.minijuegos.blackjack.logic.applyAction
import com.minijuegos.blackjack.logic.Phase
import com.minijuegos.blackjack.logic.newGame
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GameStoreTest {
    @Test fun `una sesion inexistente devuelve null`() {
        assertNull(GameStore().update("nope") { Result.success(it) })
        assertNull(GameStore().find("nope"))
    }

    @Test fun `una jugada rechazada deja la sesion como estaba`() {
        val store = GameStore()
        val id = store.add(newGame(1))
        val result = store.update(id) { applyAction(it, Action.Hit) }!!
        assertEquals(true, result.isFailure)
        assertEquals(newGame(1), store.find(id))
    }

    @Test fun `jugadas simultaneas sobre la misma sesion no se pisan`() {
        // Semilla cuyo primer reparto no es Blackjack: así la sesión sigue en el turno del jugador tras apostar.
        val seed = generateSequence(1L) { it + 1 }.first { applyAction(newGame(it), Action.Bet(100)).getOrThrow().phase is Phase.PlayerTurn }
        val store = GameStore()
        val id = store.add(newGame(seed))
        val accepted = AtomicInteger()
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(16)
        repeat(16) {
            pool.submit {
                start.await()
                // Solo la primera apuesta es válida: las demás llegan cuando la sesión ya no está en fase de apuesta.
                if (store.update(id) { applyAction(it, Action.Bet(100)) }!!.isSuccess) accepted.incrementAndGet()
            }
        }
        start.countDown()
        pool.shutdown()
        assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS))
        assertEquals(1, accepted.get())
        assertEquals(900, store.find(id)!!.chips) // la apuesta se descontó una sola vez
    }
}
