// Pruebas del contrato REST contra el servidor en memoria (testApplication): sin red ni puertos.
package com.minijuegos.blackjack.server

import com.minijuegos.blackjack.logic.Action
import com.minijuegos.blackjack.logic.Phase
import com.minijuegos.blackjack.logic.applyAction
import com.minijuegos.blackjack.logic.newGame
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

// Una semilla cuyo primer reparto con apuesta de 50 no es Blackjack de nadie: así la ronda sigue en el turno del jugador.
private val SEED = generateSequence(1L) { it + 1 }.first { applyAction(newGame(it), Action.Bet(50)).getOrThrow().phase is Phase.PlayerTurn }

private fun api(block: suspend ApplicationTestBuilder.() -> Unit) = testApplication {
    application { module(GameStore { SEED }) }
    block()
}

private suspend fun HttpResponse.json(): JsonObject = Json.parseToJsonElement(bodyAsText()).jsonObject

private suspend fun HttpClient.crear(): String =
    post("/games") { contentType(ContentType.Application.Json); setBody("""{"options":{"seed":$SEED}}""") }
        .json()["id"]!!.jsonPrimitive.content

private suspend fun HttpClient.mover(id: String, action: String): HttpResponse =
    post("/games/$id/move") { contentType(ContentType.Application.Json); setBody("""{"action":$action}""") }

private val JsonObject.data get() = this["data"]!!.jsonObject

class ApiTest {
    @Test fun `crear una sesion sigue el contrato`() = api {
        val response = client.post("/games") { contentType(ContentType.Application.Json); setBody("""{"options":{"seed":$SEED}}""") }
        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(ContentType.Application.Json, response.contentType()?.withoutParameters())
        val body = response.json()
        assertEquals("blackjack", body["game"]!!.jsonPrimitive.content)
        assertEquals("playing", body["status"]!!.jsonPrimitive.content)
        assertEquals(JsonNull, body["board"])
        assertEquals(JsonNull, body["message"])
        assertEquals(8, body["id"]!!.jsonPrimitive.content.length)
        with(body.data) {
            assertEquals("betting", this["phase"]!!.jsonPrimitive.content)
            assertEquals(1000, this["chips"]!!.jsonPrimitive.int)
            assertEquals(10, this["minBet"]!!.jsonPrimitive.int)
            assertEquals(500, this["maxBet"]!!.jsonPrimitive.int)
            assertEquals(JsonArray(emptyList()), this["hands"])
            assertEquals(JsonNull, this["activeHand"])
            assertEquals("""["bet"]""", this["allowedActions"].toString())
        }
    }

    @Test fun `crear sin cuerpo tambien funciona`() = api {
        assertEquals(HttpStatusCode.Created, client.post("/games").status)
    }

    @Test fun `apostar reparte las cartas y oculta la segunda del crupier`() = api {
        val id = client.crear()
        val body = client.mover(id, """{"type":"bet","amount":50}""").json()
        with(body.data) {
            assertEquals("player_turn", this["phase"]!!.jsonPrimitive.content)
            assertEquals(950, this["chips"]!!.jsonPrimitive.int)
            assertEquals(0, this["activeHand"]!!.jsonPrimitive.int)
            val dealer = this["dealer"]!!.jsonObject
            val cards = dealer["cards"]!!.jsonArray
            assertEquals(2, cards.size)
            assertEquals(setOf("rank", "suit"), cards[0].jsonObject.keys)
            assertEquals("""{"hidden":true}""", cards[1].toString())
            assertEquals(JsonNull, dealer["value"])
            val hand = this["hands"]!!.jsonArray.single().jsonObject
            assertEquals(2, hand["cards"]!!.jsonArray.size)
            assertEquals(50, hand["bet"]!!.jsonPrimitive.int)
            assertEquals(JsonNull, hand["result"])
            assertTrue(hand["value"]!!.jsonPrimitive.int in 4..21)
            assertTrue("hit" in this["allowedActions"].toString() && "stand" in this["allowedActions"].toString())
        }
    }

    @Test fun `plantarse revela al crupier y liquida la ronda`() = api {
        val id = client.crear()
        client.mover(id, """{"type":"bet","amount":50}""")
        val body = client.mover(id, """{"type":"stand"}""").json()
        with(body.data) {
            assertEquals("round_over", this["phase"]!!.jsonPrimitive.content)
            val dealer = this["dealer"]!!.jsonObject
            assertTrue(dealer["cards"]!!.jsonArray.none { "hidden" in it.jsonObject })
            assertTrue(dealer["value"]!!.jsonPrimitive.int >= 17)
            val result = this["hands"]!!.jsonArray.single().jsonObject["result"]!!.jsonPrimitive.content
            assertTrue(result in setOf("win", "lose", "push", "bust", "blackjack"))
            assertEquals("""["next_round"]""", this["allowedActions"].toString())
        }
        val again = client.mover(id, """{"type":"next_round"}""").json()
        assertEquals("betting", again.data["phase"]!!.jsonPrimitive.content)
    }

