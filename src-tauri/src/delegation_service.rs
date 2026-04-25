// Intent citation: docs/architecture/ADR-009-rust-service-ipc-boundary.md
// Intent citation: docs/architecture/ADR-015-delegation-fabric-addon-catalog-native-tools.md

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::host_state::app_state_dir;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateTaskWorkspaceRequest {
    pub(crate) packet: Value,
    pub(crate) task_markdown: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TaskWorkspaceRecord {
    pub(crate) id: String,
    pub(crate) packet_id: String,
    pub(crate) root_path: String,
    pub(crate) packet_path: String,
    pub(crate) task_markdown_path: String,
    pub(crate) artifacts_path: String,
    pub(crate) logs_path: String,
    pub(crate) result_path: String,
    pub(crate) verification_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadTaskWorkspaceRequest {
    pub(crate) workspace_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TaskWorkspacePayload {
    pub(crate) workspace: TaskWorkspaceRecord,
    pub(crate) packet: Value,
    pub(crate) task_markdown: String,
    pub(crate) result_markdown: String,
    pub(crate) verification: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FinishTaskWorkspaceRequest {
    pub(crate) workspace_id: String,
    pub(crate) result_markdown: String,
    pub(crate) verification: Value,
    pub(crate) audit_event: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FinishTaskWorkspaceResult {
    pub(crate) workspace: TaskWorkspaceRecord,
    pub(crate) result_path: String,
    pub(crate) verification_path: String,
    pub(crate) audit_path: String,
}

fn unix_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("unix:{seconds}")
}

fn slugify(value: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for character in value.chars() {
        let lower = character.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            output.push(lower);
            last_dash = false;
        } else if !last_dash {
            output.push('-');
            last_dash = true;
        }
    }
    let trimmed = output.trim_matches('-');
    if trimmed.is_empty() {
        "task-workspace".to_string()
    } else {
        trimmed.to_string()
    }
}

fn required_packet_string(packet: &Value, key: &str) -> Result<String, String> {
    packet
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| format!("Delegation packet `{key}` is required."))
}

fn ensure_dir(path: &Path, label: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| format!("Failed to create {label}: {error}"))
}

fn write_text(path: &Path, content: &str, label: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|error| format!("Failed to write {label}: {error}"))
}

fn read_text(path: &Path, label: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("Failed to read {label}: {error}"))
}

pub(crate) fn task_workspaces_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app_state_dir(app)?.join("task-workspaces");
    ensure_dir(&root, "task workspace root")?;
    Ok(root)
}

fn workspace_root_from_id(root: &Path, workspace_id: &str) -> Result<PathBuf, String> {
    let trimmed = workspace_id.trim();
    if trimmed.is_empty() {
        return Err("Task workspace id is required.".to_string());
    }
    Ok(root.join(slugify(trimmed)))
}

fn task_workspace_record_from_root(workspace_root: &Path) -> Result<TaskWorkspaceRecord, String> {
    let packet_path = workspace_root.join("delegation.packet.json");
    let packet_raw = read_text(&packet_path, "delegation packet")?;
    let packet = serde_json::from_str::<Value>(&packet_raw)
        .map_err(|error| format!("Invalid delegation packet JSON: {error}"))?;
    let packet_id = required_packet_string(&packet, "id")?;
    let workspace_id = required_packet_string(&packet, "workspaceId")?;
    Ok(TaskWorkspaceRecord {
        id: workspace_id,
        packet_id,
        root_path: workspace_root.display().to_string(),
        packet_path: packet_path.display().to_string(),
        task_markdown_path: workspace_root.join("TASK.md").display().to_string(),
        artifacts_path: workspace_root.join("artifacts").display().to_string(),
        logs_path: workspace_root.join("logs").display().to_string(),
        result_path: workspace_root.join("result.md").display().to_string(),
        verification_path: workspace_root
            .join("verification.json")
            .display()
            .to_string(),
    })
}

