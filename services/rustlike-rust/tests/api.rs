// Pruebas de integración del contrato REST: se llama al router sin abrir sockets.
use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

/// Envía una petición al router y devuelve el estado y el JSON (Null si no hay cuerpo).
async fn send(app: &Router, method: &str, path: &str, body: &str) -> (StatusCode, Value) {
    let req = Request::builder()
        .method(method)
        .uri(path)
        .body(Body::from(body.to_string()))
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, value)
}

async fn post(app: &Router, path: &str, body: &str) -> (StatusCode, Value) {
    send(app, "POST", path, body).await
}
async fn get(app: &Router, path: &str) -> (StatusCode, Value) {
    send(app, "GET", path, "").await
}
async fn delete(app: &Router, path: &str) -> (StatusCode, Value) {
    send(app, "DELETE", path, "").await
}

/// Crea una partida con semilla y devuelve la respuesta.
async fn create(app: &Router, seed: u64) -> Value {
    let body = format!(r#"{{"options":{{"seed":{seed}}}}}"#);
    let (st, v) = post(app, "/games", &body).await;
    assert_eq!(st, StatusCode::CREATED);
    v
}

fn app() -> Router {
    rustlike::routes::app()
}

#[tokio::test]
async fn create_returns_201_with_contract() {
    let a = app();
    let v = create(&a, 42).await;
    assert_eq!(v["game"], "rustlike");
    assert_eq!(v["status"], "playing");
    assert!(v["message"].is_null());
    assert!(v["id"].as_str().unwrap().len() == 6);
    let d = &v["data"];
    assert_eq!(d["floor"], 1);
    assert_eq!(d["zone"], "warehouse");
    assert_eq!(d["width"], 60);
    assert_eq!(d["height"], 30);
    assert_eq!(d["seed"], 42);
    assert_eq!(d["events"], json!([]));
    assert!(d["entities"].is_array());
    assert_eq!(d["turn"], 0);
    assert_eq!(d["score"], 0);
    let board = v["board"].as_array().unwrap();
    assert_eq!(board.len(), 30);
    assert!(board.iter().all(|r| r.as_array().unwrap().len() == 60));
}

#[tokio::test]
async fn same_seed_same_response() {
    let a = app();
    let (x, y) = (create(&a, 42).await, create(&a, 42).await);
    assert_ne!(x["id"], y["id"]);
    assert_eq!(x["board"], y["board"]);
    assert_eq!(x["data"], y["data"]);
}

#[tokio::test]
async fn create_without_body_works() {
    let a = app();
    for body in ["", "{}", r#"{"options":null}"#, r#"{"options":{}}"#] {
        let (st, v) = post(&a, "/games", body).await;
        assert_eq!(st, StatusCode::CREATED, "cuerpo {body:?}");
        assert!(v["data"]["seed"].is_u64());
    }
}

#[tokio::test]
async fn max_seed_is_accepted() {
    let a = app();
    let v = create(&a, u64::MAX).await;
    assert_eq!(v["data"]["seed"].as_u64(), Some(u64::MAX));
}

#[tokio::test]
async fn bad_seeds_are_rejected() {
    let a = app();
    for s in ["-1", "1.5", "\"7\"", "18446744073709551616"] {
        let body = format!(r#"{{"options":{{"seed":{s}}}}}"#);
        let (st, v) = post(&a, "/games", &body).await;
        assert_eq!(st, StatusCode::UNPROCESSABLE_ENTITY, "semilla {s}");
        assert_eq!(v["error"], "INVALID_REQUEST");
    }
    for body in ["[1]", "not json", "{\"options\":3}"] {
        let (st, v) = post(&a, "/games", body).await;
        assert_eq!(st, StatusCode::UNPROCESSABLE_ENTITY, "cuerpo {body}");
        assert_eq!(v["error"], "INVALID_REQUEST");
    }
}

#[tokio::test]
async fn get_unknown_game_is_404() {
    let (st, v) = get(&app(), "/games/zzzzzz").await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    assert_eq!(v["error"], "NOT_FOUND");
    let (st, _) = post(
        &app(),
        "/games/zzzzzz/move",
        r#"{"action":{"type":"wait"}}"#,
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn unknown_route_is_404_json() {
    let (st, v) = get(&app(), "/nope").await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    assert_eq!(v["error"], "NOT_FOUND");
    let (st, v) = get(&app(), "/health").await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(v, json!({"status": "ok"}));
}

/// Busca una dirección ortogonal con casilla transitable junto al robot.
fn walkable_dir(v: &Value) -> &'static str {
    let (px, py) = (
        v["data"]["player"]["x"].as_i64().unwrap(),
        v["data"]["player"]["y"].as_i64().unwrap(),
    );
    for (name, dx, dy) in [
        ("up", 0, -1),
        ("down", 0, 1),
        ("left", -1, 0),
        ("right", 1, 0),
    ] {
        let t = &v["board"][(py + dy) as usize][(px + dx) as usize];
        if t == "floor" || t == "stairs" {
            return name;
        }
    }
    panic!("robot encerrado");
}

#[tokio::test]
async fn valid_move_returns_event() {
    let a = app();
    let v = create(&a, 42).await;
    let id = v["id"].as_str().unwrap();
    let body = json!({"action": {"type": "move", "dir": walkable_dir(&v)}}).to_string();
    let (st, r) = post(&a, &format!("/games/{id}/move"), &body).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(r["data"]["turn"], 1);
    assert_eq!(r["data"]["events"], json!(["player_moved"]));
    let (_, g) = get(&a, &format!("/games/{id}")).await;
    assert_eq!(g["data"]["events"], json!([]));
    assert_eq!(g["data"]["turn"], 1);
}

#[tokio::test]
async fn wall_move_is_422_and_state_untouched() {
    let a = app();
    let mut v = create(&a, 42).await;
    let id = v["id"].as_str().unwrap().to_string();
    let path = format!("/games/{id}/move");
    let go = |dir: &str| json!({"action": {"type": "move", "dir": dir}}).to_string();
    // Camina a la izquierda hasta tener un muro justo al lado.
    for _ in 0..60 {
        let (px, py) = (
            v["data"]["player"]["x"].as_u64().unwrap() as usize,
            v["data"]["player"]["y"].as_u64().unwrap() as usize,
        );
        if v["board"][py][px - 1] == "wall" {
            break;
        }
        let (st, r) = post(&a, &path, &go("left")).await;
        assert_eq!(st, StatusCode::OK);
        v = r;
    }
    let before = get(&a, &format!("/games/{id}")).await.1;
    let (st, r) = post(&a, &path, &go("left")).await;
    assert_eq!(st, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(r["error"], "INVALID_MOVE");
    let after = get(&a, &format!("/games/{id}")).await.1;
    assert_eq!(after["data"]["turn"], before["data"]["turn"]);
    assert_eq!(after["board"], before["board"]);
}

#[tokio::test]
async fn malformed_actions_are_invalid_request() {
    let a = app();
    let v = create(&a, 1).await;
    let path = format!("/games/{}/move", v["id"].as_str().unwrap());
    for body in [
        "\"nope\"",
        "nope",
        "{}",
        r#"{"action":{"type":"fly"}}"#,
        r#"{"action":{"type":"move","dir":"north"}}"#,
        "",
    ] {
        let (st, r) = post(&a, &path, body).await;
        assert_eq!(st, StatusCode::UNPROCESSABLE_ENTITY, "cuerpo {body:?}");
        assert_eq!(r["error"], "INVALID_REQUEST");
    }
}

#[tokio::test]
async fn descend_off_stairs_is_422() {
    let a = app();
    let v = create(&a, 1).await;
    let path = format!("/games/{}/move", v["id"].as_str().unwrap());
    let (st, r) = post(&a, &path, r#"{"action":{"type":"descend"}}"#).await;
    assert_eq!(st, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(r["error"], "INVALID_MOVE");
}

#[tokio::test]
async fn board_never_leaks_unseen_tiles() {
    let a = app();
    for seed in 0..40 {
        let v = create(&a, seed).await;
        let (px, py) = (
            v["data"]["player"]["x"].as_i64().unwrap(),
            v["data"]["player"]["y"].as_i64().unwrap(),
        );
        let mut known = 0;
        for (y, row) in v["board"].as_array().unwrap().iter().enumerate() {
            for (x, t) in row.as_array().unwrap().iter().enumerate() {
                if t != "unknown" {
                    known += 1;
                    let (dx, dy) = (x as i64 - px, y as i64 - py);
                    assert!(dx * dx + dy * dy <= 64, "fuga en semilla {seed}");
                }
            }
        }
        assert!(known > 0);
    }
}

#[tokio::test]
async fn delete_is_idempotent() {
    let a = app();
    let v = create(&a, 3).await;
    let path = format!("/games/{}", v["id"].as_str().unwrap());
    assert_eq!(delete(&a, &path).await.0, StatusCode::NO_CONTENT);
    assert_eq!(delete(&a, &path).await.0, StatusCode::NO_CONTENT);
    assert_eq!(get(&a, &path).await.0, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn parts_in_contract() {
    let a = app();
    let v = create(&a, 42).await;
    let parts = &v["data"]["parts"];
    assert_eq!(
        parts["legs"],
        json!({"name": "basic", "corrosion": 0, "condition": "optimal"})
    );
    for k in ["legs", "arms", "sensors", "core"] {
        assert!(parts[k].is_object(), "falta {k}");
    }
}

#[tokio::test]
async fn entities_only_visible() {
    let a = app();
    let mut total = 0;
    for seed in 0..30 {
        let v = create(&a, seed).await;
        let d = &v["data"];
        for e in d["entities"].as_array().unwrap() {
            total += 1;
            let (x, y) = (e["x"].as_u64().unwrap(), e["y"].as_u64().unwrap());
            assert_eq!(d["visible"][y as usize][x as usize], true, "semilla {seed}");
        }
    }
    // El bucle no debe ser vacío: alguna semilla muestra al menos una entidad.
    assert!(total > 0);
}

#[tokio::test]
async fn items_and_actions_contract() {
    let a = app();
    let v = create(&a, 1).await;
    assert_eq!(v["data"]["items"], json!([null, null, null]));
    let path = format!("/games/{}/move", v["id"].as_str().unwrap());
    let (st, r) = post(
        &a,
        &path,
        r#"{"action":{"type":"use","slot":0,"target":"legs"}}"#,
    )
    .await;
    assert_eq!(st, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(r["error"], "INVALID_MOVE");
    assert_eq!(r["message"], "Ese espacio está vacío.");
}

#[tokio::test]
async fn bad_use_bodies() {
    let a = app();
    let v = create(&a, 1).await;
    let path = format!("/games/{}/move", v["id"].as_str().unwrap());
    for body in [
        r#"{"action":{"type":"use"}}"#,
        r#"{"action":{"type":"use","slot":0,"target":"tail"}}"#,
    ] {
        let (st, r) = post(&a, &path, body).await;
        assert_eq!(st, StatusCode::UNPROCESSABLE_ENTITY, "cuerpo {body:?}");
        assert_eq!(r["error"], "INVALID_REQUEST");
    }
}
