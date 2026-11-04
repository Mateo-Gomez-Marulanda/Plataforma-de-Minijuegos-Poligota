// Punto de entrada del servicio Blackjack: arranca Ktor (Netty) en el puerto 8006, o en el de la variable PORT.
package com.minijuegos.blackjack

import com.minijuegos.blackjack.server.module
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8006
    embeddedServer(Netty, port = port, host = "0.0.0.0") { module() }.start(wait = true)
}
