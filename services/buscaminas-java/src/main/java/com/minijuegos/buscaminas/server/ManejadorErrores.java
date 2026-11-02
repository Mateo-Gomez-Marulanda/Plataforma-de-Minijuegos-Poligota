package com.minijuegos.buscaminas.server;

import com.minijuegos.buscaminas.logic.MovimientoInvalido;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Convierte las excepciones en el formato de error del contrato: {"error": ..., "message": ...}. */
@RestControllerAdvice
class ManejadorErrores {

    // Jugada u opciones inválidas -> 422 INVALID_MOVE.
    @ExceptionHandler(MovimientoInvalido.class)
    ResponseEntity<Map<String, String>> movimientoInvalido(MovimientoInvalido e) {
        return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_MOVE", e.getMessage());
    }

    // Cuerpo que no es JSON válido -> 422 INVALID_REQUEST.
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> cuerpoInvalido(HttpMessageNotReadableException e) {
        return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_REQUEST", "Cuerpo de la petición inválido");
    }

    // Partida inexistente o ruta desconocida -> 404 NOT_FOUND.
    @ExceptionHandler({PartidaNoEncontrada.class, NoResourceFoundException.class})
    ResponseEntity<Map<String, String>> noEncontrado(Exception e) {
        return error(HttpStatus.NOT_FOUND, "NOT_FOUND",
                e instanceof PartidaNoEncontrada ? e.getMessage() : "Ruta no encontrada");
    }

    // Construye la respuesta de error.
    private static ResponseEntity<Map<String, String>> error(HttpStatus estado, String codigo, String mensaje) {
        return ResponseEntity.status(estado).body(Map.of("error", codigo, "message", mensaje));
    }
}
