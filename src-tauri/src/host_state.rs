use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_json::json;
use tauri::{AppHandle, Manager};

const PORTABLE_USER_STATE_FOLDER: &str = "ResonantOS_User";

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

fn user_home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
}

fn portable_user_state_root_for_home(home_dir: PathBuf) -> PathBuf {
    home_dir.join(PORTABLE_USER_STATE_FOLDER)
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
    if let Some(home_dir) = user_home_dir() {
        return Ok((
            portable_user_state_root_for_home(home_dir),
            "home-default".to_string(),
        ));
    }
    Ok((
        app_state_dir(app)?.join(PORTABLE_USER_STATE_FOLDER),
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

pub(crate) fn assert_living_archive_host_access(
    app: &AppHandle,
    required_capabilities: &[&str],
) -> Result<(), String> {
    let Some(state) = read_runtime_state_value(app)? else {
        return Err(
            "Living Archive is not active. Enable a memory-system add-on before running archive actions."
                .to_string(),
        );
    };
    assert_living_archive_host_access_from_state(&state, required_capabilities)
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
    let installed = installation
        .get("installed")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !installed {
        return Err(format!("Add-on `{addon_id}` is not installed."));
    }
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

fn assert_living_archive_host_access_from_state(
    state: &Value,
    required_capabilities: &[&str],
) -> Result<(), String> {
    let mut capabilities = Vec::with_capacity(required_capabilities.len() + 1);
    capabilities.push("memory-provider");
    capabilities.extend_from_slice(required_capabilities);
    assert_addon_capabilities_from_state(state, "addon.living-archive", &capabilities)
        .map_err(|error| {
            format!(
                "Living Archive host service is unavailable: {error} Enable Living Archive as the active memory-system provider or select another memory add-on."
            )
        })
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

fn legacy_provider_secrets_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_state_dir(app)?.join("provider-secrets.json"))
}

fn read_provider_secrets_file(path: &PathBuf) -> Result<HashMap<String, String>, String> {
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read provider secrets: {error}"))?;
    serde_json::from_str::<HashMap<String, String>>(&raw)
        .map_err(|error| format!("Invalid provider secrets JSON: {error}"))
}

fn merge_legacy_provider_secrets(
    mut portable: HashMap<String, String>,
    legacy: &HashMap<String, String>,
) -> (HashMap<String, String>, bool) {
    let mut changed = false;
    for (provider_id, secret) in legacy {
        if !secret.trim().is_empty() && !portable.contains_key(provider_id) {
            portable.insert(provider_id.clone(), secret.clone());
            changed = true;
        }
    }
    (portable, changed)
}

fn legacy_provider_secrets_migrated(
    portable: &HashMap<String, String>,
    legacy: &HashMap<String, String>,
) -> bool {
    legacy
        .iter()
        .all(|(provider_id, secret)| secret.trim().is_empty() || portable.contains_key(provider_id))
}

pub(crate) fn read_provider_secrets(app: &AppHandle) -> Result<HashMap<String, String>, String> {
    let path = provider_secrets_file(app)?;
    let portable_secrets = read_provider_secrets_file(&path)?;
    let legacy_path = legacy_provider_secrets_file(app)?;
    let legacy_secrets = read_provider_secrets_file(&legacy_path)?;
    let (merged_secrets, migrated) =
        merge_legacy_provider_secrets(portable_secrets, &legacy_secrets);

    if migrated {
        let payload = serde_json::to_string_pretty(&merged_secrets)
            .map_err(|error| format!("Failed to encode migrated provider secrets: {error}"))?;
        fs::write(&path, payload)
            .map_err(|error| format!("Failed to migrate provider secrets: {error}"))?;
    }
    if legacy_path.exists() && legacy_provider_secrets_migrated(&merged_secrets, &legacy_secrets) {
        fs::remove_file(&legacy_path).map_err(|error| {
            format!(
                "Failed to remove migrated legacy provider secrets {}: {error}",
                legacy_path.display()
            )
        })?;
    }

    Ok(merged_secrets)
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
    use super::{
        assert_addon_capabilities_from_state, assert_living_archive_host_access_from_state,
        legacy_provider_secrets_migrated, merge_legacy_provider_secrets,
        portable_user_state_root_for_home,
    };
    use std::collections::HashMap;
    use std::path::PathBuf;

    use serde_json::json;

    #[test]
    fn home_default_portable_user_state_root_avoids_documents_tcc_prompt() {
        let root = portable_user_state_root_for_home(PathBuf::from("/Users/example"));
        assert_eq!(root, PathBuf::from("/Users/example/ResonantOS_User"));
    }

    #[test]
    fn addon_capability_gate_requires_enabled_grants() {
        let state = json!({
            "installations": {
                "addon.browser": {
                    "installed": true,
                    "enabled": true,
                    "grantedCapabilities": [
                        { "capability": "network", "granted": true },
                        { "capability": "browser-control", "granted": true },
                        { "capability": "ui-embedding", "granted": false }
                    ]
                }
            }
        });

        assert!(
            assert_addon_capabilities_from_state(
                &state,
                "addon.browser",
                &["network", "browser-control"]
            )
            .is_ok()
        );
        assert!(
            assert_addon_capabilities_from_state(&state, "addon.browser", &["ui-embedding"])
                .is_err()
        );
    }

    #[test]
    fn addon_capability_gate_requires_installed_state() {
        let state = json!({
            "installations": {
                "addon.opencode": {
                    "installed": false,
                    "enabled": true,
                    "grantedCapabilities": [
                        { "capability": "filesystem", "granted": true },
                        { "capability": "shell", "granted": true }
                    ]
                }
            }
        });

        let error = assert_addon_capabilities_from_state(
            &state,
            "addon.opencode",
            &["filesystem", "shell"],
        )
        .expect_err("uninstalled add-on must not pass host capability gate");

        assert_eq!(error, "Add-on `addon.opencode` is not installed.");
    }

    #[test]
    fn living_archive_host_access_requires_active_memory_provider_grants() {
        let state = json!({
            "installations": {
                "addon.living-archive": {
                    "installed": true,
                    "enabled": true,
                    "grantedCapabilities": [
                        { "capability": "memory-provider", "granted": true },
                        { "capability": "archive-read", "granted": true },
                        { "capability": "archive-intake-write", "granted": false }
                    ]
                }
            }
        });

        assert!(assert_living_archive_host_access_from_state(&state, &["archive-read"]).is_ok());
        assert!(
            assert_living_archive_host_access_from_state(&state, &["archive-intake-write"])
                .is_err()
        );
    }

    #[test]
    fn living_archive_host_access_stops_when_memory_provider_is_disabled() {
        let state = json!({
            "installations": {
                "addon.living-archive": {
                    "installed": true,
                    "enabled": false,
                    "grantedCapabilities": [
                        { "capability": "memory-provider", "granted": true },
                        { "capability": "archive-read", "granted": true }
                    ]
                }
            }
        });

        assert!(assert_living_archive_host_access_from_state(&state, &["archive-read"]).is_err());
    }

    #[test]
    fn provider_secret_migration_preserves_portable_values_and_adds_legacy_missing_keys() {
        let portable = HashMap::from([(
            "shared-openai".to_string(),
            "portable-openai-secret".to_string(),
        )]);
        let legacy = HashMap::from([
            (
                "shared-openai".to_string(),
                "legacy-openai-secret".to_string(),
            ),
            (
                "shared-minimax".to_string(),
                "legacy-minimax-secret".to_string(),
            ),
            ("empty-provider".to_string(), "   ".to_string()),
        ]);

        let (merged, changed) = merge_legacy_provider_secrets(portable, &legacy);

        assert!(changed);
        assert_eq!(
            merged.get("shared-openai"),
            Some(&"portable-openai-secret".to_string())
        );
        assert_eq!(
            merged.get("shared-minimax"),
            Some(&"legacy-minimax-secret".to_string())
        );
        assert!(!merged.contains_key("empty-provider"));
    }

    #[test]
    fn provider_secret_migration_can_remove_legacy_copy_after_all_keys_exist() {
        let portable = HashMap::from([
            (
                "shared-openai".to_string(),
                "portable-openai-secret".to_string(),
            ),
            (
                "shared-minimax".to_string(),
                "legacy-minimax-secret".to_string(),
            ),
        ]);
        let legacy = HashMap::from([
            (
                "shared-openai".to_string(),
                "stale-legacy-openai-secret".to_string(),
            ),
            (
                "shared-minimax".to_string(),
                "legacy-minimax-secret".to_string(),
            ),
            ("empty-provider".to_string(), "   ".to_string()),
        ]);

        assert!(legacy_provider_secrets_migrated(&portable, &legacy));
    }
}
