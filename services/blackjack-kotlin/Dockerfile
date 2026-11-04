# Imagen del servicio Blackjack (Kotlin + Ktor) en dos etapas: compila un jar ejecutable con Gradle y JDK 21,
# y lo ejecuta solo con el JRE 21 sobre Alpine. No hace falta tener Kotlin ni Gradle instalados. Puerto 8006.
FROM gradle:9.8-jdk21 AS build
WORKDIR /home/gradle/app
# Primero solo los scripts de build, para que la descarga de dependencias quede en caché entre builds.
COPY --chown=gradle:gradle settings.gradle.kts build.gradle.kts ./
RUN gradle --no-daemon -q dependencies > /dev/null
COPY --chown=gradle:gradle src ./src
RUN gradle --no-daemon -q buildFatJar

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /home/gradle/app/build/libs/blackjack.jar ./app.jar
ENV PORT=8006
EXPOSE 8006
CMD ["java", "-jar", "app.jar"]