    @Test fun `la mano informa si es suave`() = api {
        val id = client.crear()
        val hand = client.mover(id, """{"type":"bet","amount":50}""").json().data["hands"]!!.jsonArray.single().jsonObject
        hand["soft"]!!.jsonPrimitive.boolean // existe y es booleano
    }

    @Test fun `GET devuelve el mismo estado y DELETE lo elimina`() = api {
        val id = client.crear()
        client.mover(id, """{"type":"bet","amount":50}""")
        val before = client.mover(id, """{"type":"bet","amount":50}""") // rechazada: no cambia nada
        assertEquals(HttpStatusCode.UnprocessableEntity, before.status)
        val state = client.get("/games/$id").json()
        assertEquals("player_turn", state.data["phase"]!!.jsonPrimitive.content)
        assertEquals(id, state["id"]!!.jsonPrimitive.content)
        assertEquals(HttpStatusCode.NoContent, client.delete("/games/$id").status)
        assertEquals(HttpStatusCode.NoContent, client.delete("/games/$id").status) // idempotente
        val missing = client.get("/games/$id")
        assertEquals(HttpStatusCode.NotFound, missing.status)
        assertEquals("NOT_FOUND", missing.json()["error"]!!.jsonPrimitive.content)
    }

    @Test fun `una jugada invalida devuelve 422 con el formato de error`() = api {
        val id = client.crear()
        val response = client.mover(id, """{"type":"hit"}""")
        assertEquals(HttpStatusCode.UnprocessableEntity, response.status)
        val body = response.json()
        assertEquals("INVALID_MOVE", body["error"]!!.jsonPrimitive.content)
        assertEquals("Ahora no es el turno del jugador", body["message"]!!.jsonPrimitive.content)
    }

    @Test fun `las apuestas fuera de limites se rechazan`() = api {
        val id = client.crear()
        for (amount in listOf(9, 501, 0, -5, 1001)) {
            assertEquals(HttpStatusCode.UnprocessableEntity, client.mover(id, """{"type":"bet","amount":$amount}""").status, "amount=$amount")
        }
    }

    @Test fun `las peticiones mal formadas se rechazan`() = api {
        val id = client.crear()
        val invalid = listOf(
            """{"type":"bet"}""", """{"type":"bet","amount":"50"}""", """{"type":"bet","amount":50.5}""",
            """{"type":"bet","amount":true}""", """{"type":"saltar"}""", """{"type":1}""", """{}""",
        )
        for (action in invalid) {
            val response = client.mover(id, action)
            assertEquals(HttpStatusCode.UnprocessableEntity, response.status, action)
            assertEquals("INVALID_MOVE", response.json()["error"]!!.jsonPrimitive.content, action)
        }
        val noAction = client.post("/games/$id/move") { contentType(ContentType.Application.Json); setBody("""{}""") }
        assertEquals("Falta 'action'", noAction.json()["message"]!!.jsonPrimitive.content)
    }

    @Test fun `un cuerpo que no es JSON devuelve INVALID_REQUEST`() = api {
        val id = client.crear()
        for (body in listOf("no es json", "[1,2]", "{\"action\":")) {
            val response = client.post("/games/$id/move") { contentType(ContentType.Application.Json); setBody(body) }
            assertEquals(HttpStatusCode.UnprocessableEntity, response.status, body)
            assertEquals("INVALID_REQUEST", response.json()["error"]!!.jsonPrimitive.content, body)
        }
        assertEquals(HttpStatusCode.UnprocessableEntity, client.post("/games") { setBody("{roto") }.status)
    }

    @Test fun `las opciones mal formadas se rechazan`() = api {
        for (body in listOf("""{"options":5}""", """{"options":{"seed":"abc"}}""", """{"options":{"seed":1.5}}""")) {
            val response = client.post("/games") { contentType(ContentType.Application.Json); setBody(body) }
            assertEquals(HttpStatusCode.UnprocessableEntity, response.status, body)
        }
    }

    @Test fun `una sesion o ruta inexistente devuelve 404`() = api {
        assertEquals(HttpStatusCode.NotFound, client.get("/games/nope").status)
        assertEquals(HttpStatusCode.NotFound, client.mover("nope", """{"type":"hit"}""").status)
        val route = client.get("/no-existe")
        assertEquals(HttpStatusCode.NotFound, route.status)
        assertEquals("NOT_FOUND", route.json()["error"]!!.jsonPrimitive.content)
    }

    @Test fun `health responde ok`() = api {
        assertEquals("""{"status":"ok"}""", client.get("/health").bodyAsText())
    }

    @Test fun `dos sesiones son independientes`() = api {
        val a = client.crear()
        val b = client.crear()
        client.mover(a, """{"type":"bet","amount":100}""")
        assertEquals("betting", client.get("/games/$b").json().data["phase"]!!.jsonPrimitive.content)
        assertEquals(1000, client.get("/games/$b").json().data["chips"]!!.jsonPrimitive.int)
    }
}
