package com.minijuegos.buscaminas;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Punto de arranque del servicio Buscaminas: levanta el servidor web de Spring Boot. */
@SpringBootApplication
public class BuscaminasApplication {
    public static void main(String[] args) {
        SpringApplication.run(BuscaminasApplication.class, args);
    }
}
