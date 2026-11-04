// Build del servicio Blackjack: Kotlin sobre JDK 21 con Ktor (Netty). `./gradlew buildFatJar` genera build/libs/blackjack.jar.
plugins {
    kotlin("jvm") version "2.4.21"
    id("io.ktor.plugin") version "3.6.1"
}

group = "com.minijuegos"
version = "1.0.0"

kotlin { jvmToolchain(21) }

application { mainClass.set("com.minijuegos.blackjack.MainKt") }

ktor { fatJar { archiveFileName.set("blackjack.jar") } }

repositories { mavenCentral() }

val ktorVersion = "3.6.1"

dependencies {
    implementation("io.ktor:ktor-server-netty:$ktorVersion")
    implementation("io.ktor:ktor-server-status-pages:$ktorVersion")
    // Solo se usa el modelo JsonObject para construir y leer el JSON a mano: no hace falta el plugin de serialización.
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.12.0")
    implementation("ch.qos.logback:logback-classic:1.5.18")

    testImplementation(kotlin("test"))
    testImplementation("io.ktor:ktor-server-test-host:$ktorVersion")
}

tasks.test { useJUnitPlatform() }
