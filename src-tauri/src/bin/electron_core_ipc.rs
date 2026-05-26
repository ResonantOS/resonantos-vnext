// Intent citation: docs/architecture/ADR-035-electron-host-rust-core-runtime.md
//
// Minimal JSON-lines IPC proof for the Electron host migration. This binary is
// intentionally narrow: it proves Electron can call a Rust-owned privileged
// boundary without exposing secrets or arbitrary command execution.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

#[derive(Debug, Deserialize)]
struct IpcRequest {
    id: Value,
    method: String,
    #[allow(dead_code)]
    params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct IpcResponse {
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

fn handle_request(request: IpcRequest) -> IpcResponse {
    match request.method.as_str() {
        "core.health" => IpcResponse {
            id: request.id,
            result: Some(json!({
                "ready": true,
                "service": "resonantos-rust-core",
                "privilegedBoundary": "rust",
                "allowedMethods": ["core.health"],
                "secretsExposed": false,
            })),
            error: None,
        },
        _ => IpcResponse {
            id: request.id,
            result: None,
            error: Some(json!({
                "code": "method_not_allowed",
                "message": "Electron host IPC proof only allows core.health.",
            })),
        },
    }
}

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let response = match line {
            Ok(line) => match serde_json::from_str::<IpcRequest>(&line) {
                Ok(request) => handle_request(request),
                Err(error) => IpcResponse {
                    id: Value::Null,
                    result: None,
                    error: Some(json!({
                        "code": "invalid_json",
                        "message": error.to_string(),
                    })),
                },
            },
            Err(error) => IpcResponse {
                id: Value::Null,
                result: None,
                error: Some(json!({
                    "code": "stdin_error",
                    "message": error.to_string(),
                })),
            },
        };

        if let Ok(serialized) = serde_json::to_string(&response) {
            let _ = writeln!(stdout, "{serialized}");
            let _ = stdout.flush();
        }
    }
}
