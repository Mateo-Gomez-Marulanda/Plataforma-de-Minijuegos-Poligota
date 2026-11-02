package com.minijuegos.buscaminas.server;

import com.minijuegos.buscaminas.logic.Partida;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Guarda las partidas activas en memoria (se pierden al reiniciar el servicio, como pide el diseño). */
@Component
class RepositorioPartidas {
    private final Map<String, Partida> partidas = new ConcurrentHashMap<>();

    /** Guarda una partida nueva y devuelve su id. */
    String guardar(Partida partida) {
        String id = UUID.randomUUID().toString().substring(0, 8);
        partidas.put(id, partida);
        return id;
    }

    Optional<Partida> buscar(String id) {
        return Optional.ofNullable(partidas.get(id));
    }

    /** Elimina la partida; si no existe no pasa nada. */
    void borrar(String id) {
        partidas.remove(id);
    }
}
