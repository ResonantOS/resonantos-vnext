use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::compute_service::{
    execute_remote_probe, query_gx10_llama_status, query_nas_backup_status,
    switch_gx10_llama_model, ComputeRemoteProbeRequest, Gx10LlamaSwitchRequest,
};
use crate::host_state::{app_state_dir, read_runtime_state_value, resolve_provider_secret};
use crate::provider_service::{
    execute_provider_service_chat, probe_http_endpoint, query_local_runtime_status,
    ChatMessageInput, ProviderServiceChatRequest,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EngineerRecoveryTurnRequest {
    pub(crate) provider_id: String,
    pub(crate) provider_type: String,
    pub(crate) api_base_url: Option<String>,
    pub(crate) runtime_node_id: Option<String>,
    pub(crate) runtime_node_kind: Option<String>,
    pub(crate) model: String,
    pub(crate) system_prompt: String,
    pub(crate) messages: Vec<ChatMessageInput>,
    pub(crate) runtime_node_endpoint: Option<String>,
    pub(crate) auth_tier: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EngineerToolEvent {
    pub(crate) tool: String,
    pub(crate) summary: String,
    pub(crate) status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EngineerRecoveryTurnResult {
    pub(crate) reply: String,
    pub(crate) tool_events: Vec<EngineerToolEvent>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineerActionEnvelope {
    mode: String,
    tool: Option<String>,
    args: Option<Value>,
    content: Option<String>,
}

fn canonical_existing_dir(path: PathBuf) -> Option<PathBuf> {
    if path.exists() {
        path.canonicalize().ok()
    } else {
        None
    }
}

fn looks_like_workspace_root(candidate: &Path) -> bool {
    candidate.join("package.json").exists()
        && candidate.join("src-tauri").join("tauri.conf.json").exists()
}

fn detect_workspace_root() -> Option<PathBuf> {
    let mut seeds = Vec::new();
    if let Ok(cwd) = env::current_dir() {
        seeds.push(cwd);
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            seeds.push(parent.to_path_buf());
        }
    }

    for seed in seeds {
        for ancestor in seed.ancestors() {
            if looks_like_workspace_root(ancestor) {
                if let Ok(resolved) = ancestor.canonicalize() {
                    return Some(resolved);
                }
            }
        }
    }

    None
}

fn configured_recovery_roots() -> Vec<PathBuf> {
    env::var_os("RESONANT_RECOVERY_ROOTS")
        .as_deref()
        .map(env::split_paths)
        .into_iter()
        .flatten()
        .filter_map(canonical_existing_dir)
        .collect()
}

fn engineer_allowed_roots(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let mut roots = Vec::new();

    roots.push(app_state_dir(app)?);

    if let Some(workspace_root) = detect_workspace_root() {
        roots.push(workspace_root);
    }

    roots.extend(configured_recovery_roots());

    let mut unique_roots = Vec::new();
    for root in roots.into_iter().filter_map(canonical_existing_dir) {
        if !unique_roots
            .iter()
            .any(|candidate: &PathBuf| candidate == &root)
        {
            unique_roots.push(root);
        }
    }

    Ok(unique_roots)
}

fn default_engineer_workdir(app: &AppHandle) -> Result<PathBuf, String> {
    let roots = engineer_allowed_roots(app)?;
    roots
        .into_iter()
        .next()
        .ok_or_else(|| "No recovery roots are configured for the Engineer service.".to_string())
}

fn normalize_engineer_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    let resolved = if candidate.exists() {
        candidate
            .canonicalize()
            .map_err(|error| format!("Failed to resolve path `{path}`: {error}"))?
    } else {
        let parent = candidate
            .parent()
            .ok_or_else(|| format!("Path `{path}` does not have a valid parent directory."))?;
        let resolved_parent = parent
            .canonicalize()
            .map_err(|error| format!("Failed to resolve parent for `{path}`: {error}"))?;
        resolved_parent.join(
            candidate
                .file_name()
                .ok_or_else(|| format!("Path `{path}` does not have a valid filename."))?,
        )
    };

    let allowed = engineer_allowed_roots(app)?
        .into_iter()
        .any(|root| resolved == root || resolved.starts_with(&root));

    if !allowed {
        return Err(format!(
            "Path `{}` is outside the allowed recovery roots.",
            resolved.display()
        ));
    }

    Ok(resolved)
}

pub(crate) fn engineer_allowed_command(program: &str, args: &[String]) -> bool {
    match program {
        "npm" => {
            matches!(args, [arg] if arg == "test")
                || matches!(args, [arg, sub] if arg == "run" && sub == "build")
        }
        "cargo" => args
            .first()
            .map(|arg| arg == "test" || arg == "check")
            .unwrap_or(false),
        "ollama" => args
            .first()
            .map(|arg| arg == "list" || arg == "ps" || arg == "serve" || arg == "pull")
            .unwrap_or(false),
        "rg" | "ls" | "pwd" => true,
        "git" => args
            .first()
            .map(|arg| arg == "status" || arg == "diff")
            .unwrap_or(false),
        _ => false,
    }
}

fn engineer_tool_protocol(app: &AppHandle) -> String {
    let allowed_roots = engineer_allowed_roots(app)
        .map(|roots| {
            if roots.is_empty() {
                "No recovery roots are currently configured.".to_string()
            } else {
                roots
                    .iter()
                    .map(|root| root.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            }
        })
        .unwrap_or_else(|error| format!("Recovery roots could not be resolved: {error}"));

    [
        "Recovery priority ladder:",
        "1. Establish facts and log them.",
        "2. Restore a stronger model or runtime route before attempting deep repair.",
        "3. Promote onto that stronger route when validated.",
        "4. Only then continue with deeper diagnosis and repair.",
        "You may use recovery tools before producing the final answer.",
        "When you need a tool, respond with JSON only and no markdown fences.",
        r#"Tool call schema: {"mode":"tool","tool":"read_file","args":{"path":"/absolute/path","startLine":1,"endLine":120}}"#,
        r#"Final answer schema: {"mode":"final","content":"your answer"}"#,
        "Available tools:",
        "local_runtime_status(targetModel?)",
        "network_probe(url)",
        "provider_probe(providerId)",
        "remote_probe(nodeId) where nodeId is compute-gx10 or compute-nas-backup",
        "gx10_llama_status()",
        "gx10_llama_switch(modelId) where modelId is Qwen3.6-35B-A3B-Q4_K_M.gguf or Qwen3.6-27B-Q4_K_M.gguf. Use only when the user explicitly asks to change or restart a GX10 llama model.",
        "nas_backup_status()",
        "list_files(path, maxEntries?)",
        "search_codebase(query, path?, maxResults?)",
        "read_file(path, startLine?, endLine?)",
        "replace_in_file(path, oldText, newText)",
        "write_file(path, content)",
        "run_command(command, cwd?) where command is an array like [\"npm\",\"test\"]",
        "Keep edits minimal, auditable, and directly tied to the diagnosis.",
        "When a better cloud or remote/local runtime may be recoverable, prefer using network_probe and provider_probe first.",
        &format!("Only touch files inside these allowed roots: {allowed_roots}."),
    ]
    .join(" ")
}

fn strip_json_code_fence(content: &str) -> String {
    let trimmed = content.trim();
    if let Some(stripped) = trimmed.strip_prefix("```json") {
        return stripped.trim().trim_end_matches("```").trim().to_string();
    }
    if let Some(stripped) = trimmed.strip_prefix("```") {
        return stripped.trim().trim_end_matches("```").trim().to_string();
    }
    trimmed.to_string()
}

fn parse_engineer_action(content: &str) -> Option<EngineerActionEnvelope> {
    let normalized = strip_json_code_fence(content);
    serde_json::from_str::<EngineerActionEnvelope>(&normalized).ok()
}

fn summarize_output(output: &str, max_chars: usize) -> String {
    let trimmed = output.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }
    trimmed.chars().take(max_chars).collect::<String>() + "..."
}

async fn execute_engineer_tool(
    app: &AppHandle,
    tool: &str,
    args: Option<Value>,
) -> Result<(String, EngineerToolEvent), String> {
    match tool {
        "local_runtime_status" => {
            let target_model = args
                .as_ref()
                .and_then(|value| value.get("targetModel"))
                .and_then(Value::as_str)
                .map(ToString::to_string);
            let status = query_local_runtime_status(target_model);
            let summary = format!(
                "Ollama available={}, targetInstalled={}, targetRunning={}",
                status.available, status.recovery_model_installed, status.recovery_model_running
            );
            let payload = serde_json::to_string_pretty(&status)
                .map_err(|error| format!("Failed to encode runtime status: {error}"))?;
            Ok((
                payload,
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary,
                    status: "completed".to_string(),
                },
            ))
        }
        "network_probe" => {
            let url = args
                .as_ref()
                .and_then(|value| value.get("url"))
                .and_then(Value::as_str)
                .ok_or_else(|| "network_probe requires `url`.".to_string())?;
            let outcome = probe_http_endpoint(url).await?;
            let payload = json!({
                "url": url,
                "result": outcome,
            });
            Ok((
                serde_json::to_string_pretty(&payload)
                    .map_err(|error| format!("Failed to encode network probe result: {error}"))?,
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary: format!("Probed {url}: {outcome}"),
                    status: "completed".to_string(),
                },
            ))
        }
        "provider_probe" => {
            let provider_id = args
                .as_ref()
                .and_then(|value| value.get("providerId"))
                .and_then(Value::as_str)
                .ok_or_else(|| "provider_probe requires `providerId`.".to_string())?;
            let state = read_runtime_state_value(app)?.ok_or_else(|| {
                "Runtime state is not available for provider probing.".to_string()
            })?;
            let providers = state
                .get("providers")
                .and_then(Value::as_array)
                .ok_or_else(|| "Runtime state does not include providers.".to_string())?;
            let runtime_nodes = state
                .get("runtimeNodes")
                .and_then(Value::as_array)
                .ok_or_else(|| "Runtime state does not include runtime nodes.".to_string())?;
            let provider = providers
                .iter()
                .find(|item| item.get("id").and_then(Value::as_str) == Some(provider_id))
                .ok_or_else(|| {
                    format!("Provider `{provider_id}` was not found in runtime state.")
                })?;

            let provider_type = provider
                .get("providerType")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let configured_secret = resolve_provider_secret(app, provider_id)?.is_some();
            let primary_model = provider
                .get("primaryModel")
                .and_then(Value::as_str)
                .unwrap_or("");
            let node_summaries = runtime_nodes
                .iter()
                .filter(|item| item.get("providerProfileId").and_then(Value::as_str) == Some(provider_id))
                .map(|node| {
                    json!({
                        "id": node.get("id").and_then(Value::as_str).unwrap_or("unknown"),
                        "label": node.get("label").and_then(Value::as_str).unwrap_or("unknown"),
                        "kind": node.get("kind").and_then(Value::as_str).unwrap_or("unknown"),
                        "endpoint": node.get("endpoint").and_then(Value::as_str),
                        "healthState": node.get("healthState").and_then(Value::as_str).unwrap_or("unknown"),
                    })
                })
                .collect::<Vec<_>>();

            let endpoint = node_summaries
                .iter()
                .filter_map(|node| node.get("endpoint").and_then(Value::as_str))
                .find(|endpoint| {
                    endpoint.starts_with("http://") || endpoint.starts_with("https://")
                })
                .or_else(|| provider.get("apiBaseUrl").and_then(Value::as_str));

            let reachability = match provider_type {
                "local" => {
                    let status = query_local_runtime_status(Some(primary_model.to_string()));
                    json!({
                        "reachable": status.available,
                        "detail": format!(
                            "local runtime available={}, targetInstalled={}, targetRunning={}",
                            status.available, status.recovery_model_installed, status.recovery_model_running
                        )
                    })
                }
                _ => {
                    if let Some(url) = endpoint {
                        match probe_http_endpoint(url).await {
                            Ok(detail) => json!({ "reachable": true, "detail": detail }),
                            Err(error) => json!({ "reachable": false, "detail": error }),
                        }
                    } else {
                        json!({
                            "reachable": false,
                            "detail": "No probeable HTTP endpoint is configured for this provider."
                        })
                    }
                }
            };

            let payload = json!({
                "providerId": provider_id,
                "providerType": provider_type,
                "primaryModel": primary_model,
                "credentialConfigured": configured_secret,
                "endpoint": endpoint,
                "reachability": reachability,
                "runtimeNodes": node_summaries,
            });
            let summary = format!(
                "Probed {}: credentials={}, reachable={}",
                provider_id,
                if configured_secret {
                    "configured"
                } else {
                    "missing"
                },
                reachability
                    .get("reachable")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
            );
            Ok((
                serde_json::to_string_pretty(&payload)
                    .map_err(|error| format!("Failed to encode provider probe result: {error}"))?,
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary,
                    status: "completed".to_string(),
                },
            ))
        }
        "remote_probe" => {
            let node_id = args
                .as_ref()
                .and_then(|value| value.get("nodeId"))
                .and_then(Value::as_str)
                .ok_or_else(|| "remote_probe requires `nodeId`.".to_string())?;
            let result = execute_remote_probe(ComputeRemoteProbeRequest {
                node_id: node_id.to_string(),
            })?;
            let summary = result.summary.clone();
            Ok((
                format!("{}\n{}", result.stdout, result.stderr),
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary,
                    status: result.status,
                },
            ))
        }
        "gx10_llama_status" => {
            let result = query_gx10_llama_status()?;
            let summary = result.summary.clone();
            Ok((
                format!("{}\n{}", result.stdout, result.stderr),
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary,
                    status: result.status,
                },
            ))
        }
        "gx10_llama_switch" => {
            let model_id = args
                .as_ref()
                .and_then(|value| value.get("modelId"))
                .and_then(Value::as_str)
                .ok_or_else(|| "gx10_llama_switch requires `modelId`.".to_string())?;
            let result = switch_gx10_llama_model(Gx10LlamaSwitchRequest {
                model_id: model_id.to_string(),
            })?;
            let summary = result.summary.clone();
            Ok((
                format!("{}\n{}", result.stdout, result.stderr),
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary,
                    status: result.status,
                },
            ))
        }
        "nas_backup_status" => {
            let result = query_nas_backup_status()?;
            let summary = result.summary.clone();
            Ok((
                format!("{}\n{}", result.stdout, result.stderr),
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary,
                    status: result.status,
                },
            ))
        }
        "list_files" => {
            let path = args
                .as_ref()
                .and_then(|value| value.get("path"))
                .and_then(Value::as_str)
                .ok_or_else(|| "list_files requires `path`.".to_string())?;
            let max_entries = args
                .as_ref()
                .and_then(|value| value.get("maxEntries"))
                .and_then(Value::as_u64)
                .unwrap_or(40) as usize;
            let resolved = normalize_engineer_path(app, path)?;
            let mut entries = fs::read_dir(&resolved)
                .map_err(|error| format!("Failed to list `{}`: {error}", resolved.display()))?
                .filter_map(Result::ok)
                .take(max_entries)
                .map(|entry| {
                    let file_type = entry.file_type().ok();
                    let kind = if file_type.map(|ft| ft.is_dir()).unwrap_or(false) {
                        "dir"
                    } else {
                        "file"
                    };
                    format!("{} {}", kind, entry.path().display())
                })
                .collect::<Vec<_>>();
            entries.sort();
            let output = entries.join("\n");
            Ok((
                output.clone(),
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary: format!(
                        "Listed {} entries under {}",
                        entries.len(),
                        resolved.display()
                    ),
                    status: "completed".to_string(),
                },
            ))
        }
        "search_codebase" => {
            let query = args
                .as_ref()
                .and_then(|value| value.get("query"))
                .and_then(Value::as_str)
                .ok_or_else(|| "search_codebase requires `query`.".to_string())?;
            let path = args
                .as_ref()
                .and_then(|value| value.get("path"))
                .and_then(Value::as_str)
                .map(ToString::to_string);
            let max_results = args
                .as_ref()
                .and_then(|value| value.get("maxResults"))
                .and_then(Value::as_u64)
                .unwrap_or(20)
                .to_string();
            let resolved = match path {
                Some(path) => normalize_engineer_path(app, &path)?,
                None => default_engineer_workdir(app)?,
            };
            let output = Command::new("rg")
                .args([
                    "--line-number",
                    "--no-heading",
                    "--max-count",
                    &max_results,
                    query,
                ])
                .arg(&resolved)
                .output()
                .map_err(|error| format!("Failed to run rg: {error}"))?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if !output.status.success() && stdout.trim().is_empty() {
                return Err(format!("search_codebase failed: {}", stderr.trim()));
            }
            Ok((
                stdout.clone(),
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary: format!("Searched `{}` under {}", query, resolved.display()),
                    status: "completed".to_string(),
                },
            ))
        }
        "read_file" => {
            let path = args
                .as_ref()
                .and_then(|value| value.get("path"))
                .and_then(Value::as_str)
                .ok_or_else(|| "read_file requires `path`.".to_string())?;
            let resolved = normalize_engineer_path(app, path)?;
            let raw = fs::read_to_string(&resolved)
                .map_err(|error| format!("Failed to read `{}`: {error}", resolved.display()))?;
            let start_line = args
                .as_ref()
                .and_then(|value| value.get("startLine"))
                .and_then(Value::as_u64)
                .unwrap_or(1) as usize;
            let end_line = args
                .as_ref()
                .and_then(|value| value.get("endLine"))
                .and_then(Value::as_u64)
                .unwrap_or((start_line + 199) as u64) as usize;
            let excerpt = raw
                .lines()
                .enumerate()
                .filter_map(|(index, line)| {
                    let line_number = index + 1;
                    (line_number >= start_line && line_number <= end_line)
                        .then(|| format!("{:>4}: {}", line_number, line))
                })
                .collect::<Vec<_>>()
                .join("\n");
            Ok((
                excerpt,
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary: format!(
                        "Read {} lines from {}",
                        end_line.saturating_sub(start_line) + 1,
                        resolved.display()
                    ),
                    status: "completed".to_string(),
                },
            ))
        }
        "replace_in_file" => {
            let path = args
                .as_ref()
                .and_then(|value| value.get("path"))
                .and_then(Value::as_str)
                .ok_or_else(|| "replace_in_file requires `path`.".to_string())?;
            let old_text = args
                .as_ref()
                .and_then(|value| value.get("oldText"))
                .and_then(Value::as_str)
                .ok_or_else(|| "replace_in_file requires `oldText`.".to_string())?;
            let new_text = args
                .as_ref()
                .and_then(|value| value.get("newText"))
                .and_then(Value::as_str)
                .ok_or_else(|| "replace_in_file requires `newText`.".to_string())?;
            let resolved = normalize_engineer_path(app, path)?;
            let raw = fs::read_to_string(&resolved)
                .map_err(|error| format!("Failed to read `{}`: {error}", resolved.display()))?;
            if !raw.contains(old_text) {
                return Err(format!(
                    "Target text was not found in `{}`.",
                    resolved.display()
                ));
            }
            let next = raw.replacen(old_text, new_text, 1);
            fs::write(&resolved, next)
                .map_err(|error| format!("Failed to write `{}`: {error}", resolved.display()))?;
            Ok((
                format!("Updated {}", resolved.display()),
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary: format!("Applied a targeted replacement in {}", resolved.display()),
                    status: "completed".to_string(),
                },
            ))
        }
        "write_file" => {
            let path = args
                .as_ref()
                .and_then(|value| value.get("path"))
                .and_then(Value::as_str)
                .ok_or_else(|| "write_file requires `path`.".to_string())?;
            let content = args
                .as_ref()
                .and_then(|value| value.get("content"))
                .and_then(Value::as_str)
                .ok_or_else(|| "write_file requires `content`.".to_string())?;
            let resolved = normalize_engineer_path(app, path)?;
            if let Some(parent) = resolved.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!("Failed to prepare `{}`: {error}", parent.display())
                })?;
            }
            fs::write(&resolved, content)
                .map_err(|error| format!("Failed to write `{}`: {error}", resolved.display()))?;
            Ok((
                format!("Wrote {}", resolved.display()),
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary: format!("Wrote {}", resolved.display()),
                    status: "completed".to_string(),
                },
            ))
        }
        "run_command" => {
            let command = args
                .as_ref()
                .and_then(|value| value.get("command"))
                .and_then(Value::as_array)
                .ok_or_else(|| "run_command requires `command` as an array.".to_string())?;
            let mut parts = command
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect::<Vec<_>>();
            if parts.is_empty() {
                return Err("run_command requires at least one command token.".to_string());
            }
            let program = parts.remove(0);
            if !engineer_allowed_command(&program, &parts) {
                return Err(format!(
                    "Command `{program}` is not allowed in recovery mode."
                ));
            }
            let cwd = args
                .as_ref()
                .and_then(|value| value.get("cwd"))
                .and_then(Value::as_str)
                .map(ToString::to_string);
            let resolved_cwd = match cwd {
                Some(path) => normalize_engineer_path(app, &path)?,
                None => default_engineer_workdir(app)?,
            };
            let output = Command::new(&program)
                .args(&parts)
                .current_dir(&resolved_cwd)
                .output()
                .map_err(|error| format!("Failed to run `{program}`: {error}"))?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined = if stderr.trim().is_empty() {
                stdout.clone()
            } else if stdout.trim().is_empty() {
                stderr.clone()
            } else {
                format!("{stdout}\n{stderr}")
            };
            Ok((
                combined.clone(),
                EngineerToolEvent {
                    tool: tool.to_string(),
                    summary: format!(
                        "Ran `{}` in {} -> {}",
                        std::iter::once(program.clone())
                            .chain(parts.clone())
                            .collect::<Vec<_>>()
                            .join(" "),
                        resolved_cwd.display(),
                        summarize_output(&combined, 120)
                    ),
                    status: if output.status.success() {
                        "completed".to_string()
                    } else {
                        "failed".to_string()
                    },
                },
            ))
        }
        unsupported => Err(format!("Unsupported recovery tool `{unsupported}`.")),
    }
}

