use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::json;
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

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PortableUserStateStatus {
    pub(crate) root_path: String,
    pub(crate) manifest_path: String,
    pub(crate) memory_root: String,
    pub(crate) config_root: String,
    pub(crate) secrets_root: String,
    pub(crate) wallets_root: String,
    pub(crate) logs_root: String,
    pub(crate) backups_root: String,
    pub(crate) source: String,
    pub(crate) initialized: bool,
}

fn portable_user_state_root_from_runtime_state(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let Some(state) = read_runtime_state_value(app)? else {
        return Ok(None);
    };
    let configured = state
        .get("portableUserStateRoot")
        .or_else(|| state.get("userStateRoot"))
        .or_else(|| {
            state
                .get("settings")
                .and_then(|settings| settings.get("portableUserStateRoot"))
        })
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    Ok(configured.map(PathBuf::from))
}

pub(crate) fn portable_user_state_root(app: &AppHandle) -> Result<(PathBuf, String), String> {
    if let Some(path) = env::var_os("RESONANTOS_USER_STATE_ROOT") {
        return Ok((
            PathBuf::from(path),
            "env:RESONANTOS_USER_STATE_ROOT".to_string(),
        ));
    }
    if let Some(path) = env::var_os("RESONANT_USER_STATE_ROOT") {
        return Ok((
            PathBuf::from(path),
            "env:RESONANT_USER_STATE_ROOT".to_string(),
        ));
    }
    if let Some(path) = portable_user_state_root_from_runtime_state(app)? {
        return Ok((path, "runtime-state".to_string()));
    }
    if let Ok(documents_dir) = app.path().document_dir() {
        return Ok((
            documents_dir.join("ResonantOS_User"),
            "documents-default".to_string(),
        ));
    }
    Ok((
        app_state_dir(app)?.join("ResonantOS_User"),
        "app-config-default".to_string(),
    ))
}

pub(crate) fn ensure_portable_user_state(
    app: &AppHandle,
) -> Result<PortableUserStateStatus, String> {
    let (root, source) = portable_user_state_root(app)?;
    let memory_root = root.join("Memory");
    let config_root = root.join("Config");
    let secrets_root = root.join("Secrets");
    let wallets_root = root.join("Wallets");
    let logs_root = root.join("Logs");
    let backups_root = root.join("Backups");
    let manifest_path = config_root.join("portable-state-manifest.json");

    for directory in [
        memory_root.join("HUMAN_KNOWLEDGE"),
        memory_root.join("EXTERNAL_KNOWLEDGE"),
        memory_root.join("AI_MEMORY"),
        memory_root.join("INTAKE"),
        memory_root.join("INDEX"),
        memory_root.join("MANIFESTS"),
        config_root.clone(),
        secrets_root.clone(),
        wallets_root.clone(),
        logs_root.join("recovery-reports"),
        backups_root.join("snapshots"),
    ] {
        fs::create_dir_all(&directory).map_err(|error| {
            format!(
                "Failed to create Portable User State directory {}: {error}",
                directory.display()
            )
        })?;
    }

    let initialized = manifest_path.exists();
    if !initialized {
        let payload = json!({
            "schemaVersion": 1,
            "rootKind": "portable-user-state",
            "createdBy": "resonantos-vnext",
            "memorySchemaVersion": 1,
            "configSchemaVersion": 1,
            "vaultSchemaVersion": 1,
            "indexCompatibility": "rebuildable",
            "architectureReference": "docs/architecture/ADR-022-portable-user-state-secure-vault.md",
        });
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&payload).map_err(|error| {
                format!("Failed to encode Portable User State manifest: {error}")
            })?,
        )
        .map_err(|error| {
            format!(
                "Failed to write Portable User State manifest {}: {error}",
                manifest_path.display()
            )
        })?;
    }

    Ok(PortableUserStateStatus {
        root_path: root.display().to_string(),
        manifest_path: manifest_path.display().to_string(),
        memory_root: memory_root.display().to_string(),
        config_root: config_root.display().to_string(),
        secrets_root: secrets_root.display().to_string(),
        wallets_root: wallets_root.display().to_string(),
        logs_root: logs_root.display().to_string(),
        backups_root: backups_root.display().to_string(),
        source,
        initialized,
    })
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

pub(crate) fn assert_addon_capabilities(
    app: &AppHandle,
    addon_id: &str,
    required_capabilities: &[&str],
) -> Result<(), String> {
    let Some(state) = read_runtime_state_value(app)? else {
        return Err(format!(
            "Add-on `{addon_id}` is not configured. Install and grant capabilities before running privileged actions."
        ));
    };
    assert_addon_capabilities_from_state(&state, addon_id, required_capabilities)
}

fn assert_addon_capabilities_from_state(
    state: &Value,
    addon_id: &str,
    required_capabilities: &[&str],
) -> Result<(), String> {
    let installation = state
        .get("installations")
        .and_then(|installations| installations.get(addon_id))
        .ok_or_else(|| format!("Add-on `{addon_id}` is not installed."))?;
    let enabled = installation
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !enabled {
        return Err(format!("Add-on `{addon_id}` is disabled."));
    }
    let grants = installation
        .get("grantedCapabilities")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("Add-on `{addon_id}` has no capability grant record."))?;
    for capability in required_capabilities {
        let granted = grants.iter().any(|grant| {
            grant.get("capability").and_then(Value::as_str) == Some(*capability)
                && grant
                    .get("granted")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
        });
        if !granted {
            return Err(format!(
                "Add-on `{addon_id}` requires `{capability}` capability for this action."
            ));
        }
    }
    Ok(())
}

pub(crate) fn addons_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_state_dir(app)?.join("addons");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create add-on directory: {error}"))?;
    Ok(dir)
}

fn provider_secrets_file(app: &AppHandle) -> Result<PathBuf, String> {
    let portable_state = ensure_portable_user_state(app)?;
    let secrets_root = PathBuf::from(portable_state.secrets_root);
    fs::create_dir_all(&secrets_root)
        .map_err(|error| format!("Failed to create provider secrets directory: {error}"))?;
    Ok(secrets_root.join("provider-secrets.json"))
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

#[cfg(test)]
mod tests {
    use super::assert_addon_capabilities_from_state;
    use serde_json::json;

    #[test]
    fn addon_capability_gate_requires_enabled_grants() {
        let state = json!({
            "installations": {
                "addon.browser": {
                    "enabled": true,
                    "grantedCapabilities": [
                        { "capability": "network", "granted": true },
                        { "capability": "browser-control", "granted": true },
                        { "capability": "ui-embedding", "granted": false }
                    ]
                }
            }
        });

        assert!(assert_addon_capabilities_from_state(
            &state,
            "addon.browser",
            &["network", "browser-control"]
        )
        .is_ok());
        assert!(
            assert_addon_capabilities_from_state(&state, "addon.browser", &["ui-embedding"])
                .is_err()
        );
    }
}
