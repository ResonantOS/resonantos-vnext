// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md
// Intent citation: docs/architecture/ADR-028-paperclip-addon-organizational-runtime.md

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

const DEFAULT_PAPERCLIP_ENDPOINT: &str = "http://127.0.0.1:3100";
const PAPERCLIP_SESSION_ID: &str = "paperclip-main";

static PAPERCLIP_SESSIONS: OnceLock<Mutex<HashMap<String, PaperclipConnectedSession>>> =
    OnceLock::new();

fn paperclip_sessions() -> &'static Mutex<HashMap<String, PaperclipConnectedSession>> {
    PAPERCLIP_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug, Clone)]
struct PaperclipConnectedSession {
    endpoint: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipStatusRequest {
    pub(crate) endpoint: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipStatus {
    pub(crate) installed: bool,
    pub(crate) version: Option<String>,
    pub(crate) binary_path: Option<String>,
    pub(crate) endpoint: String,
    pub(crate) endpoint_reachable: bool,
    pub(crate) install_hint: String,
    pub(crate) supports_web_ui: bool,
    pub(crate) supports_server_api: bool,
    pub(crate) managed_launch_available: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipStartRequest {
    pub(crate) endpoint: Option<String>,
    pub(crate) session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipStopRequest {
    pub(crate) session_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipServiceResult {
    pub(crate) session_id: String,
    pub(crate) endpoint: String,
    pub(crate) api_base_url: String,
    pub(crate) web_url: String,
    pub(crate) command: String,
    pub(crate) pid: Option<u32>,
    pub(crate) already_running: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipDashboardRequest {
    pub(crate) endpoint: Option<String>,
    pub(crate) api_token: String,
    pub(crate) company_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipCreateIssueRequest {
    pub(crate) endpoint: Option<String>,
    pub(crate) api_token: String,
    pub(crate) company_id: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) priority: Option<String>,
    pub(crate) assignee_agent_id: Option<String>,
    pub(crate) project_id: Option<String>,
    pub(crate) goal_id: Option<String>,
    pub(crate) parent_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipCompanySummary {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) description: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) budget_monthly_cents: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipAgentSummary {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) role: Option<String>,
    pub(crate) title: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) budget_monthly_cents: Option<i64>,
    pub(crate) spent_monthly_cents: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipIssueSummary {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) status: Option<String>,
    pub(crate) priority: Option<String>,
    pub(crate) assignee_agent_id: Option<String>,
    pub(crate) project_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipDashboardSnapshot {
    pub(crate) endpoint: String,
    pub(crate) company_id: Option<String>,
    pub(crate) companies: Vec<PaperclipCompanySummary>,
    pub(crate) agents: Vec<PaperclipAgentSummary>,
    pub(crate) issues: Vec<PaperclipIssueSummary>,
    pub(crate) fetched_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperclipCreateIssueResult {
    pub(crate) endpoint: String,
    pub(crate) company_id: String,
    pub(crate) issue: PaperclipIssueSummary,
    pub(crate) audit_summary: String,
}

pub(crate) fn query_paperclip_status(request: PaperclipStatusRequest) -> PaperclipStatus {
    let endpoint = normalize_local_endpoint(request.endpoint.as_deref())
        .unwrap_or_else(|_| DEFAULT_PAPERCLIP_ENDPOINT.to_string());
    let binary_path = resolve_npx_binary();
    let version = binary_path
        .as_deref()
        .map(Command::new)
        .and_then(|mut command| {
            command
                .arg("paperclipai")
                .arg("--version")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .ok()
        })
        .and_then(|output| {
            if output.status.success() {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                None
            }
        })
        .filter(|value| !value.is_empty());
    let endpoint_reachable = paperclip_endpoint_ready(&endpoint);

    PaperclipStatus {
        installed: binary_path.is_some() || version.is_some() || endpoint_reachable,
        version,
        binary_path,
        endpoint,
        endpoint_reachable,
        install_hint:
            "Start Paperclip locally with `npx paperclipai onboard --yes` or run the source repo with `pnpm dev`; ResonantOS V0 connects to the local loopback UI at http://127.0.0.1:3100."
                .to_string(),
        supports_web_ui: true,
        supports_server_api: true,
        managed_launch_available: false,
    }
}

pub(crate) fn start_paperclip_service(
    request: PaperclipStartRequest,
) -> Result<PaperclipServiceResult, String> {
    let endpoint = normalize_local_endpoint(request.endpoint.as_deref())?;
    if !paperclip_endpoint_ready(&endpoint) {
        return Err(format!(
            "Paperclip is not reachable at {endpoint}. Start Paperclip first with the official quickstart, then connect again."
        ));
    }
    let session_id = request
        .session_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| PAPERCLIP_SESSION_ID.to_string());
    let mut sessions = paperclip_sessions()
        .lock()
        .map_err(|_| "Paperclip session lock is poisoned.".to_string())?;
    let already_running = sessions.contains_key(&session_id);
    sessions.insert(
        session_id.clone(),
        PaperclipConnectedSession {
            endpoint: endpoint.clone(),
        },
    );
    Ok(service_result(session_id, endpoint, already_running))
}

pub(crate) fn stop_paperclip_service(
    request: PaperclipStopRequest,
) -> Result<PaperclipServiceResult, String> {
    let session_id = request
        .session_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| PAPERCLIP_SESSION_ID.to_string());
    let mut sessions = paperclip_sessions()
        .lock()
        .map_err(|_| "Paperclip session lock is poisoned.".to_string())?;
    let Some(session) = sessions.remove(&session_id) else {
        return Err(format!("No Paperclip session is connected: {session_id}"));
    };
    Ok(service_result(session_id, session.endpoint, false))
}

pub(crate) async fn query_paperclip_dashboard_snapshot(
    request: PaperclipDashboardRequest,
) -> Result<PaperclipDashboardSnapshot, String> {
    let endpoint = normalize_local_endpoint(request.endpoint.as_deref())?;
    let token = request.api_token.trim();
    if token.is_empty() {
        return Err("Paperclip API token is required for API snapshots.".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| format!("Failed to build Paperclip API client: {error}"))?;
    let companies_value = paperclip_get_json(&client, &endpoint, "/api/companies", token).await?;
    let companies = extract_value_array(&companies_value)
        .into_iter()
        .filter_map(parse_company_summary)
        .collect::<Vec<_>>();
    let selected_company_id = request
        .company_id
        .filter(|value| !value.trim().is_empty())
        .or_else(|| companies.first().map(|company| company.id.clone()));

    let (agents, issues) = if let Some(company_id) = selected_company_id.as_deref() {
        let agents_value = paperclip_get_json(
            &client,
            &endpoint,
            &format!("/api/companies/{}/agents", encode_path_segment(company_id)),
            token,
        )
        .await?;
        let issues_value = paperclip_get_json(
            &client,
            &endpoint,
            &format!("/api/companies/{}/issues", encode_path_segment(company_id)),
            token,
        )
        .await?;
        (
            extract_value_array(&agents_value)
                .into_iter()
                .filter_map(parse_agent_summary)
                .collect(),
            extract_value_array(&issues_value)
                .into_iter()
                .filter_map(parse_issue_summary)
                .collect(),
        )
    } else {
        (Vec::new(), Vec::new())
    };

    Ok(PaperclipDashboardSnapshot {
        endpoint,
        company_id: selected_company_id,
        companies,
        agents,
        issues,
        fetched_at: unix_timestamp_label(),
    })
}

pub(crate) async fn create_paperclip_issue_from_delegation(
    request: PaperclipCreateIssueRequest,
) -> Result<PaperclipCreateIssueResult, String> {
    let endpoint = normalize_local_endpoint(request.endpoint.as_deref())?;
    let token = request.api_token.trim();
    if token.is_empty() {
        return Err("Paperclip API token is required to create issues.".to_string());
    }
    let company_id = request.company_id.trim();
    if company_id.is_empty() {
        return Err("Paperclip company id is required to create issues.".to_string());
    }
    let title = request.title.trim();
    if title.is_empty() {
        return Err("Paperclip issue title is required.".to_string());
    }
    let description = request.description.trim();
    if description.is_empty() {
        return Err("Paperclip issue description is required.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| format!("Failed to build Paperclip API client: {error}"))?;
    let mut body = serde_json::Map::new();
    body.insert("title".to_string(), Value::String(title.to_string()));
    body.insert(
        "description".to_string(),
        Value::String(render_delegation_issue_description(description)),
    );
    body.insert("status".to_string(), Value::String("todo".to_string()));
    body.insert(
        "priority".to_string(),
        Value::String(
            request
                .priority
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("medium")
                .to_string(),
        ),
    );
    for (key, value) in [
        ("assigneeAgentId", request.assignee_agent_id.as_deref()),
        ("projectId", request.project_id.as_deref()),
        ("goalId", request.goal_id.as_deref()),
        ("parentId", request.parent_id.as_deref()),
    ] {
        if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
            body.insert(key.to_string(), Value::String(value.to_string()));
        }
    }
    let path = format!("/api/companies/{}/issues", encode_path_segment(company_id));
    let value = paperclip_post_json(&client, &endpoint, &path, token, Value::Object(body)).await?;
    let issue = parse_issue_summary(&value)
        .or_else(|| {
            extract_value_array(&value)
                .into_iter()
                .find_map(parse_issue_summary)
        })
        .ok_or_else(|| {
            "Paperclip created an issue but returned an unrecognized issue payload.".to_string()
        })?;

    Ok(PaperclipCreateIssueResult {
        endpoint,
        company_id: company_id.to_string(),
        audit_summary: format!(
            "Created Paperclip issue {} in company {} from a ResonantOS delegation payload.",
            issue.id, company_id
        ),
        issue,
    })
}

fn service_result(
    session_id: String,
    endpoint: String,
    already_running: bool,
) -> PaperclipServiceResult {
    PaperclipServiceResult {
        session_id,
        endpoint: endpoint.clone(),
        api_base_url: endpoint.clone(),
        web_url: endpoint,
        command: "connect to existing local Paperclip endpoint".to_string(),
        pid: None,
        already_running,
    }
}

fn normalize_local_endpoint(value: Option<&str>) -> Result<String, String> {
    let raw = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_PAPERCLIP_ENDPOINT);
    let normalized = if raw.starts_with("http://") {
        raw.trim_end_matches('/').to_string()
    } else {
        format!("http://{}", raw.trim_end_matches('/'))
    };
    let (host, port) = parse_local_http_endpoint(&normalized)?;
    Ok(format!("http://{host}:{port}"))
}

async fn paperclip_get_json(
    client: &reqwest::Client,
    endpoint: &str,
    path: &str,
    token: &str,
) -> Result<Value, String> {
    let url = format!("{endpoint}{path}");
    let response = client
        .get(&url)
        .bearer_auth(token)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|error| format!("Failed to query Paperclip API at {url}: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Paperclip API returned {status} for {path}: {}",
            body.trim()
        ));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| format!("Failed to parse Paperclip API response from {path}: {error}"))
}

async fn paperclip_post_json(
    client: &reqwest::Client,
    endpoint: &str,
    path: &str,
    token: &str,
    body: Value,
) -> Result<Value, String> {
    let url = format!("{endpoint}{path}");
    let response = client
        .post(&url)
        .bearer_auth(token)
        .header("accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Failed to post Paperclip API request to {url}: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Paperclip API returned {status} for {path}: {}",
            body.trim()
        ));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| format!("Failed to parse Paperclip API response from {path}: {error}"))
}

fn render_delegation_issue_description(description: &str) -> String {
    format!(
        "{}\n\n---\nCreated by ResonantOS from an approved delegation payload. Keep all work, decisions, and artifacts traceable in Paperclip before returning results to ResonantOS.",
        description.trim()
    )
}

fn extract_value_array(value: &Value) -> Vec<&Value> {
    if let Some(items) = value.as_array() {
        return items.iter().collect();
    }
    for key in ["items", "data", "results", "companies", "agents", "issues"] {
        if let Some(items) = value.get(key).and_then(Value::as_array) {
            return items.iter().collect();
        }
    }
    Vec::new()
}

fn parse_company_summary(value: &Value) -> Option<PaperclipCompanySummary> {
    Some(PaperclipCompanySummary {
        id: string_field(value, "id")?,
        name: string_field(value, "name").unwrap_or_else(|| "Untitled company".to_string()),
        description: string_field(value, "description"),
        status: string_field(value, "status"),
        budget_monthly_cents: int_field(value, "budgetMonthlyCents"),
    })
}

fn parse_agent_summary(value: &Value) -> Option<PaperclipAgentSummary> {
    Some(PaperclipAgentSummary {
        id: string_field(value, "id")?,
        name: string_field(value, "name").unwrap_or_else(|| "Unnamed agent".to_string()),
        role: string_field(value, "role"),
        title: string_field(value, "title"),
        status: string_field(value, "status"),
        budget_monthly_cents: int_field(value, "budgetMonthlyCents"),
        spent_monthly_cents: int_field(value, "spentMonthlyCents"),
    })
}

fn parse_issue_summary(value: &Value) -> Option<PaperclipIssueSummary> {
    Some(PaperclipIssueSummary {
        id: string_field(value, "id")?,
        title: string_field(value, "title").unwrap_or_else(|| "Untitled issue".to_string()),
        status: string_field(value, "status"),
        priority: string_field(value, "priority"),
        assignee_agent_id: string_field(value, "assigneeAgentId"),
        project_id: string_field(value, "projectId"),
    })
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn int_field(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(Value::as_i64)
}

fn encode_path_segment(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            _ => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}

fn unix_timestamp_label() -> String {
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("unix:{seconds}")
}

fn parse_local_http_endpoint(endpoint: &str) -> Result<(String, u16), String> {
    let Some(rest) = endpoint.strip_prefix("http://") else {
        return Err("Paperclip V0 only supports local http:// endpoints.".to_string());
    };
    let authority = rest.split('/').next().unwrap_or(rest);
    let mut parts = authority.split(':');
    let host = parts.next().unwrap_or("").trim();
    let port = parts
        .next()
        .unwrap_or("3100")
        .parse::<u16>()
        .map_err(|_| format!("Paperclip endpoint has an invalid port: {endpoint}"))?;
    if parts.next().is_some() {
        return Err(format!("Paperclip endpoint is invalid: {endpoint}"));
    }
    if host != "127.0.0.1" && host != "localhost" {
        return Err("Paperclip V0 accepts only localhost or 127.0.0.1 endpoints.".to_string());
    }
    Ok((host.to_string(), port))
}

fn paperclip_endpoint_ready(endpoint: &str) -> bool {
    let Ok((host, port)) = parse_local_http_endpoint(endpoint) else {
        return false;
    };
    let connect_host = if host == "localhost" {
        "127.0.0.1"
    } else {
        &host
    };
    let Ok(mut stream) = TcpStream::connect((connect_host, port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(700)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(700)));
    if stream
        .write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && (response.starts_with("HTTP/1.1 200")
            || response.starts_with("HTTP/1.1 30")
            || response.starts_with("HTTP/1.0 200")
            || response.starts_with("HTTP/1.0 30"))
}

fn resolve_npx_binary() -> Option<String> {
    let command = if cfg!(target_os = "windows") {
        ("where", vec!["npx"])
    } else {
        ("which", vec!["npx"])
    };
    Command::new(command.0)
        .args(command.1)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .map(ToOwned::to_owned)
        })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        encode_path_segment, extract_value_array, normalize_local_endpoint, parse_company_summary,
        parse_issue_summary, parse_local_http_endpoint, service_result,
    };

    #[test]
    fn normalizes_default_local_endpoint() {
        assert_eq!(
            normalize_local_endpoint(None).expect("default endpoint should normalize"),
            "http://127.0.0.1:3100"
        );
    }

    #[test]
    fn rejects_non_local_endpoint() {
        assert!(normalize_local_endpoint(Some("https://paperclip.example.com")).is_err());
        assert!(normalize_local_endpoint(Some("http://192.168.1.50:3100")).is_err());
    }

    #[test]
    fn parses_localhost_endpoint() {
        assert_eq!(
            parse_local_http_endpoint("http://localhost:3100")
                .expect("localhost endpoint should parse"),
            ("localhost".to_string(), 3100)
        );
    }

    #[test]
    fn builds_embed_urls_from_endpoint() {
        let result = service_result(
            "test".to_string(),
            "http://127.0.0.1:3100".to_string(),
            false,
        );
        assert_eq!(result.api_base_url, "http://127.0.0.1:3100");
        assert_eq!(result.web_url, "http://127.0.0.1:3100");
        assert!(result.pid.is_none());
    }

    #[test]
    fn extracts_api_arrays_from_common_response_wrappers() {
        let direct = json!([{ "id": "company-1", "name": "One" }]);
        let wrapped = json!({ "items": [{ "id": "company-2", "name": "Two" }] });
        assert_eq!(extract_value_array(&direct).len(), 1);
        assert_eq!(extract_value_array(&wrapped).len(), 1);
        assert_eq!(
            parse_company_summary(extract_value_array(&wrapped)[0])
                .expect("company should parse")
                .id,
            "company-2"
        );
    }

    #[test]
    fn parses_issue_summary_with_optional_fields() {
        let issue = json!({
            "id": "issue-1",
            "title": "Build bridge",
            "status": "todo",
            "priority": "high",
            "assigneeAgentId": "agent-1"
        });
        let parsed = parse_issue_summary(&issue).expect("issue should parse");
        assert_eq!(parsed.title, "Build bridge");
        assert_eq!(parsed.assignee_agent_id.as_deref(), Some("agent-1"));
    }

    #[test]
    fn encodes_company_path_segments() {
        assert_eq!(
            encode_path_segment("company 1/alpha"),
            "company%201%2Falpha"
        );
    }

    #[test]
    fn renders_delegation_issue_description_with_audit_boundary() {
        let description = super::render_delegation_issue_description("Build the plan.");
        assert!(description.contains("Build the plan."));
        assert!(description.contains("Created by ResonantOS"));
        assert!(description.contains("traceable"));
    }
}
