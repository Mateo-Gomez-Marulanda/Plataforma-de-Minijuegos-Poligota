package com.minijuegos.buscaminas.server;

import com.minijuegos.buscaminas.logic.Accion;
import com.minijuegos.buscaminas.logic.MovimientoInvalido;
import com.minijuegos.buscaminas.logic.Opciones;
import com.minijuegos.buscaminas.logic.Posicion;
import java.util.Map;

/** Convierte los cuerpos JSON de las peticiones (ya leídos como mapas) en objetos de la lógica. */
final class Peticiones {
    private Peticiones() {
    }

    /** Lee `options` ({rows, cols, mines}); lo que falte toma el valor por defecto (16x16, 40 minas). */
    static Opciones opciones(Map<String, Object> cuerpo) {
        Opciones base = Opciones.porDefecto();
        Map<String, Object> o = mapa(cuerpo == null ? null : cuerpo.get("options"), "options");
        return new Opciones(
                entero(o, "rows", base.filas()),
                entero(o, "cols", base.columnas()),
                entero(o, "mines", base.minas()));
    }

    /** Lee `action` ({type: reveal | flag, row, col}). */
    static Accion accion(Map<String, Object> cuerpo) {
        Map<String, Object> a = mapa(cuerpo == null ? null : cuerpo.get("action"), "action");
        if (a.isEmpty()) {
            throw new MovimientoInvalido("Falta 'action'");
        }
        Posicion posicion = new Posicion(obligatorio(a, "row"), obligatorio(a, "col"));
        Object tipo = a.get("type");
        if ("reveal".equals(tipo)) {
            return new Accion.Revelar(posicion);
        }
        if ("flag".equals(tipo)) {
            return new Accion.Bandera(posicion);
        }
        throw new MovimientoInvalido("Acción desconocida: " + tipo);
    }

    // Interpreta un valor como objeto JSON; null equivale a un objeto vacío.
    @SuppressWarnings("unchecked")
    private static Map<String, Object> mapa(Object valor, String nombre) {
        if (valor == null) {
            return Map.of();
        }
        if (valor instanceof Map<?, ?> m) {
            return (Map<String, Object>) m;
        }
        throw new MovimientoInvalido("'" + nombre + "' debe ser un objeto");
    }

    // Lee un entero opcional, con valor por defecto si no viene.
    private static int entero(Map<String, Object> mapa, String clave, int pordefecto) {
        return mapa.containsKey(clave) ? obligatorio(mapa, clave) : pordefecto;
    }

    // Lee un entero obligatorio; rechaza textos, decimales y booleanos.
    private static int obligatorio(Map<String, Object> mapa, String clave) {
        if (mapa.get(clave) instanceof Integer n) {
            return n;
        }
        throw new MovimientoInvalido("'" + clave + "' debe ser un entero");
    }
}
