# Imagen del servicio Buscaminas (Java 21 + Spring Boot) en varias etapas. No hace falta tener JDK ni Maven:
# todo se compila dentro de Docker. Sirve la API en el puerto 8002.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
# Primero solo el pom, para que las dependencias queden en caché entre builds.
COPY pom.xml ./
RUN mvn -q dependency:go-offline
COPY src ./src

# Etapa de empaquetado: genera el jar ejecutable (sin ejecutar las pruebas, que son solo para quien programa).
FROM build AS package
RUN mvn -q package -DskipTests

# Imagen final: solo el JRE y el jar.
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=package /app/target/buscaminas.jar ./app.jar
EXPOSE 8002
CMD ["java", "-jar", "app.jar"]
