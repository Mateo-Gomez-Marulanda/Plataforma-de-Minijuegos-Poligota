// Lee los cuerpos JSON de las peticiones y los convierte en objetos de la lógica.
// Es estricto con los tipos: un número entre comillas o con decimales se rechaza.
package com.minijuegos.blackjack.server

import com.minijuegos.blackjack.logic.Action
import com.minijuegos.blackjack.logic.InvalidMove
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull

/** El cuerpo no es JSON válido (se responde 422 INVALID_REQUEST). */
class InvalidRequest(message: String) : Exception(message)

/** Interpreta el cuerpo como un objeto JSON; un cuerpo vacío equivale a no enviar nada. */
fun parseBody(text: String): JsonObject? {
    if (text.isBlank()) return null
    val element = try {
        Json.parseToJsonElement(text)
    } catch (_: SerializationException) {
        throw InvalidRequest("Cuerpo de la petición inválido")
    }
    return element as? JsonObject ?: throw InvalidRequest("Cuerpo de la petición inválido")
}

/** Lee `options.seed` (opcional): fija el barajado y se usa en las pruebas. */
fun parseSeed(body: JsonObject?): Long? {
    val options = body?.get("options")?.takeUnless { it is JsonNull } ?: return null
    val seed = (options as? JsonObject ?: throw InvalidMove("'options' debe ser un objeto"))["seed"] ?: return null
    return (seed as? JsonPrimitive)?.takeUnless { it.isString }?.longOrNull ?: throw InvalidMove("'seed' debe ser un entero")
}

/** Lee `action` ({type: bet | hit | stand | double | split | next_round, amount?}). */
fun parseAction(body: JsonObject?): Action {
    val action = body?.get("action") as? JsonObject ?: throw InvalidMove("Falta 'action'")
    return when (val type = (action["type"] as? JsonPrimitive)?.takeIf { it.isString }?.content) {
        "bet" -> Action.Bet(integer(action, "amount"))
        "hit" -> Action.Hit
        "stand" -> Action.Stand
        "double" -> Action.Double
        "split" -> Action.Split
        "next_round" -> Action.NextRound
        else -> throw InvalidMove("Acción desconocida: $type")
    }
}

// Lee un entero obligatorio; rechaza textos, decimales y booleanos.
private fun integer(obj: JsonObject, key: String): Int =
    (obj[key] as? JsonPrimitive)?.takeUnless { it.isString }?.intOrNull ?: throw InvalidMove("'$key' debe ser un entero")
