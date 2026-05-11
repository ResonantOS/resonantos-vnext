use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputePassiveDiagnosticsResult {
    pub node_id: String,
    pub os: String,
    pub arch: String,
    pub family: String,
    pub executable_suffix: String,
    pub checked_at: String,
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeSafeCommandRequest {
    pub node_id: String,
    pub command: Vec<String>,
    pub job_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeSafeCommandResult {
    pub node_id: String,
    pub job_id: Option<String>,
    pub command: Vec<String>,
    pub status: String,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub started_at: String,
    pub completed_at: String,
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeRemoteProbeRequest {
    pub node_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeRemoteProbeResult {
    pub node_id: String,
    pub status: String,
    pub host: String,
    pub stdout: String,
    pub stderr: String,
    pub checked_at: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gx10LlamaModelStatus {
    pub id: String,
    pub port: u16,
    pub health: String,
    pub process_running: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gx10LlamaStatusResult {
    pub node_id: String,
    pub status: String,
    pub stdout: String,
    pub stderr: String,
    pub checked_at: String,
    pub models: Vec<Gx10LlamaModelStatus>,
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Gx10LlamaSwitchRequest {
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gx10LlamaSwitchResult {
    pub node_id: String,
    pub status: String,
    pub model_id: String,
    pub port: u16,
    pub stdout: String,
    pub stderr: String,
    pub started_at: String,
    pub completed_at: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NasBackupStatusResult {
    pub node_id: String,
    pub status: String,
    pub stdout: String,
    pub stderr: String,
    pub checked_at: String,
    pub backup_root: String,
    pub summary: String,
}

struct Gx10LlamaModelSpec {
    id: &'static str,
    port: u16,
    path: &'static str,
    log_path: &'static str,
}

const GX10_HOST: &str = "rlab@gx10-23bd.local";
const NAS_HOST: &str = "nas";
const NAS_BACKUP_ROOT: &str = "/volume1/Reosnant Backup";
const LLAMA_SERVER_PATH: &str = "/mnt/data/llama.cpp/build/bin/llama-server";
const GX10_MODELS: [Gx10LlamaModelSpec; 2] = [
    Gx10LlamaModelSpec {
        id: "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
        port: 30000,
        path: "/mnt/data/models/gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
        log_path: "/tmp/gemma-mtp.log",
    },
    Gx10LlamaModelSpec {
        id: "Qwen3.6-27B-Q4_K_M.gguf",
        port: 30001,
        path: "/mnt/data/models/Qwen3.6-27B-Q4_K_M.gguf",
        log_path: "/tmp/qwen36-30001.log",
    },
];

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| format!("unix:{}", duration.as_secs()))
        .unwrap_or_else(|_| "unix:0".to_string())
}

fn run_ssh(
    host: &str,
    remote_command: &str,
) -> Result<(bool, Option<i32>, String, String), String> {
    let output = Command::new("ssh")
        .args([
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            host,
            remote_command,
        ])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Failed to run ssh probe for `{host}`: {error}"))?;
    Ok((
        output.status.success(),
        output.status.code(),
        trim_output(&output.stdout),
        trim_output(&output.stderr),
    ))
}

fn gx10_model_spec(model_id: &str) -> Option<&'static Gx10LlamaModelSpec> {
    GX10_MODELS.iter().find(|model| model.id == model_id)
}

pub(crate) fn query_local_passive_diagnostics() -> ComputePassiveDiagnosticsResult {
    let checked_at = timestamp();
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    ComputePassiveDiagnosticsResult {
        node_id: "compute-desktop-local".to_string(),
        summary: format!("Local host reports {os}/{arch} through passive std::env constants."),
        os,
        arch,
        family: std::env::consts::FAMILY.to_string(),
        executable_suffix: std::env::consts::EXE_SUFFIX.to_string(),
        checked_at,
    }
}

fn allowed_uname_args(args: &[String]) -> bool {
    const ALLOWED: [&str; 3] = ["-s", "-m", "-r"];
    if args.len() > ALLOWED.len() {
        return false;
    }
    let mut seen: Vec<&str> = Vec::new();
    for arg in args {
        let value = arg.as_str();
        if !ALLOWED.contains(&value) || seen.contains(&value) {
            return false;
        }
        seen.push(value);
    }
    true
}

fn resolve_safe_program(program: &str, args: &[String]) -> Result<&'static str, String> {
    match program {
        "uname" if allowed_uname_args(args) => {
            if Path::new("/usr/bin/uname").is_file() {
                Ok("/usr/bin/uname")
            } else {
                Err("Safe command `uname` is unavailable at /usr/bin/uname.".to_string())
            }
        }
        "uname" => Err("Safe command `uname` only allows -s, -m, and -r arguments.".to_string()),
        _ => Err(format!(
            "Compute safe command `{program}` is not allowlisted."
        )),
    }
}

fn trim_output(value: &[u8]) -> String {
    let mut output = String::from_utf8_lossy(value).to_string();
    const LIMIT: usize = 16_384;
    if output.len() > LIMIT {
        output.truncate(LIMIT);
        output.push_str("\n[truncated]");
    }
    output
}

pub(crate) fn execute_local_safe_command(
    request: ComputeSafeCommandRequest,
) -> Result<ComputeSafeCommandResult, String> {
    if request.node_id != "compute-desktop-local" {
        return Err("Local safe commands can only target compute-desktop-local.".to_string());
    }
    let command = request.command.clone();
    let (program, args) = command
        .split_first()
        .ok_or_else(|| "Compute safe command request cannot be empty.".to_string())?;
    let program_name = program.clone();
    if program.contains('/') || program.contains('\\') {
        return Err(
            "Compute safe command program must be an allowlisted command name, not a path."
                .to_string(),
        );
    }
    let resolved_program = resolve_safe_program(program, args)?;
    let started_at = timestamp();
    let output = Command::new(resolved_program)
        .args(args)
        .env_clear()
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Failed to run compute safe command `{program_name}`: {error}"))?;
    let completed_at = timestamp();
    let status = if output.status.success() {
        "succeeded"
    } else {
        "failed"
    }
    .to_string();

    Ok(ComputeSafeCommandResult {
        node_id: request.node_id,
        job_id: request.job_id,
        command,
        status: status.clone(),
        exit_code: output.status.code(),
        stdout: trim_output(&output.stdout),
        stderr: trim_output(&output.stderr),
        started_at,
        completed_at,
        summary: format!("Compute safe command `{program_name}` {status}."),
    })
}

pub(crate) fn execute_remote_probe(
    request: ComputeRemoteProbeRequest,
) -> Result<ComputeRemoteProbeResult, String> {
    let (host, command) = match request.node_id.as_str() {
        "compute-gx10" => (
            GX10_HOST,
            "hostname; lsb_release -ds 2>/dev/null || cat /etc/os-release; nvidia-smi --query-gpu=name,compute_cap --format=csv,noheader 2>/dev/null || true; df -h /mnt/data 2>/dev/null",
        ),
        "compute-nas-backup" => (
            NAS_HOST,
            "hostname; uname -srm; df -h /volume1 2>/dev/null; find '/volume1/Reosnant Backup' -maxdepth 2 -type d 2>/dev/null | sort",
        ),
        _ => {
            return Err(format!(
                "Remote probe target `{}` is not allowlisted.",
                request.node_id
            ));
        }
    };
    let checked_at = timestamp();
    let (success, code, stdout, stderr) = run_ssh(host, command)?;
    let status = if success { "succeeded" } else { "failed" }.to_string();
    Ok(ComputeRemoteProbeResult {
        node_id: request.node_id,
        status: status.clone(),
        host: host.to_string(),
        stdout,
        stderr,
        checked_at,
        summary: format!(
            "Remote probe for `{host}` {status}{}.",
            code.map(|value| format!(" with exit code {value}"))
                .unwrap_or_default()
        ),
    })
}

pub(crate) fn query_gx10_llama_status() -> Result<Gx10LlamaStatusResult, String> {
    let checked_at = timestamp();
    let command = "ps -eo pid,cmd | grep '[l]lama-server' || true; printf '\\n__health_30000__='; curl -sS --max-time 4 http://127.0.0.1:30000/health || true; printf '\\n__health_30001__='; curl -sS --max-time 4 http://127.0.0.1:30001/health || true";
    let (success, code, stdout, stderr) = run_ssh(GX10_HOST, command)?;
    let models = GX10_MODELS
        .iter()
        .map(|model| {
            let process_running =
                stdout.contains(&format!("--port {}", model.port)) && stdout.contains(model.path);
            let marker = format!("__health_{}__={{\"status\":\"ok\"}}", model.port);
            let health = if stdout.contains(&marker) && process_running {
                "ok"
            } else if process_running {
                "unknown"
            } else {
                "failed"
            };
            Gx10LlamaModelStatus {
                id: model.id.to_string(),
                port: model.port,
                health: health.to_string(),
                process_running,
            }
        })
        .collect::<Vec<_>>();
    let status = if success { "succeeded" } else { "failed" }.to_string();
    Ok(Gx10LlamaStatusResult {
        node_id: "compute-gx10".to_string(),
        status: status.clone(),
        stdout,
        stderr,
        checked_at,
        models,
        summary: format!(
            "GX10 llama status {status}{}.",
            code.map(|value| format!(" with exit code {value}"))
                .unwrap_or_default()
        ),
    })
}

pub(crate) fn switch_gx10_llama_model(
    request: Gx10LlamaSwitchRequest,
) -> Result<Gx10LlamaSwitchResult, String> {
    let model = gx10_model_spec(&request.model_id)
        .ok_or_else(|| format!("GX10 model `{}` is not allowlisted.", request.model_id))?;
    let started_at = timestamp();
    let command = format!(
        "pkill -f 'llama-server .*--port {port}' 2>/dev/null || true; nohup {bin} -m {model_path} -c 262144 --host 0.0.0.0 --port {port} -ngl 99 --parallel -1 > {log_path} 2>&1 & sleep 2; curl -sS --max-time 8 http://127.0.0.1:{port}/health",
        bin = LLAMA_SERVER_PATH,
        model_path = model.path,
        port = model.port,
        log_path = model.log_path,
    );
    let (success, code, stdout, stderr) = run_ssh(GX10_HOST, &command)?;
    let completed_at = timestamp();
    let health_ok = stdout.contains("\"ok\"");
    let status = if success && health_ok {
        "succeeded"
    } else {
        "failed"
    }
    .to_string();
    Ok(Gx10LlamaSwitchResult {
        node_id: "compute-gx10".to_string(),
        status: status.clone(),
        model_id: model.id.to_string(),
        port: model.port,
        stdout,
        stderr,
        started_at,
        completed_at,
        summary: format!(
            "GX10 llama switch to `{}` on port {} {status}{}.",
            model.id,
            model.port,
            code.map(|value| format!(" with exit code {value}"))
                .unwrap_or_default()
        ),
    })
}

pub(crate) fn query_nas_backup_status() -> Result<NasBackupStatusResult, String> {
    let checked_at = timestamp();
    let command = "hostname; df -h /volume1 2>/dev/null; find '/volume1/Reosnant Backup' -maxdepth 3 -type d 2>/dev/null | sort";
    let (success, code, stdout, stderr) = run_ssh(NAS_HOST, command)?;
    let status = if success { "succeeded" } else { "failed" }.to_string();
    Ok(NasBackupStatusResult {
        node_id: "compute-nas-backup".to_string(),
        status: status.clone(),
        stdout,
        stderr,
        checked_at,
        backup_root: NAS_BACKUP_ROOT.to_string(),
        summary: format!(
            "NAS backup status {status}{}.",
            code.map(|value| format!(" with exit code {value}"))
                .unwrap_or_default()
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        execute_local_safe_command, gx10_model_spec, query_local_passive_diagnostics,
        switch_gx10_llama_model, ComputeSafeCommandRequest, Gx10LlamaSwitchRequest,
    };

    #[test]
    fn passive_diagnostics_reports_current_platform_without_execution() {
        let result = query_local_passive_diagnostics();

        assert_eq!(result.node_id, "compute-desktop-local");
        assert!(!result.os.is_empty());
        assert!(!result.arch.is_empty());
        assert!(result.checked_at.starts_with("unix:"));
    }

    #[test]
    fn safe_command_allows_only_uname_without_shell() {
        let result = execute_local_safe_command(ComputeSafeCommandRequest {
            node_id: "compute-desktop-local".to_string(),
            command: vec!["uname".to_string(), "-m".to_string()],
            job_id: Some("job-test".to_string()),
        })
        .expect("uname should be allowlisted on supported local development hosts");

        assert_eq!(result.node_id, "compute-desktop-local");
        assert_eq!(result.command, vec!["uname".to_string(), "-m".to_string()]);
        assert_eq!(result.status, "succeeded");
        assert!(!result.stdout.trim().is_empty());
    }

    #[test]
    fn safe_command_rejects_unallowlisted_programs_and_paths() {
        let rejected_program = execute_local_safe_command(ComputeSafeCommandRequest {
            node_id: "compute-desktop-local".to_string(),
            command: vec!["sh".to_string(), "-c".to_string(), "uname -m".to_string()],
            job_id: None,
        })
        .unwrap_err();
        let rejected_path = execute_local_safe_command(ComputeSafeCommandRequest {
            node_id: "compute-desktop-local".to_string(),
            command: vec!["/usr/bin/uname".to_string(), "-m".to_string()],
            job_id: None,
        })
        .unwrap_err();

        assert!(rejected_program.contains("not allowlisted"));
        assert!(rejected_path.contains("not a path"));
    }

    #[test]
    fn gx10_model_switch_rejects_unknown_models_before_ssh() {
        let rejected = switch_gx10_llama_model(Gx10LlamaSwitchRequest {
            model_id: "not-a-real-model.gguf".to_string(),
        })
        .unwrap_err();

        assert!(rejected.contains("not allowlisted"));
    }

    #[test]
    fn gx10_model_specs_are_bound_to_verified_ports() {
        let gemma = gx10_model_spec("gemma-4-26B-A4B-it-UD-Q4_K_M.gguf").expect("gemma spec");
        let qwen = gx10_model_spec("Qwen3.6-27B-Q4_K_M.gguf").expect("qwen spec");

        assert_eq!(gemma.port, 30000);
        assert_eq!(qwen.port, 30001);
        assert!(gemma.path.starts_with("/mnt/data/models/"));
        assert!(qwen.path.starts_with("/mnt/data/models/"));
    }
}