pub(crate) fn create_task_workspace_with_root(
    root: &Path,
    request: CreateTaskWorkspaceRequest,
) -> Result<TaskWorkspaceRecord, String> {
    let packet_id = required_packet_string(&request.packet, "id")?;
    let workspace_id = required_packet_string(&request.packet, "workspaceId")?;
    if request.task_markdown.trim().is_empty() {
        return Err("Rendered TASK.md content cannot be empty.".to_string());
    }

    let workspace_root = root.join(slugify(&workspace_id));
    let artifacts_path = workspace_root.join("artifacts");
    let logs_path = workspace_root.join("logs");
    ensure_dir(&artifacts_path, "task artifacts directory")?;
    ensure_dir(&logs_path, "task logs directory")?;

    let packet_path = workspace_root.join("delegation.packet.json");
    let task_markdown_path = workspace_root.join("TASK.md");
    let result_path = workspace_root.join("result.md");
    let verification_path = workspace_root.join("verification.json");
    let audit_path = logs_path.join("audit.jsonl");

    write_text(
        &packet_path,
        &serde_json::to_string_pretty(&request.packet)
            .map_err(|error| format!("Failed to encode delegation packet: {error}"))?,
        "delegation packet",
    )?;
    write_text(&task_markdown_path, &request.task_markdown, "TASK.md")?;
    write_text(
        &result_path,
        "# Delegation Result\n\nNo result has been returned yet.\n",
        "delegation result placeholder",
    )?;
    write_text(
        &verification_path,
        &serde_json::to_string_pretty(&json!({
            "packetId": &packet_id,
            "status": "pending",
            "checks": []
        }))
        .map_err(|error| format!("Failed to encode verification placeholder: {error}"))?,
        "verification placeholder",
    )?;
    write_text(
        &audit_path,
        &format!(
            "{} {}\n",
            unix_timestamp(),
            json!({
                "event": "task-workspace-created",
                "packetId": &packet_id,
                "workspaceId": &workspace_id
            })
        ),
        "task audit log",
    )?;

    Ok(TaskWorkspaceRecord {
        id: workspace_id,
        packet_id,
        root_path: workspace_root.display().to_string(),
        packet_path: packet_path.display().to_string(),
        task_markdown_path: task_markdown_path.display().to_string(),
        artifacts_path: artifacts_path.display().to_string(),
        logs_path: logs_path.display().to_string(),
        result_path: result_path.display().to_string(),
        verification_path: verification_path.display().to_string(),
    })
}

pub(crate) fn read_task_workspace_with_root(
    root: &Path,
    request: ReadTaskWorkspaceRequest,
) -> Result<TaskWorkspacePayload, String> {
    let workspace_root = workspace_root_from_id(root, &request.workspace_id)?;
    if !workspace_root.exists() {
        return Err(format!(
            "Task workspace does not exist: {}",
            request.workspace_id
        ));
    }
    let workspace = task_workspace_record_from_root(&workspace_root)?;
    let packet_raw = read_text(&PathBuf::from(&workspace.packet_path), "delegation packet")?;
    let packet = serde_json::from_str::<Value>(&packet_raw)
        .map_err(|error| format!("Invalid delegation packet JSON: {error}"))?;
    let task_markdown = read_text(&PathBuf::from(&workspace.task_markdown_path), "TASK.md")?;
    let result_markdown = read_text(&PathBuf::from(&workspace.result_path), "delegation result")?;
    let verification_raw = read_text(
        &PathBuf::from(&workspace.verification_path),
        "verification file",
    )?;
    let verification = serde_json::from_str::<Value>(&verification_raw)
        .map_err(|error| format!("Invalid verification JSON: {error}"))?;

    Ok(TaskWorkspacePayload {
        workspace,
        packet,
        task_markdown,
        result_markdown,
        verification,
    })
}

pub(crate) fn finish_task_workspace_with_root(
    root: &Path,
    request: FinishTaskWorkspaceRequest,
) -> Result<FinishTaskWorkspaceResult, String> {
    let workspace_root = workspace_root_from_id(root, &request.workspace_id)?;
    if !workspace_root.exists() {
        return Err(format!(
            "Task workspace does not exist: {}",
            request.workspace_id
        ));
    }
    let workspace = task_workspace_record_from_root(&workspace_root)?;
    if request.result_markdown.trim().is_empty() {
        return Err("Task workspace result cannot be empty.".to_string());
    }
    write_text(
        &PathBuf::from(&workspace.result_path),
        &request.result_markdown,
        "task result",
    )?;
    write_text(
        &PathBuf::from(&workspace.verification_path),
        &serde_json::to_string_pretty(&request.verification)
            .map_err(|error| format!("Failed to encode task verification: {error}"))?,
        "task verification",
    )?;
    let audit_path = PathBuf::from(&workspace.logs_path).join("audit.jsonl");
    let audit_line = format!("{} {}\n", unix_timestamp(), request.audit_event);
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&audit_path)
        .and_then(|mut file| {
            use std::io::Write;
            file.write_all(audit_line.as_bytes())
        })
        .map_err(|error| format!("Failed to append task audit log: {error}"))?;

    Ok(FinishTaskWorkspaceResult {
        workspace,
        result_path: workspace_root.join("result.md").display().to_string(),
        verification_path: workspace_root
            .join("verification.json")
            .display()
            .to_string(),
        audit_path: audit_path.display().to_string(),
    })
}

