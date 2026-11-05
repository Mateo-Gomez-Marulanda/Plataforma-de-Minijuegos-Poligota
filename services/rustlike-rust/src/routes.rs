// Rutas HTTP del servicio: crear, consultar, jugar y borrar partidas.
use crate::logic::{apply_action, new_game, Action, GameState};
use crate::presenter::present;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

/// Almacén de partidas en memoria, compartido entre peticiones.
type Store = Arc<Mutex<HashMap<String, GameState>>>;

/// Error de la API con su código HTTP y su código de contrato.
struct ApiError(StatusCode, &'static str, String);

impl IntoResponse for ApiError {
    /// Serializa el error como `{error, message}`.
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error": self.1, "message": self.2}))).into_response()
    }
}

/// Error 422 de cuerpo mal formado.
fn invalid_request(msg: impl Into<String>) -> ApiError {
    ApiError(
        StatusCode::UNPROCESSABLE_ENTITY,
        "INVALID_REQUEST",
        msg.into(),
    )
}

/// Error 404 de partida inexistente.
fn not_found() -> ApiError {
    ApiError(
        StatusCode::NOT_FOUND,
        "NOT_FOUND",
        "Partida no encontrada".into(),
    )
}

/// Toma el candado del almacén; un candado envenenado es un error interno.
fn lock(store: &Store) -> Result<MutexGuard<'_, HashMap<String, GameState>>, ApiError> {
    store.lock().map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "Error interno".into(),
        )
    })
}

/// Construye el router con un almacén nuevo y vacío.
pub fn app() -> Router {
    let store: Store = Arc::new(Mutex::new(HashMap::new()));
    Router::new()
        .route("/health", get(health))
        .route("/games", post(create_game))
        .route("/games/{id}", get(get_game).delete(delete_game))
        .route("/games/{id}/move", post(play_move))
        .fallback(fallback)
        .with_state(store)
}

/// Comprobación de vida del servicio.
async fn health() -> Json<Value> {
    Json(json!({"status": "ok"}))
}

/// Ruta desconocida: 404 en formato de contrato.
async fn fallback() -> ApiError {
    ApiError(
        StatusCode::NOT_FOUND,
        "NOT_FOUND",
        "Ruta no encontrada".into(),
    )
}

/// Lee la semilla de `options.seed`; sin ella usa una aleatoria.
fn parse_seed(body: &[u8]) -> Result<u64, ApiError> {
    if body.iter().all(|b| b.is_ascii_whitespace()) {
        return Ok(rand::random::<u64>());
    }
    let value: Value =
        serde_json::from_slice(body).map_err(|e| invalid_request(format!("JSON inválido: {e}")))?;
    let obj = value
        .as_object()
        .ok_or_else(|| invalid_request("El cuerpo debe ser un objeto JSON"))?;
    match obj.get("options") {
        None | Some(Value::Null) => Ok(rand::random::<u64>()),
        Some(Value::Object(opts)) => match opts.get("seed") {
            None | Some(Value::Null) => Ok(rand::random::<u64>()),
            Some(Value::Number(n)) => n
                .as_u64()
                .ok_or_else(|| invalid_request("options.seed debe ser un entero entre 0 y 2^64-1")),
            Some(_) => Err(invalid_request("options.seed debe ser un número entero")),
        },
        Some(_) => Err(invalid_request("options debe ser un objeto")),
    }
}

/// Crea una partida (201) con id hexadecimal de 6 caracteres.
async fn create_game(State(store): State<Store>, body: Bytes) -> Result<Response, ApiError> {
    let seed = parse_seed(&body)?;
    let game = new_game(seed);
    let mut games = lock(&store)?;
    let id = loop {
        let candidate = format!("{:06x}", rand::random::<u32>() & 0xff_ffff);
        if !games.contains_key(&candidate) {
            break candidate;
        }
    };
    let json = present(&id, &game, &[]);
    games.insert(id, game);
    Ok((StatusCode::CREATED, Json(json)).into_response())
}

/// Devuelve el estado actual de una partida.
async fn get_game(
    State(store): State<Store>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let games = lock(&store)?;
    let game = games.get(&id).ok_or_else(not_found)?;
    Ok(Json(present(&id, game, &[])))
}

/// Borra una partida; es idempotente.
async fn delete_game(
    State(store): State<Store>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    lock(&store)?.remove(&id);
    Ok(StatusCode::NO_CONTENT)
}

/// Extrae la acción de `{"action": {...}}`.
fn parse_action(body: &[u8]) -> Result<Action, ApiError> {
    let value: Value =
        serde_json::from_slice(body).map_err(|e| invalid_request(format!("JSON inválido: {e}")))?;
    let action = value
        .get("action")
        .ok_or_else(|| invalid_request("Falta el campo action"))?;
    Action::deserialize(action).map_err(|e| invalid_request(e.to_string()))
}

/// Aplica una acción con el candado tomado, lo que serializa las jugadas.
async fn play_move(
    State(store): State<Store>,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<Json<Value>, ApiError> {
    let action = parse_action(&body)?;
    let mut games = lock(&store)?;
    let game = games.get_mut(&id).ok_or_else(not_found)?;
    let events = apply_action(game, action)
        .map_err(|e| ApiError(StatusCode::UNPROCESSABLE_ENTITY, "INVALID_MOVE", e.0))?;
    Ok(Json(present(&id, game, &events)))
}
