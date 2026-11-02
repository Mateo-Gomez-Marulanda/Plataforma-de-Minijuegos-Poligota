package com.minijuegos.buscaminas.server;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Pruebas de la capa HTTP: cumplimiento del contrato REST y de los códigos de error. */
class ApiTest {
    private MockMvc mvc;

    // Cada prueba usa un controlador nuevo con un generador aleatorio fijo.
    @BeforeEach
    void preparar() {
        mvc = MockMvcBuilders
                .standaloneSetup(new PartidaController(new RepositorioPartidas(), new Random(42)))
                .setControllerAdvice(new ManejadorErrores())
                .build();
    }

    // Envía un POST con cuerpo JSON.
    private ResultActions peticion(String ruta, String json) throws Exception {
        return mvc.perform(post(ruta).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    // Crea una partida y devuelve su id.
    private String crear(String json) throws Exception {
        String cuerpo = peticion("/games", json).andReturn().getResponse().getContentAsString();
        return cuerpo.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");
    }

    @Test
    void crearPartidaSigueElContrato() throws Exception {
        peticion("/games", "{\"options\":{\"rows\":9,\"cols\":9,\"mines\":10}}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.game").value("buscaminas"))
                .andExpect(jsonPath("$.status").value("playing"))
                .andExpect(jsonPath("$.board.length()").value(9))
                .andExpect(jsonPath("$.board[0].length()").value(9))
                .andExpect(jsonPath("$.board[0][0]").value(-1))
                .andExpect(jsonPath("$.data.rows").value(9))
                .andExpect(jsonPath("$.data.mines").value(10))
                .andExpect(jsonPath("$.data.flags").value(0))
                .andExpect(jsonPath("$.data.mines_remaining").value(10))
                .andExpect(jsonPath("$.message").doesNotExist());
    }

    @Test
    void sinCuerpoUsaElTableroPorDefecto() throws Exception {
        mvc.perform(post("/games"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.rows").value(16))
                .andExpect(jsonPath("$.data.mines").value(40));
    }

    @Test
    void revelarAplicaLaJugadaYNoPierdeEnElPrimerClic() throws Exception {
        String id = crear("{\"options\":{\"rows\":9,\"cols\":9,\"mines\":10}}");
        peticion("/games/" + id + "/move", "{\"action\":{\"type\":\"reveal\",\"row\":4,\"col\":4}}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("playing"))
                .andExpect(jsonPath("$.board[4][4]").value(org.hamcrest.Matchers.greaterThanOrEqualTo(0)));
    }

    @Test
    void banderaSePoneYSeQuitaYActualizaLosContadores() throws Exception {
        String id = crear("{\"options\":{\"rows\":9,\"cols\":9,\"mines\":10}}");
        peticion("/games/" + id + "/move", "{\"action\":{\"type\":\"flag\",\"row\":0,\"col\":0}}")
                .andExpect(jsonPath("$.board[0][0]").value(-2))
                .andExpect(jsonPath("$.data.flags").value(1))
                .andExpect(jsonPath("$.data.mines_remaining").value(9));
        peticion("/games/" + id + "/move", "{\"action\":{\"type\":\"flag\",\"row\":0,\"col\":0}}")
                .andExpect(jsonPath("$.board[0][0]").value(-1))
                .andExpect(jsonPath("$.data.flags").value(0));
    }

    @Test
    void getDevuelveElEstadoYDeleteLoElimina() throws Exception {
        String id = crear("{}");
        mvc.perform(get("/games/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
        mvc.perform(delete("/games/" + id)).andExpect(status().isNoContent());
        mvc.perform(get("/games/" + id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("NOT_FOUND"));
    }

    @Test
    void jugadaInvalidaDevuelve422ConElFormatoDeError() throws Exception {
        String id = crear("{\"options\":{\"rows\":9,\"cols\":9,\"mines\":10}}");
        peticion("/games/" + id + "/move", "{\"action\":{\"type\":\"reveal\",\"row\":4,\"col\":4}}");
        peticion("/games/" + id + "/move", "{\"action\":{\"type\":\"reveal\",\"row\":4,\"col\":4}}")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("INVALID_MOVE"))
                .andExpect(jsonPath("$.message").value("La celda ya está revelada"));
    }

    @Test
    void peticionesMalFormadasSeRechazan() throws Exception {
        String id = crear("{}");
        String mover = "/games/" + id + "/move";
        peticion(mover, "{}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.error").value("INVALID_MOVE"));
        peticion(mover, "{\"action\":{\"type\":\"saltar\",\"row\":0,\"col\":0}}").andExpect(status().isUnprocessableEntity());
        peticion(mover, "{\"action\":{\"type\":\"reveal\",\"row\":\"0\",\"col\":0}}").andExpect(status().isUnprocessableEntity());
        peticion(mover, "{\"action\":{\"type\":\"reveal\",\"row\":99,\"col\":0}}")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("La celda está fuera del tablero"));
        peticion(mover, "no es json").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.error").value("INVALID_REQUEST"));
        peticion("/games/zzz/move", "{\"action\":{\"type\":\"flag\",\"row\":0,\"col\":0}}").andExpect(status().isNotFound());
    }

    @Test
    void opcionesInvalidasSeRechazan() throws Exception {
        peticion("/games", "{\"options\":{\"rows\":5,\"cols\":5,\"mines\":17}}")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("INVALID_MOVE"));
        peticion("/games", "{\"options\":{\"rows\":\"mucho\"}}").andExpect(status().isUnprocessableEntity());
    }

    @Test
    void healthResponde() throws Exception {
        mvc.perform(get("/health")).andExpect(jsonPath("$.status").value("ok"));
    }
}
