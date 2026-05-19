//! HTTP server for split-mode: receives invoke calls from Windows React frontend via Tailnet.

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde_json::Value;
use std::net::SocketAddr;
use tokio::net::TcpListener;

/// Command dispatcher type: (command_name, args_json, app_handle) -> result_json
pub type CommandDispatcher =
    fn(command: &str, args: Value, app_handle: Option<&tauri::AppHandle>) -> Result<Value, String>;

static DISPATCHER: std::sync::OnceLock<CommandDispatcher> = std::sync::OnceLock::new();
static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// Set the command dispatcher. Called once at startup from lib.rs.
pub fn set_dispatcher(d: CommandDispatcher) {
    let _ = DISPATCHER.set(d);
}

/// Store AppHandle for use by command dispatchers. Called from lib.rs setup.
pub fn set_app_handle(handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

/// Dispatch a command to the Tauri handler. Must be called from a blocking task context.
pub fn dispatch(command: &str, args: Value) -> Result<Value, String> {
    let dispatcher = DISPATCHER
        .get()
        .ok_or_else(|| "dispatcher not set".to_string())?;
    dispatcher(command, args, APP_HANDLE.get())
}

/// Add CORS headers for cross-origin browser requests.
fn add_cors_headers(headers: &mut hyper::HeaderMap) {
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert("Access-Control-Allow-Methods", "POST, GET, OPTIONS".parse().unwrap());
    headers.insert(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization".parse().unwrap(),
    );
    headers.insert("Access-Control-Max-Age", "86400".parse().unwrap());
}

/// Spawn the HTTP server. Must be called from within a Tokio runtime.
pub fn spawn_http_server(port: u16) {
    let rt = tokio::runtime::Handle::current();

    rt.spawn(async move {
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        tracing::info!("split-mode HTTP server listening on {}", addr);

        let listener = match TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                tracing::error!("failed to bind HTTP server to {}: {}", addr, e);
                return;
            }
        };

        loop {
            match listener.accept().await {
                Ok((stream, _remote_addr)) => {
                    let io = TokioIo::new(stream);
                    tokio::spawn(async move {
                        if let Err(e) = http1::Builder::new()
                            .serve_connection(io, service_fn(handle_request))
                            .await
                        {
                            tracing::error!("HTTP connection error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    tracing::error!("TCP accept error: {}", e);
                }
            }
        }
    });
}

async fn handle_request(req: Request<hyper::body::Incoming>) -> Result<Response<Full<Bytes>>, hyper::Error> {
    let method = req.method().clone();
    let uri = req.uri();
    let path = uri.path().to_string();
    let body_bytes = req.into_body().collect().await?.to_bytes();

    // Health check
    if path == "/health" && method == Method::GET {
        let mut res = Response::builder()
            .status(StatusCode::OK)
            .body(Full::new(Bytes::from("ok")))
            .unwrap();
        add_cors_headers(res.headers_mut());
        return Ok(res);
    }

    // CORS preflight (OPTIONS)
    if method == Method::OPTIONS && path.starts_with("/invoke/") {
        let mut res = Response::builder()
            .status(StatusCode::NO_CONTENT)
            .body(Full::new(Bytes::new()))
            .unwrap();
        add_cors_headers(res.headers_mut());
        return Ok(res);
    }

    // Invoke endpoint: POST /invoke/:command
    if method == Method::POST && path.starts_with("/invoke/") {
        let command = path.strip_prefix("/invoke/").unwrap_or("");
        let body_str = String::from_utf8_lossy(&body_bytes).into_owned();

        let args: Value = if body_str.is_empty() {
            Value::Null
        } else {
            match serde_json::from_str(&body_str) {
                Ok(v) => v,
                Err(e) => {
                    let mut res = Response::builder()
                        .status(StatusCode::BAD_REQUEST)
                        .body(Full::new(Bytes::from(format!("invalid JSON: {}", e))))
                        .unwrap();
                    add_cors_headers(res.headers_mut());
                    return Ok(res);
                }
            }
        };

        // Run blocking dispatch in spawn_blocking so it doesn't block the async executor
        let cmd_owned = command.to_string();
        let args_owned = args;
        let result = tokio::task::spawn_blocking(move || dispatch(&cmd_owned, args_owned))
            .await;

        match result {
            Ok(Ok(result)) => {
                let body = serde_json::to_string(&result).unwrap_or_else(|e| {
                    format!("{{\"error\": \"serialization error: {}\"}}", e)
                });
                let mut res = Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "application/json")
                    .body(Full::new(Bytes::from(body)))
                    .unwrap();
                add_cors_headers(res.headers_mut());
                return Ok(res);
            }
            Ok(Err(err)) => {
                let mut res = Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .header("Content-Type", "text/plain")
                    .body(Full::new(Bytes::from(err)))
                    .unwrap();
                add_cors_headers(res.headers_mut());
                return Ok(res);
            }
            Err(e) => {
                let mut res = Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .header("Content-Type", "text/plain")
                    .body(Full::new(Bytes::from(format!("task error: {}", e))))
                    .unwrap();
                add_cors_headers(res.headers_mut());
                return Ok(res);
            }
        }
    }

    let mut res = Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(Full::new(Bytes::from("not found")))
        .unwrap();
    add_cors_headers(res.headers_mut());
    Ok(res)
}