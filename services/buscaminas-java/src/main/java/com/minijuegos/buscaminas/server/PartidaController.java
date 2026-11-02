package com.minijuegos.buscaminas.server;

import com.minijuegos.buscaminas.logic.Partida;
import java.util.Map;
import java.util.Random;
import java.util.random.RandomGenerator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Capa HTTP del servicio: traduce las peticiones REST del contrato a llamadas a la lógica.
 * El gateway le reenvía /api/buscaminas/* quitando el prefijo.
 */
@RestController
class PartidaController {
    private final RepositorioPartidas repositorio;
    private final RandomGenerator azar;

    @Autowired
    PartidaController(RepositorioPartidas repositorio) {
        // java.util.Random vive en java.base; RandomGenerator.getDefault() necesita el módulo jdk.random,
        // que no viene en la imagen Alpine solo con JRE.
        this(repositorio, new Random());
    }

    // Constructor con generador aleatorio inyectable (lo usan las pruebas).
    PartidaController(RepositorioPartidas repositorio, RandomGenerator azar) {
        this.repositorio = repositorio;
        this.azar = azar;
    }

    /** Comprobación de que el servicio está vivo. */
    @GetMapping("/health")
    Map<String, String> health() {
        return Map.of("status", "ok");
    }

    /** Crea una partida con las opciones recibidas (o las de por defecto). */
    @PostMapping("/games")
    @ResponseStatus(HttpStatus.CREATED)
    Respuesta crear(@RequestBody(required = false) Map<String, Object> cuerpo) {
        Partida partida = Partida.nueva(Peticiones.opciones(cuerpo), azar);
        return Respuesta.de(repositorio.guardar(partida), partida);
    }

    /** Devuelve el estado actual de una partida. */
    @GetMapping("/games/{id}")
    Respuesta ver(@PathVariable String id) {
        return Respuesta.de(id, buscar(id));
    }

    /** Aplica la acción del cuerpo ({"action": {...}}) y devuelve el estado nuevo. */
    @PostMapping("/games/{id}/move")
    Respuesta mover(@PathVariable String id, @RequestBody Map<String, Object> cuerpo) {
        Partida partida = buscar(id);
        partida.aplicar(Peticiones.accion(cuerpo));
        return Respuesta.de(id, partida);
    }

    /** Elimina la partida (idempotente). */
    @DeleteMapping("/games/{id}")
    ResponseEntity<Void> borrar(@PathVariable String id) {
        repositorio.borrar(id);
        return ResponseEntity.noContent().build();
    }

    // Busca la partida o lanza 404.
    private Partida buscar(String id) {
        return repositorio.buscar(id).orElseThrow(PartidaNoEncontrada::new);
    }
}
