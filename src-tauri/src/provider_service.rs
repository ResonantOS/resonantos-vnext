use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::host_state::{read_runtime_state_value, resolve_provider_secret};

fn strip_think_blocks(content: &str) -> String {
    let mut output = String::new();
    let mut remainder = content;

    while let Some(start) = remainder.find("<think>") {
        output.push_str(&remainder[..start]);
        let after_start = &remainder[start + "<think>".len()..];
        if let Some(end) = after_start.find("</think>") {
            remainder = &after_start[end + "</think>".len()..];
        } else {
            remainder = "";
            break;
        }
    }

    output.push_str(remainder);
    output.trim().to_string()
}

fn sanitize_assistant_content(provider_type: &str, content: &str) -> String {
    match provider_type {
        "minimax" => strip_think_blocks(content),
        _ => content.trim().to_string(),
    }
}

fn request_messages_with_system_prompt(
    system_prompt: &str,
    messages: Vec<ChatMessageInput>,
) -> Vec<Value> {
    std::iter::once(json!({
        "role": "system",
        "content": system_prompt,
    }))
    .chain(messages.into_iter().map(|message| {
        json!({
            "role": message.role,
            "content": message.content,
        })
    }))
    .collect()
}

fn extract_assistant_content(payload: &Value) -> Result<String, String> {
    let content_value = payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .ok_or_else(|| "Model response did not include assistant content.".to_string())?;

    if let Some(text) = content_value.as_str() {
        return Ok(text.to_string());
    }

    if let Some(parts) = content_value.as_array() {
        let text = parts
            .iter()
            .filter_map(|part| {
                part.get("text")
                    .and_then(Value::as_str)
                    .or_else(|| part.get("content").and_then(Value::as_str))
            })
            .collect::<Vec<_>>()
            .join("\n");
        if !text.trim().is_empty() {
            return Ok(text);
        }
    }

    Err("Model response content format was not recognized.".to_string())
}

fn extract_local_assistant_content(payload: &Value) -> Result<String, String> {
    payload
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| "Local runtime response did not include assistant content.".to_string())
}

