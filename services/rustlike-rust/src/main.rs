// Punto de entrada del servicio: escucha en 0.0.0.0:$PORT (8007 por defecto).
#[tokio::main]
async fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "8007".to_string());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("no se pudo abrir el puerto");
    println!("rustlike-service escuchando en el puerto {port}");
    axum::serve(listener, rustlike::routes::app())
        .await
        .expect("fallo del servidor");
}
