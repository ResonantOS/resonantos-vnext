use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use tauri::{AppHandle, Manager};

pub(crate) fn app_state_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve app config directory: {error}"))?;
    fs::create_dir_all(&base)
        .map_err(|error| format!("Failed to create app config directory: {error}"))?;
    Ok(base)
}

pub(crate) fn state_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_state_dir(app)?.join("runtime-state.json"))
}

pub(crate) fn read_runtime_state_value(app: &AppHandle) -> Result<Option<Value>, String> {
    let path = state_file(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read runtime state: {error}"))?;
    let state = serde_json::from_str::<Value>(&raw)
        .map_err(|error| format!("Invalid runtime state JSON: {error}"))?;
    Ok(Some(state))
}

pub(crate) fn addons_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_state_dir(app)?.join("addons");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create add-on directory: {error}"))?;
    Ok(dir)
}

fn provider_secrets_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_state_dir(app)?.join("provider-secrets.json"))
}

pub(crate) fn read_provider_secrets(app: &AppHandle) -> Result<HashMap<String, String>, String> {
    let path = provider_secrets_file(app)?;
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read provider secrets: {error}"))?;
    serde_json::from_str::<HashMap<String, String>>(&raw)
        .map_err(|error| format!("Invalid provider secrets JSON: {error}"))
}

pub(crate) fn write_provider_secrets(
    app: &AppHandle,
    secrets: &HashMap<String, String>,
) -> Result<(), String> {
    let path = provider_secrets_file(app)?;
    let payload = serde_json::to_string_pretty(secrets)
        .map_err(|error| format!("Failed to encode provider secrets: {error}"))?;
    fs::write(path, payload).map_err(|error| format!("Failed to write provider secrets: {error}"))
}

pub(crate) fn validate_manifest(manifest: &Value) -> Result<(), String> {
    let required_string_keys = ["id", "name", "version", "runtimeType", "description"];
    for key in required_string_keys {
        let valid = manifest
            .get(key)
            .and_then(Value::as_str)
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);
        if !valid {
            return Err(format!("Manifest field `{key}` is required"));
        }
    }

    for key in ["surfaces", "requestedCapabilities"] {
        if !manifest.get(key).map(Value::is_array).unwrap_or(false) {
            return Err(format!("Manifest field `{key}` must be an array"));
        }
    }

    Ok(())
}

pub(crate) fn resolve_provider_secret(
    app: &AppHandle,
    provider_id: &str,
) -> Result<Option<String>, String> {
    let secrets = read_provider_secrets(app)?;
    if let Some(secret) = secrets.get(provider_id) {
        return Ok(Some(secret.clone()));
    }

    if provider_id == "shared-minimax" {
        return Ok(env::var("MINIMAX_API_KEY").ok());
    }

    if provider_id == "shared-openai" {
        return Ok(env::var("OPENAI_API_KEY").ok());
    }

    Ok(None)
}