#[derive(Clone, Deserialize)]
pub(crate) struct ChatMessageInput {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Deserialize)]
pub(crate) struct ProviderServiceChatRequest {
    pub(crate) provider_id: String,
    pub(crate) provider_type: String,
    pub(crate) api_base_url: Option<String>,
    pub(crate) runtime_node_id: Option<String>,
    pub(crate) runtime_node_kind: Option<String>,
    pub(crate) runtime_node_endpoint: Option<String>,
    pub(crate) auth_tier: Option<String>,
    pub(crate) model: String,
    pub(crate) reasoning_effort: String,
    pub(crate) system_prompt: String,
    pub(crate) messages: Vec<ChatMessageInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveIngestProbeRequest {
    pub(crate) provider_id: String,
    pub(crate) provider_type: String,
    pub(crate) api_base_url: Option<String>,
    pub(crate) runtime_node_id: Option<String>,
    pub(crate) runtime_node_kind: Option<String>,
    pub(crate) runtime_node_endpoint: Option<String>,
    pub(crate) auth_tier: Option<String>,
    pub(crate) model: String,
    pub(crate) source_label: String,
    pub(crate) source_excerpt: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveIngestProbeResult {
    pub(crate) source_label: String,
    pub(crate) summary: String,
    pub(crate) checked_at: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ProviderExecutionAdapter {
    CloudOpenAiCompatible,
    CloudMiniMaxCompatible,
    LocalOllama,
}

impl ProviderExecutionAdapter {
    fn id(self) -> &'static str {
        match self {
            Self::CloudOpenAiCompatible => "cloud-openai-compatible",
            Self::CloudMiniMaxCompatible => "cloud-minimax-compatible",
            Self::LocalOllama => "local-ollama",
        }
    }
}

fn resolve_provider_execution_adapter(
    provider_type: &str,
    runtime_node_kind: Option<&str>,
) -> Result<ProviderExecutionAdapter, String> {
    match runtime_node_kind.unwrap_or("cloud") {
        "local" => Ok(ProviderExecutionAdapter::LocalOllama),
        "cloud" => match provider_type {
            "minimax" => Ok(ProviderExecutionAdapter::CloudMiniMaxCompatible),
            "openai" | "openai-compatible" => Ok(ProviderExecutionAdapter::CloudOpenAiCompatible),
            unsupported => Err(format!(
                "Unsupported provider type for cloud adapter resolution: {unsupported}"
            )),
        },
        unsupported_kind => Err(format!(
            "Unsupported runtime node kind for adapter resolution: {unsupported_kind}"
        )),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalRuntimeStatus {
    pub(crate) available: bool,
    pub(crate) target_model: String,
    pub(crate) recovery_model_installed: bool,
    pub(crate) recovery_model_running: bool,
    pub(crate) installed_models: Vec<String>,
    pub(crate) running_models: Vec<String>,
    pub(crate) ollama_list_raw: String,
    pub(crate) ollama_ps_raw: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecoveryRouteCandidate {
    pub(crate) id: String,
    pub(crate) provider_id: String,
    pub(crate) provider_label: String,
    pub(crate) runtime_node_id: String,
    pub(crate) runtime_node_label: String,
    pub(crate) runtime_kind: String,
    pub(crate) model: String,
    pub(crate) credential_configured: bool,
    pub(crate) reachable: bool,
    pub(crate) promotable: bool,
    pub(crate) recommended: bool,
    pub(crate) reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderRuntimeDiagnostic {
    pub(crate) runtime_node_id: String,
    pub(crate) runtime_node_label: String,
    pub(crate) runtime_kind: String,
    pub(crate) locality: String,
    pub(crate) probe_state: String,
    pub(crate) detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderDiagnosticReport {
    pub(crate) provider_id: String,
    pub(crate) provider_label: String,
    pub(crate) provider_type: String,
    pub(crate) auth_method: String,
    pub(crate) auth_tier: String,
    pub(crate) execution_adapter: String,
    pub(crate) credential_configured: bool,
    pub(crate) status: String,
    pub(crate) summary: String,
    pub(crate) checked_at: String,
    pub(crate) primary_model: String,
    pub(crate) fallback_model: Option<String>,
    pub(crate) runtime_diagnostics: Vec<ProviderRuntimeDiagnostic>,
}

pub(crate) fn ensure_runtime_kind_supported(
    runtime_node_id: Option<&str>,
    runtime_node_kind: Option<&str>,
    auth_tier: Option<&str>,
) -> Result<(), String> {
    if let Some(kind) = runtime_node_kind {
        if kind != "cloud" && kind != "local" {
            let tier_note = auth_tier
                .map(|tier| format!(" ({tier})"))
                .unwrap_or_default();
            let node_note = runtime_node_id
                .map(|node| format!("Runtime node `{node}`"))
                .unwrap_or_else(|| "Selected runtime node".to_string());
            return Err(format!(
                "{node_note} is a {kind} route{tier_note}, but live Strategist chat currently supports only cloud and desktop-local runtime nodes."
            ));
        }
    }
    Ok(())
}

fn resolve_provider_base_url(
    provider_type: &str,
    api_base_url: Option<String>,
    runtime_node_endpoint: Option<String>,
) -> Result<String, String> {
    match provider_type {
        "openai" | "openai-compatible" => Ok(runtime_node_endpoint
            .or(api_base_url)
            .unwrap_or_else(|| "https://api.openai.com/v1".to_string())),
        "minimax" => Ok(runtime_node_endpoint
            .or(api_base_url)
            .unwrap_or_else(|| "https://api.minimax.io/v1".to_string())),
        unsupported => Err(format!(
            "Unsupported provider type for live provider service chat: {unsupported}"
        )),
    }
}

fn resolve_local_runtime_model(model: &str) -> &str {
    match model {
        "local/creative" => "batiai/gemma4-e2b:q4",
        "local/transcribe" => "llama3.2:1b",
        other => other,
    }
}

fn local_runtime_base_url(runtime_node_endpoint: Option<String>) -> String {
    runtime_node_endpoint.unwrap_or_else(|| "http://127.0.0.1:11434".to_string())
}

fn parse_ollama_model_names(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .skip(1)
        .filter_map(|line| line.split_whitespace().next())
        .map(ToString::to_string)
        .collect()
}

async fn ollama_ready(base_url: &str) -> bool {
    let client = reqwest::Client::new();
    match client
        .get(format!("{}/api/tags", base_url.trim_end_matches('/')))
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

async fn ensure_local_runtime_ready(base_url: &str) -> Result<(), String> {
    if ollama_ready(base_url).await {
        return Ok(());
    }

    Command::new("ollama")
        .arg("serve")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!("Failed to launch local runtime service via `ollama serve`: {error}")
        })?;

    for _ in 0..10 {
        thread::sleep(Duration::from_millis(400));
        if ollama_ready(base_url).await {
            return Ok(());
        }
    }

    Err("Local runtime service did not become ready after a resurrect attempt.".to_string())
}

pub(crate) fn query_local_runtime_status(target_model: Option<String>) -> LocalRuntimeStatus {
    let target_model =
        resolve_local_runtime_model(target_model.as_deref().unwrap_or("local/creative"))
            .to_string();

    let (available, installed_models, ollama_list_raw) =
        match Command::new("ollama").arg("list").output() {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                (true, parse_ollama_model_names(&stdout), stdout)
            }
            Ok(output) => (
                false,
                Vec::new(),
                String::from_utf8_lossy(&output.stderr).to_string(),
            ),
            Err(error) => (
                false,
                Vec::new(),
                format!("Failed to run `ollama list`: {error}"),
            ),
        };

    let (running_models, ollama_ps_raw) = match Command::new("ollama").arg("ps").output() {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            (parse_ollama_model_names(&stdout), stdout)
        }
        Ok(output) => (
            Vec::new(),
            String::from_utf8_lossy(&output.stderr).to_string(),
        ),
        Err(error) => (Vec::new(), format!("Failed to run `ollama ps`: {error}")),
    };

    let recovery_model_installed = installed_models.iter().any(|model| model == &target_model);
    let recovery_model_running = running_models.iter().any(|model| model == &target_model);

    LocalRuntimeStatus {
        available,
        target_model,
        recovery_model_installed,
        recovery_model_running,
        installed_models,
        running_models,
        ollama_list_raw,
        ollama_ps_raw,
    }
}

pub(crate) async fn probe_http_endpoint(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|error| format!("Failed to build HTTP client: {error}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Failed to reach `{url}`: {error}"))?;
    Ok(format!("reachable with HTTP {}", response.status()))
}

fn runtime_kind_rank(kind: &str) -> usize {
    match kind {
        "remote-user-owned" => 0,
        "cloud" => 1,
        "local" => 2,
        _ => 3,
    }
}

fn now_iso_string() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => format!("unix:{}", duration.as_secs()),
        Err(_) => "unix:0".to_string(),
    }
}

pub(crate) async fn query_recovery_route_candidates(
    app: &AppHandle,
) -> Result<Vec<RecoveryRouteCandidate>, String> {
    let state = read_runtime_state_value(app)?.ok_or_else(|| {
        "Runtime state is not available for recovery candidate probing.".to_string()
    })?;
    let providers = state
        .get("providers")
        .and_then(Value::as_array)
        .ok_or_else(|| "Runtime state does not include providers.".to_string())?;
    let runtime_nodes = state
        .get("runtimeNodes")
        .and_then(Value::as_array)
        .ok_or_else(|| "Runtime state does not include runtime nodes.".to_string())?;

    let mut candidates = Vec::new();

    for provider in providers {
        let provider_id = provider.get("id").and_then(Value::as_str).unwrap_or("");
        if provider_id == "shared-local" {
            continue;
        }
        let provider_label = provider
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or(provider_id)
            .to_string();
        let primary_model = provider
            .get("primaryModel")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let credential_configured = resolve_provider_secret(app, provider_id)?.is_some();

        for node in runtime_nodes.iter().filter(|node| {
            node.get("providerProfileId").and_then(Value::as_str) == Some(provider_id)
        }) {
            let runtime_node_id = node
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            let runtime_node_label = node
                .get("label")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            let runtime_kind = node
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            let endpoint = node
                .get("endpoint")
                .and_then(Value::as_str)
                .or_else(|| provider.get("apiBaseUrl").and_then(Value::as_str));
            let reachable = match runtime_kind.as_str() {
                "cloud" => {
                    if let Some(url) = endpoint {
                        probe_http_endpoint(url).await.is_ok()
                    } else {
                        false
                    }
                }
                "remote-user-owned" => {
                    if let Some(url) = endpoint {
                        if url.starts_with("http://") || url.starts_with("https://") {
                            probe_http_endpoint(url).await.is_ok()
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                }
                _ => false,
            };

            let promotable = credential_configured
                && reachable
                && (runtime_kind == "cloud" || runtime_kind == "remote-user-owned");
            let reason = if !credential_configured {
                "Credentials are not configured for this provider.".to_string()
            } else if !reachable {
                match endpoint {
                    Some(url) if url.starts_with("http://") || url.starts_with("https://") => {
                        format!("Endpoint probe failed for {url}.")
                    }
                    Some(url) => format!(
                        "Runtime endpoint `{url}` is not probeable by the current host service."
                    ),
                    None => "No probeable endpoint is configured for this route.".to_string(),
                }
            } else if promotable {
                format!(
                    "Route is reachable and stronger than the local recovery floor via {}.",
                    runtime_node_label
                )
            } else {
                "Route is not promotable in the current host/runtime policy.".to_string()
            };

            candidates.push(RecoveryRouteCandidate {
                id: format!("{}::{}", provider_id, runtime_node_id),
                provider_id: provider_id.to_string(),
                provider_label: provider_label.clone(),
                runtime_node_id,
                runtime_node_label,
                runtime_kind,
                model: primary_model.clone(),
                credential_configured,
                reachable,
                promotable,
                recommended: false,
                reason,
            });
        }
    }

    candidates.sort_by_key(|candidate| {
        (
            !candidate.promotable,
            runtime_kind_rank(&candidate.runtime_kind),
            candidate.provider_id.clone(),
        )
    });

    if let Some(index) = candidates.iter().position(|candidate| candidate.promotable) {
        candidates[index].recommended = true;
    }

    Ok(candidates)
}

pub(crate) async fn query_provider_diagnostics(
    app: &AppHandle,
    provider_id_filter: Option<&str>,
) -> Result<Vec<ProviderDiagnosticReport>, String> {
    let state = read_runtime_state_value(app)?
        .ok_or_else(|| "Runtime state is not available for provider diagnostics.".to_string())?;
    let providers = state
        .get("providers")
        .and_then(Value::as_array)
        .ok_or_else(|| "Runtime state does not include providers.".to_string())?;
    let runtime_nodes = state
        .get("runtimeNodes")
        .and_then(Value::as_array)
        .ok_or_else(|| "Runtime state does not include runtime nodes.".to_string())?;

    let local_target_model = providers
        .iter()
        .find(|provider| provider.get("id").and_then(Value::as_str) == Some("shared-local"))
        .and_then(|provider| provider.get("primaryModel"))
        .and_then(Value::as_str)
        .unwrap_or("batiai/gemma4-e2b:q4")
        .to_string();
    let local_status = query_local_runtime_status(Some(local_target_model));
    let checked_at = now_iso_string();

    let mut reports = Vec::new();

    for provider in providers {
        let provider_id = provider.get("id").and_then(Value::as_str).unwrap_or("");
        if let Some(filter) = provider_id_filter {
            if provider_id != filter {
                continue;
            }
        }

        let provider_type = provider
            .get("providerType")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        let provider_label = provider
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or(provider_id)
            .to_string();
        let auth_method = provider
            .get("authMethod")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        let auth_tier = provider
            .get("authTier")
            .and_then(Value::as_str)
            .unwrap_or("unavailable")
            .to_string();
        let primary_model = provider
            .get("primaryModel")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let fallback_model = provider
            .get("fallbackModel")
            .and_then(Value::as_str)
            .map(ToString::to_string);

        let credential_configured = if provider_type == "local" {
            true
        } else {
            resolve_provider_secret(app, provider_id)?.is_some()
        };

        let mut runtime_diagnostics = Vec::new();
        let mut any_healthy = false;
        let mut any_attention = false;

        for node in runtime_nodes.iter().filter(|node| {
            node.get("providerProfileId").and_then(Value::as_str) == Some(provider_id)
        }) {
            let runtime_node_id = node
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            let runtime_node_label = node
                .get("label")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            let runtime_kind = node
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            let locality = node
                .get("locality")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            let endpoint = node.get("endpoint").and_then(Value::as_str);

            let (probe_state, detail) = if runtime_kind == "local" {
                if !local_status.available {
                    (
                        "attention".to_string(),
                        "Local runtime is not responding.".to_string(),
                    )
                } else if local_status.recovery_model_installed {
                    any_healthy = true;
                    (
                        "healthy".to_string(),
                        if local_status.recovery_model_running {
                            format!(
                                "{} is installed and already loaded.",
                                local_status.target_model
                            )
                        } else {
                            format!(
                                "{} is installed and can be loaded on demand.",
                                local_status.target_model
                            )
                        },
                    )
                } else {
                    any_attention = true;
                    (
                        "attention".to_string(),
                        format!(
                            "{} is not installed on the local runtime.",
                            local_status.target_model
                        ),
                    )
                }
            } else if !credential_configured {
                any_attention = true;
                (
                    "attention".to_string(),
                    "Credentials are not configured for this provider.".to_string(),
                )
            } else if let Some(url) = endpoint {
                if url.starts_with("http://") || url.starts_with("https://") {
                    match probe_http_endpoint(url).await {
                        Ok(outcome) => {
                            any_healthy = true;
                            ("healthy".to_string(), outcome)
                        }
                        Err(error) => {
                            any_attention = true;
                            ("attention".to_string(), error)
                        }
                    }
                } else {
                    any_attention = true;
                    (
                        "unprobeable".to_string(),
                        format!("Endpoint `{url}` is not probeable by the current desktop host."),
                    )
                }
            } else if let Some(url) = provider.get("apiBaseUrl").and_then(Value::as_str) {
                match probe_http_endpoint(url).await {
                    Ok(outcome) => {
                        any_healthy = true;
                        ("healthy".to_string(), outcome)
                    }
                    Err(error) => {
                        any_attention = true;
                        ("attention".to_string(), error)
                    }
                }
            } else {
                any_attention = true;
                (
                    "unavailable".to_string(),
                    "No endpoint is configured for this runtime node.".to_string(),
                )
            };

            runtime_diagnostics.push(ProviderRuntimeDiagnostic {
                runtime_node_id,
                runtime_node_label,
                runtime_kind,
                locality,
                probe_state,
                detail,
            });
        }

        let (status, summary) = if provider_type == "local" {
            if local_status.available && local_status.recovery_model_installed {
                (
                    "healthy".to_string(),
                    "Local runtime is ready for recovery routing.".to_string(),
                )
            } else if local_status.available {
                (
                    "attention".to_string(),
                    format!(
                        "Local runtime is available, but {} is not installed.",
                        local_status.target_model
                    ),
                )
            } else {
                (
                    "attention".to_string(),
                    "Local runtime is unavailable and may require resurrection.".to_string(),
                )
            }
        } else if !credential_configured {
            (
                "attention".to_string(),
                "Credentials are not configured.".to_string(),
            )
        } else if any_healthy {
            (
                "healthy".to_string(),
                "Provider has at least one healthy runtime route.".to_string(),
            )
        } else if any_attention {
            (
                "attention".to_string(),
                "Provider is configured but requires attention before it can be used.".to_string(),
            )
        } else {
            (
                "unavailable".to_string(),
                "Provider does not currently expose a usable runtime route.".to_string(),
            )
        };

        let execution_adapter = resolve_provider_execution_adapter(
            &provider_type,
            runtime_nodes
                .iter()
                .find(|node| {
                    node.get("providerProfileId").and_then(Value::as_str) == Some(provider_id)
                })
                .and_then(|node| node.get("kind"))
                .and_then(Value::as_str),
        )
        .map(|adapter| adapter.id().to_string())
        .unwrap_or_else(|_| "unsupported".to_string());

        reports.push(ProviderDiagnosticReport {
            provider_id: provider_id.to_string(),
            provider_label,
            provider_type,
            auth_method,
            auth_tier,
            execution_adapter,
            credential_configured,
            status,
            summary,
            checked_at: checked_at.clone(),
            primary_model,
            fallback_model,
            runtime_diagnostics,
        });
    }

    Ok(reports)
}

async fn execute_cloud_provider_service_chat(
    app: &AppHandle,
    request: &ProviderServiceChatRequest,
) -> Result<String, String> {
    let api_key = resolve_provider_secret(app, &request.provider_id)?.ok_or_else(|| {
        "No provider secret is configured for this Strategist profile.".to_string()
    })?;

    let base_url = resolve_provider_base_url(
        &request.provider_type,
        request.api_base_url.clone(),
        request.runtime_node_endpoint.clone(),
    )?;

    let request_messages =
        request_messages_with_system_prompt(&request.system_prompt, request.messages.clone());

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "{}/chat/completions",
            base_url.trim_end_matches('/')
        ))
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&match request.provider_type.as_str() {
            "minimax" => json!({
                "model": request.model,
                "messages": request_messages
            }),
            _ => json!({
                "model": request.model,
                "messages": request_messages,
                "reasoning_effort": request.reasoning_effort
            }),
        })
        .send()
        .await
        .map_err(|error| format!("Failed to reach model provider: {error}"))?;