pub(crate) async fn execute_engineer_recovery_turn(
    app: &AppHandle,
    request: EngineerRecoveryTurnRequest,
) -> Result<EngineerRecoveryTurnResult, String> {
    let mut transcript = request.messages.clone();
    let mut tool_events = Vec::new();
    let system_prompt = format!("{} {}", request.system_prompt, engineer_tool_protocol(app));

    for _ in 0..6 {
        let provider_request = ProviderServiceChatRequest {
            request_id: Some("engineer-recovery-turn".to_string()),
            thread_id: Some("thread-recovery-engineer".to_string()),
            agent_id: Some("setup.core".to_string()),
            channel_id: Some("desktop-engineer".to_string()),
            provider_id: request.provider_id.clone(),
            provider_type: request.provider_type.clone(),
            api_base_url: request.api_base_url.clone(),
            runtime_node_id: request.runtime_node_id.clone(),
            runtime_node_kind: request.runtime_node_kind.clone(),
            runtime_node_endpoint: request.runtime_node_endpoint.clone(),
            auth_tier: request.auth_tier.clone(),
            model: request.model.clone(),
            reasoning_effort: "high".to_string(),
            system_prompt: system_prompt.clone(),
            messages: transcript.clone(),
        };

        let reply = execute_provider_service_chat(app, provider_request).await?;
        if let Some(action) = parse_engineer_action(&reply) {
            if action.mode == "tool" {
                let tool_name = action
                    .tool
                    .as_deref()
                    .ok_or_else(|| "Tool action did not include a tool name.".to_string())?;
                match execute_engineer_tool(app, tool_name, action.args).await {
                    Ok((tool_output, event)) => {
                        transcript.push(ChatMessageInput {
                            role: "assistant".to_string(),
                            content: reply,
                        });
                        transcript.push(ChatMessageInput {
                            role: "user".to_string(),
                            content: format!("TOOL RESULT [{}]\n{}", tool_name, tool_output),
                        });
                        tool_events.push(event);
                        continue;
                    }
                    Err(error) => {
                        let event = EngineerToolEvent {
                            tool: tool_name.to_string(),
                            summary: error.clone(),
                            status: "failed".to_string(),
                        };
                        transcript.push(ChatMessageInput {
                            role: "assistant".to_string(),
                            content: reply,
                        });
                        transcript.push(ChatMessageInput {
                            role: "user".to_string(),
                            content: format!("TOOL ERROR [{}]\n{}", tool_name, error),
                        });
                        tool_events.push(event);
                        continue;
                    }
                }
            }
            if action.mode == "final" {
                return Ok(EngineerRecoveryTurnResult {
                    reply: action.content.unwrap_or(reply),
                    tool_events,
                });
            }
        }

        return Ok(EngineerRecoveryTurnResult { reply, tool_events });
    }

    Ok(EngineerRecoveryTurnResult {
        reply: "Recovery turn stopped after reaching the tool step limit. Review the change log and continue with a narrower next step.".to_string(),
        tool_events,
    })
}

#[cfg(test)]
mod tests {
    use super::{engineer_allowed_command, parse_engineer_action};

    #[test]
    fn parses_engineer_tool_action_from_json() {
        let parsed = parse_engineer_action(
            r#"{"mode":"tool","tool":"read_file","args":{"path":"/tmp/test"}}"#,
        )
        .expect("engineer action should parse");
        assert_eq!(parsed.mode, "tool");
        assert_eq!(parsed.tool.as_deref(), Some("read_file"));
    }

    #[test]
    fn allows_only_safe_recovery_commands() {
        assert!(engineer_allowed_command("npm", &["test".to_string()]));
        assert!(engineer_allowed_command(
            "npm",
            &["run".to_string(), "build".to_string()]
        ));
        assert!(engineer_allowed_command("git", &["status".to_string()]));
        assert!(!engineer_allowed_command("cargo", &["run".to_string()]));
        assert!(!engineer_allowed_command(
            "node",
            &["script.js".to_string()]
        ));
        assert!(!engineer_allowed_command(
            "python3",
            &["script.py".to_string()]
        ));
        assert!(!engineer_allowed_command("rm", &["-rf".to_string()]));
        assert!(!engineer_allowed_command("git", &["push".to_string()]));
    }
}
