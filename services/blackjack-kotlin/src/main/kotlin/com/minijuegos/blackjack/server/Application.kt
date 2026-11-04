// Capa HTTP del servicio: traduce las peticiones REST del contrato a llamadas a la lógica.
// El gateway le reenvía /api/blackjack/* quitando el prefijo.
package com.minijuegos.blackjack.server

import com.minijuegos.blackjack.logic.Action
import com.minijuegos.blackjack.logic.GameState
import com.minijuegos.blackjack.logic.InvalidMove
import com.minijuegos.blackjack.logic.applyAction
import com.minijuegos.blackjack.logic.newGame
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.install
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.request.receiveText
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** La sesión pedida no existe (404 NOT_FOUND). */
private class GameNotFound : Exception("Partida no encontrada")

/** Configura rutas y manejo de errores. El almacén se puede inyectar para controlar las semillas en las pruebas. */
fun Application.module(store: GameStore = GameStore()) {
    install(StatusPages) {
        exception<InvalidMove> { call, e -> call.respondError(HttpStatusCode.UnprocessableEntity, "INVALID_MOVE", e.message) }
        exception<InvalidRequest> { call, e -> call.respondError(HttpStatusCode.UnprocessableEntity, "INVALID_REQUEST", e.message) }
        exception<GameNotFound> { call, e -> call.respondError(HttpStatusCode.NotFound, "NOT_FOUND", e.message) }
        exception<Throwable> { call, _ -> call.respondError(HttpStatusCode.InternalServerError, "INTERNAL_ERROR", "Error interno") }
        status(HttpStatusCode.NotFound) { call, _ -> call.respondError(HttpStatusCode.NotFound, "NOT_FOUND", "Ruta no encontrada") }
    }

    routing {
        // Comprobación de que el servicio está vivo.
        get("/health") { call.respondJson(buildJsonObject { put("status", "ok") }) }

        // Crea una sesión (con `options.seed` opcional).
        post("/games") {
            val seed = parseSeed(parseBody(call.receiveText())) ?: store.nextSeed()
            val state = newGame(seed)
            call.respondJson(present(store.add(state), state), HttpStatusCode.Created)
        }

        // Devuelve el estado actual.
        get("/games/{id}") {
            val id = call.parameters["id"]!!
            call.respondJson(present(id, store.find(id) ?: throw GameNotFound()))
        }

        // Aplica la acción del cuerpo ({"action": {...}}) y devuelve el estado nuevo.
        post("/games/{id}/move") {
            val id = call.parameters["id"]!!
            val action: Action = parseAction(parseBody(call.receiveText()))
            val state: GameState = store.update(id) { applyAction(it, action) }?.getOrThrow() ?: throw GameNotFound()
            call.respondJson(present(id, state))
        }

        // Elimina la sesión (idempotente).
        delete("/games/{id}") {
            store.remove(call.parameters["id"]!!)
            call.respond(HttpStatusCode.NoContent)
        }
    }
}

private suspend fun ApplicationCall.respondJson(body: JsonObject, status: HttpStatusCode = HttpStatusCode.OK) =
    respondText(body.toString(), ContentType.Application.Json, status)

// Respuesta de error en el formato del contrato: {"error": ..., "message": ...}.
private suspend fun ApplicationCall.respondError(status: HttpStatusCode, code: String, message: String?) =
    respondJson(buildJsonObject { put("error", code); put("message", message ?: code) }, status)