    let status = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| format!("Failed to decode model response: {error}"))?;

    if !status.is_success() {
        let api_error = payload
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("Model provider request failed.");
        return Err(api_error.to_string());
    }

    let content = extract_assistant_content(&payload)?;
    Ok(sanitize_assistant_content(&request.provider_type, &content))
}

async fn execute_local_provider_service_chat(
    request: &ProviderServiceChatRequest,
) -> Result<String, String> {
    let base_url = local_runtime_base_url(request.runtime_node_endpoint.clone());
    ensure_local_runtime_ready(&base_url).await?;

    let request_messages =
        request_messages_with_system_prompt(&request.system_prompt, request.messages.clone());

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/api/chat", base_url.trim_end_matches('/')))
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": resolve_local_runtime_model(&request.model),
            "messages": request_messages,
            "stream": false
        }))
        .send()
        .await
        .map_err(|error| format!("Failed to reach local runtime: {error}"))?;

    let status = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| format!("Failed to decode local runtime response: {error}"))?;

    if !status.is_success() {
        let api_error = payload
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Local runtime request failed.");
        return Err(api_error.to_string());
    }

    let content = extract_local_assistant_content(&payload)?;
    Ok(sanitize_assistant_content("local", &content))
}

pub(crate) async fn execute_provider_service_chat(
    app: &AppHandle,
    request: ProviderServiceChatRequest,
) -> Result<String, String> {
    ensure_runtime_kind_supported(
        request.runtime_node_id.as_deref(),
        request.runtime_node_kind.as_deref(),
        request.auth_tier.as_deref(),
    )?;
    let adapter = resolve_provider_execution_adapter(
        &request.provider_type,
        request.runtime_node_kind.as_deref(),
    )?;

    match adapter {
        ProviderExecutionAdapter::LocalOllama => {
            execute_local_provider_service_chat(&request).await
        }
        ProviderExecutionAdapter::CloudOpenAiCompatible
        | ProviderExecutionAdapter::CloudMiniMaxCompatible => {
            execute_cloud_provider_service_chat(app, &request).await
        }
    }
}