pub(crate) fn create_task_workspace(
    app: &AppHandle,
    request: CreateTaskWorkspaceRequest,
) -> Result<TaskWorkspaceRecord, String> {
    let root = task_workspaces_dir(app)?;
    create_task_workspace_with_root(&root, request)
}

pub(crate) fn read_task_workspace(
    app: &AppHandle,
    request: ReadTaskWorkspaceRequest,
) -> Result<TaskWorkspacePayload, String> {
    let root = task_workspaces_dir(app)?;
    read_task_workspace_with_root(&root, request)
}

pub(crate) fn finish_task_workspace(
    app: &AppHandle,
    request: FinishTaskWorkspaceRequest,
) -> Result<FinishTaskWorkspaceResult, String> {
    let root = task_workspaces_dir(app)?;
    finish_task_workspace_with_root(&root, request)
}

#[cfg(test)]
mod tests {
    use super::{
        create_task_workspace_with_root, finish_task_workspace_with_root,
        read_task_workspace_with_root, CreateTaskWorkspaceRequest, FinishTaskWorkspaceRequest,
        ReadTaskWorkspaceRequest,
    };
    use serde_json::json;
    use std::fs;

    #[test]
    fn creates_execution_free_task_workspace_files() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-task-workspace-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let result = create_task_workspace_with_root(
            &root,
            CreateTaskWorkspaceRequest {
                packet: json!({
                    "id": "delegation-1",
                    "workspaceId": "workspace-engineer-1",
                    "targetAgentId": "setup.core"
                }),
                task_markdown: "# TASK.md\n\nDo the diagnostic planning only.\n".to_string(),
            },
        )
        .expect("workspace should be created");

        assert_eq!(result.packet_id, "delegation-1");
        assert!(root
            .join("workspace-engineer-1")
            .join("delegation.packet.json")
            .exists());
        assert!(root.join("workspace-engineer-1").join("TASK.md").exists());
        assert!(root.join("workspace-engineer-1").join("artifacts").is_dir());
        assert!(root
            .join("workspace-engineer-1")
            .join("logs")
            .join("audit.jsonl")
            .exists());
        assert!(root
            .join("workspace-engineer-1")
            .join("verification.json")
            .exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reads_and_finishes_task_workspace_files() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-task-workspace-finish-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        create_task_workspace_with_root(
            &root,
            CreateTaskWorkspaceRequest {
                packet: json!({
                    "id": "delegation-2",
                    "workspaceId": "workspace-engineer-2",
                    "targetAgentId": "setup.core"
                }),
                task_markdown: "# TASK.md\n\nRun the diagnostic.\n".to_string(),
            },
        )
        .expect("workspace should be created");

        let payload = read_task_workspace_with_root(
            &root,
            ReadTaskWorkspaceRequest {
                workspace_id: "workspace-engineer-2".to_string(),
            },
        )
        .expect("workspace should read");
        assert_eq!(payload.workspace.packet_id, "delegation-2");
        assert!(payload.task_markdown.contains("Run the diagnostic"));

        let finished = finish_task_workspace_with_root(
            &root,
            FinishTaskWorkspaceRequest {
                workspace_id: "workspace-engineer-2".to_string(),
                result_markdown: "# Delegation Result\n\nDiagnostic complete.\n".to_string(),
                verification: json!({
                    "packetId": "delegation-2",
                    "status": "completed",
                    "checks": [{"id": "diagnostic-report", "status": "passed"}]
                }),
                audit_event: json!({
                    "event": "task-workspace-finished",
                    "packetId": "delegation-2"
                }),
            },
        )
        .expect("workspace should finish");

        let result = fs::read_to_string(finished.result_path).expect("result should read");
        assert!(result.contains("Diagnostic complete"));
        let verification =
            fs::read_to_string(finished.verification_path).expect("verification should read");
        assert!(verification.contains("\"completed\""));
        let audit = fs::read_to_string(finished.audit_path).expect("audit should read");
        assert!(audit.contains("task-workspace-finished"));

        let _ = fs::remove_dir_all(root);
    }
}