pub(crate) async fn execute_archive_ingest_probe(
    app: &AppHandle,
    request: ArchiveIngestProbeRequest,
) -> Result<ArchiveIngestProbeResult, String> {
    let system_prompt = [
        "You are the Resonant Ingest Agent running a route validation probe for Living Archive intake.",
        "This is not a final archive write. It is a controlled service probe.",
        "Read the source excerpt and produce a concise operational assessment with exactly three short sections:",
        "1. Summary",
        "2. Candidate concepts",
        "3. Quality note",
        "Do not use markdown tables.",
        "Do not invent knowledge outside the source excerpt.",
        "Keep the full response under 160 words.",
    ]
    .join(" ");

    let probe_request = ProviderServiceChatRequest {
        provider_id: request.provider_id,
        provider_type: request.provider_type,
        api_base_url: request.api_base_url,
        runtime_node_id: request.runtime_node_id,
        runtime_node_kind: request.runtime_node_kind,
        runtime_node_endpoint: request.runtime_node_endpoint,
        auth_tier: request.auth_tier,
        model: request.model,
        reasoning_effort: "high".to_string(),
        system_prompt,
        messages: vec![ChatMessageInput {
            role: "user".to_string(),
            content: format!(
                "Source label: {}\n\nSource excerpt:\n{}",
                request.source_label, request.source_excerpt
            ),
        }],
    };

    let summary = execute_provider_service_chat(app, probe_request).await?;
    Ok(ArchiveIngestProbeResult {
        source_label: request.source_label,
        summary,
        checked_at: now_iso_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        ensure_runtime_kind_supported, extract_assistant_content, extract_local_assistant_content,
        parse_ollama_model_names, resolve_local_runtime_model, resolve_provider_base_url,
        resolve_provider_execution_adapter, sanitize_assistant_content, strip_think_blocks,
        ProviderExecutionAdapter,
    };
    use serde_json::json;

    #[test]
    fn strips_minimax_thinking_blocks() {
        let content = "<think>internal reasoning</think>\n\nFinal answer";
        assert_eq!(strip_think_blocks(content), "Final answer");
    }

    #[test]
    fn keeps_other_provider_content() {
        assert_eq!(
            sanitize_assistant_content("openai", "Plain answer"),
            "Plain answer"
        );
    }

    #[test]
    fn accepts_local_runtime_nodes_for_live_provider_service_chat() {
        ensure_runtime_kind_supported(
            Some("node-local-resurrect"),
            Some("local"),
            Some("supported"),
        )
        .expect("local runtime should be allowed for live provider service chat");
    }

    #[test]
    fn rejects_remote_runtime_nodes_for_live_provider_service_chat() {
        let error = ensure_runtime_kind_supported(
            Some("node-gx10-qwen"),
            Some("remote-user-owned"),
            Some("supported"),
        )
        .expect_err("remote runtime should still be rejected for live provider service chat");
        assert!(error.contains("cloud and desktop-local runtime nodes"));
    }

    #[test]
    fn prefers_runtime_node_endpoint_when_present() {
        let base_url = resolve_provider_base_url(
            "minimax",
            Some("https://api.minimax.io/v1".to_string()),
            Some("https://edge.minimax.example/v1".to_string()),
        )
        .expect("minimax base url should resolve");
        assert_eq!(base_url, "https://edge.minimax.example/v1");
    }

    #[test]
    fn maps_local_aliases_to_ollama_models() {
        assert_eq!(
            resolve_local_runtime_model("local/creative"),
            "batiai/gemma4-e2b:q4"
        );
        assert_eq!(
            resolve_local_runtime_model("local/transcribe"),
            "llama3.2:1b"
        );
    }

    #[test]
    fn resolves_cloud_and_local_execution_adapters() {
        assert_eq!(
            resolve_provider_execution_adapter("minimax", Some("cloud"))
                .expect("minimax cloud adapter should resolve"),
            ProviderExecutionAdapter::CloudMiniMaxCompatible
        );
        assert_eq!(
            resolve_provider_execution_adapter("openai", Some("cloud"))
                .expect("openai cloud adapter should resolve"),
            ProviderExecutionAdapter::CloudOpenAiCompatible
        );
        assert_eq!(
            resolve_provider_execution_adapter("local", Some("local"))
                .expect("local adapter should resolve"),
            ProviderExecutionAdapter::LocalOllama
        );
    }

    #[test]
    fn parses_ollama_model_names_from_tabular_output() {
        let stdout = "NAME ID SIZE\nbatiai/gemma4-e2b:q4 abc 4.7 GB\nqwen3:4b def 2.5 GB\n";
        let parsed = parse_ollama_model_names(stdout);
        assert_eq!(
            parsed,
            vec!["batiai/gemma4-e2b:q4".to_string(), "qwen3:4b".to_string()]
        );
    }

    #[test]
    fn extracts_cloud_assistant_content() {
        let payload = json!({
            "choices": [
                {
                    "message": {
                        "content": "Cloud answer"
                    }
                }
            ]
        });
        let content = extract_assistant_content(&payload).expect("cloud content should parse");
        assert_eq!(content, "Cloud answer");
    }

    #[test]
    fn extracts_local_assistant_content() {
        let payload = json!({
            "message": {
                "content": "Local answer"
            }
        });
        let content =
            extract_local_assistant_content(&payload).expect("local content should parse");
        assert_eq!(content, "Local answer");
    }
}
