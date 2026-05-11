use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::time::sleep;

use crate::host_state::{
    app_state_dir, assert_addon_capabilities, read_provider_secrets, read_runtime_state_value,
    resolve_provider_secret, state_file, write_provider_secrets,
};
use crate::provider_service::{
    execute_provider_service_chat, ChatMessageInput, ProviderServiceChatRequest,
};

const TELEGRAM_ADDON_ID: &str = "addon.telegram-channel";
const TELEGRAM_BOT_TOKEN_SECRET_ID: &str = "addon.telegram-channel.bot-token";
const DEFAULT_CHANNEL_ID: &str = "telegram-primary";
const DEFAULT_WORKSPACE_ID: &str = "workspace-main";
const STRATEGIST_AGENT_ID: &str = "strategist.core";

static TELEGRAM_SESSIONS: LazyLock<Mutex<HashMap<String, TelegramSessionControl>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone)]
struct TelegramSessionControl {
    stop: Arc<AtomicBool>,
    status: Arc<Mutex<TelegramServiceStatus>>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TelegramServiceStartRequest {
    pub(crate) channel_id: Option<String>,
    pub(crate) allowed_chat_ids: Option<Vec<String>>,
    pub(crate) preferred_model: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TelegramServiceStatus {
    pub(crate) running: bool,
    pub(crate) token_configured: bool,
    pub(crate) channel_id: String,
    pub(crate) last_error: Option<String>,
    pub(crate) last_update_id: Option<i64>,
    pub(crate) started_at: Option<String>,
}

#[derive(Deserialize)]
struct TelegramApiResponse<T> {
    ok: bool,
    result: T,
    description: Option<String>,
}

#[derive(Clone, Deserialize)]
struct TelegramUpdate {
    update_id: i64,
    message: Option<TelegramMessage>,
}

#[derive(Clone, Deserialize)]
struct TelegramMessage {
    message_id: i64,
    chat: TelegramChat,
    date: i64,
    text: Option<String>,
    caption: Option<String>,
    voice: Option<TelegramVoice>,
    audio: Option<TelegramAudio>,
}

#[derive(Clone, Deserialize)]
struct TelegramChat {
    id: i64,
    title: Option<String>,
    username: Option<String>,
    first_name: Option<String>,
    last_name: Option<String>,
}

#[derive(Clone, Deserialize)]
struct TelegramVoice {
    file_id: String,
    duration: Option<u32>,
    mime_type: Option<String>,
}

#[derive(Clone, Deserialize)]
struct TelegramAudio {
    file_id: String,
    duration: Option<u32>,
    file_name: Option<String>,
    mime_type: Option<String>,
}

#[derive(Deserialize)]
struct TelegramFile {
    file_path: Option<String>,
}

#[derive(Clone)]
struct TelegramInbound {
    chat_id: i64,
    chat_label: String,
    message_id: i64,
    telegram_date: i64,
    content: String,
    local_audio_path: Option<String>,
}

#[derive(Clone)]
struct ProviderRoute {
    provider_id: String,
    provider_type: String,
    api_base_url: Option<String>,
    runtime_node_id: Option<String>,
    runtime_node_kind: Option<String>,
    runtime_node_endpoint: Option<String>,
    auth_tier: Option<String>,
    model: String,
}

pub(crate) fn save_telegram_bot_token(app: &AppHandle, bot_token: String) -> Result<(), String> {
    let mut secrets = read_provider_secrets(app)?;
    let trimmed = bot_token.trim().to_string();
    if trimmed.is_empty() {
        secrets.remove(TELEGRAM_BOT_TOKEN_SECRET_ID);
    } else {
        secrets.insert(TELEGRAM_BOT_TOKEN_SECRET_ID.to_string(), trimmed);
    }
    write_provider_secrets(app, &secrets)
}

pub(crate) fn telegram_status(
    app: &AppHandle,
    channel_id: Option<String>,
) -> Result<TelegramServiceStatus, String> {
    let resolved_channel_id = channel_id.unwrap_or_else(|| DEFAULT_CHANNEL_ID.to_string());
    let token_configured = resolve_provider_secret(app, TELEGRAM_BOT_TOKEN_SECRET_ID)?
        .map(|token| !token.trim().is_empty())
        .unwrap_or(false);
    let sessions = TELEGRAM_SESSIONS
        .lock()
        .map_err(|_| "Telegram service status lock is poisoned.".to_string())?;
    if let Some(control) = sessions.get(&resolved_channel_id) {
        let mut status = control
            .status
            .lock()
            .map_err(|_| "Telegram service status lock is poisoned.".to_string())?
            .clone();
        status.token_configured = token_configured;
        return Ok(status);
    }
    Ok(TelegramServiceStatus {
        running: false,
        token_configured,
        channel_id: resolved_channel_id,
        last_error: None,
        last_update_id: None,
        started_at: None,
    })
}

pub(crate) async fn start_telegram_service(
    app: AppHandle,
    request: TelegramServiceStartRequest,
) -> Result<TelegramServiceStatus, String> {
    assert_addon_capabilities(
        &app,
        TELEGRAM_ADDON_ID,
        &["network", "providers", "notifications"],
    )?;
    let channel_id = request
        .channel_id
        .clone()
        .unwrap_or_else(|| DEFAULT_CHANNEL_ID.to_string());
    let bot_token = resolve_provider_secret(&app, TELEGRAM_BOT_TOKEN_SECRET_ID)?
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| {
            "Telegram bot token is missing. Add it in the Telegram Channel add-on panel."
                .to_string()
        })?;

    {
        let sessions = TELEGRAM_SESSIONS
            .lock()
            .map_err(|_| "Telegram service session lock is poisoned.".to_string())?;
        if let Some(existing) = sessions.get(&channel_id) {
            let status = existing
                .status
                .lock()
                .map_err(|_| "Telegram service status lock is poisoned.".to_string())?
                .clone();
            return Ok(status);
        }
    }

    let status = Arc::new(Mutex::new(TelegramServiceStatus {
        running: true,
        token_configured: true,
        channel_id: channel_id.clone(),
        last_error: None,
        last_update_id: None,
        started_at: Some(now_iso()),
    }));
    let stop = Arc::new(AtomicBool::new(false));
    let control = TelegramSessionControl {
        stop: Arc::clone(&stop),
        status: Arc::clone(&status),
    };
    TELEGRAM_SESSIONS
        .lock()
        .map_err(|_| "Telegram service session lock is poisoned.".to_string())?
        .insert(channel_id.clone(), control);

    let loop_app = app.clone();
    let loop_channel_id = channel_id.clone();
    tauri::async_runtime::spawn(async move {
        run_telegram_poll_loop(
            loop_app,
            bot_token,
            loop_channel_id.clone(),
            request.allowed_chat_ids.unwrap_or_default(),
            request.preferred_model,
            stop,
            status,
        )
        .await;
        if let Ok(mut sessions) = TELEGRAM_SESSIONS.lock() {
            sessions.remove(&loop_channel_id);
        }
    });

    telegram_status(&app, Some(channel_id))
}

pub(crate) fn stop_telegram_service(
    app: &AppHandle,
    channel_id: Option<String>,
) -> Result<TelegramServiceStatus, String> {
    let resolved_channel_id = channel_id.unwrap_or_else(|| DEFAULT_CHANNEL_ID.to_string());
    let sessions = TELEGRAM_SESSIONS
        .lock()
        .map_err(|_| "Telegram service session lock is poisoned.".to_string())?;
    if let Some(control) = sessions.get(&resolved_channel_id) {
        control.stop.store(true, Ordering::SeqCst);
        if let Ok(mut status) = control.status.lock() {
            status.running = false;
        }
    }
    telegram_status(app, Some(resolved_channel_id))
}

async fn run_telegram_poll_loop(
    app: AppHandle,
    bot_token: String,
    channel_id: String,
    allowed_chat_ids: Vec<String>,
    preferred_model: Option<String>,
    stop: Arc<AtomicBool>,
    status: Arc<Mutex<TelegramServiceStatus>>,
) {
    let client = Client::new();
    let mut offset: Option<i64> = None;
    while !stop.load(Ordering::SeqCst) {
        match fetch_updates(&client, &bot_token, offset).await {
            Ok(updates) => {
                for update in updates {
                    offset = Some(update.update_id + 1);
                    set_status(&status, |item| {
                        item.last_update_id = Some(update.update_id);
                        item.last_error = None;
                    });
                    if let Err(error) = handle_update(
                        &app,
                        &client,
                        &bot_token,
                        &channel_id,
                        &allowed_chat_ids,
                        preferred_model.clone(),
                        update,
                    )
                    .await
                    {
                        set_status(&status, |item| item.last_error = Some(error.clone()));
                        let _ = app.emit("telegram-channel-status", status_snapshot(&status));
                    }
                }
            }
            Err(error) => {
                set_status(&status, |item| item.last_error = Some(error));
                let _ = app.emit("telegram-channel-status", status_snapshot(&status));
                sleep(Duration::from_secs(5)).await;
            }
        }
    }
    set_status(&status, |item| item.running = false);
    let _ = app.emit("telegram-channel-status", status_snapshot(&status));
}

async fn fetch_updates(
    client: &Client,
    bot_token: &str,
    offset: Option<i64>,
) -> Result<Vec<TelegramUpdate>, String> {
    let endpoint = format!("https://api.telegram.org/bot{bot_token}/getUpdates");
    let mut request = client
        .get(endpoint)
        .query(&[("timeout", "25"), ("allowed_updates", r#"["message"]"#)]);
    if let Some(offset) = offset {
        request = request.query(&[("offset", offset.to_string())]);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Telegram getUpdates failed: {error}"))?;
    let payload = response
        .json::<TelegramApiResponse<Vec<TelegramUpdate>>>()
        .await
        .map_err(|error| format!("Telegram getUpdates response was invalid: {error}"))?;
    if !payload.ok {
        return Err(payload
            .description
            .unwrap_or_else(|| "Telegram getUpdates returned ok=false.".to_string()));
    }
    Ok(payload.result)
}

async fn handle_update(
    app: &AppHandle,
    client: &Client,
    bot_token: &str,
    channel_id: &str,
    allowed_chat_ids: &[String],
    preferred_model: Option<String>,
    update: TelegramUpdate,
) -> Result<(), String> {
    let Some(message) = update.message else {
        return Ok(());
    };
    if !allowed_chat_ids.is_empty()
        && !allowed_chat_ids
            .iter()
            .any(|id| id == &message.chat.id.to_string())
    {
        return Ok(());
    }

    let inbound = telegram_inbound_from_message(app, client, bot_token, &message).await?;
    let mut state = read_runtime_state_value(app)?.ok_or_else(|| {
        "Runtime state is not initialized; open ResonantOS once before starting Telegram."
            .to_string()
    })?;
    let thread_id = upsert_telegram_user_message(&mut state, channel_id, &inbound)?;
    save_state_and_emit(app, &state)?;

    let route = resolve_strategist_route(app, &state, preferred_model.as_deref())?;
    let messages = thread_messages_for_provider(&state, &thread_id);
    let reply = execute_provider_service_chat(
        app,
        ProviderServiceChatRequest {
            request_id: Some(format!("telegram:{thread_id}")),
            thread_id: Some(thread_id.clone()),
            agent_id: Some(STRATEGIST_AGENT_ID.to_string()),
            channel_id: Some(channel_id.to_string()),
            provider_id: route.provider_id,
            provider_type: route.provider_type,
            api_base_url: route.api_base_url,
            runtime_node_id: route.runtime_node_id,
            runtime_node_kind: route.runtime_node_kind,
            runtime_node_endpoint: route.runtime_node_endpoint,
            auth_tier: route.auth_tier,
            model: route.model,
            reasoning_effort: "medium".to_string(),
            system_prompt: telegram_system_prompt(&inbound),
            messages,
        },
    )
    .await?;

    let mut latest_state = read_runtime_state_value(app)?.unwrap_or(state);
    upsert_telegram_assistant_message(&mut latest_state, channel_id, &thread_id, &reply)?;
    save_state_and_emit(app, &latest_state)?;
    send_message(client, bot_token, inbound.chat_id, &reply).await
}

async fn telegram_inbound_from_message(
    app: &AppHandle,
    client: &Client,
    bot_token: &str,
    message: &TelegramMessage,
) -> Result<TelegramInbound, String> {
    let chat_label = chat_label(&message.chat);
    if let Some(text) = message.text.as_ref().or(message.caption.as_ref()) {
        return Ok(TelegramInbound {
            chat_id: message.chat.id,
            chat_label,
            message_id: message.message_id,
            telegram_date: message.date,
            content: text.trim().to_string(),
            local_audio_path: None,
        });
    }

    if let Some(voice) = &message.voice {
        let local_path =
            download_telegram_file(app, client, bot_token, &voice.file_id, "voice").await?;
        let content = format!(
            "[Telegram voice message received. Local audio copy: {}. Duration: {}s. MIME: {}. Transcription provider is not configured in this channel yet, so ask the user for a text summary if the audio content is required before acting.]",
            local_path,
            voice.duration.unwrap_or_default(),
            voice.mime_type.as_deref().unwrap_or("unknown")
        );
        return Ok(TelegramInbound {
            chat_id: message.chat.id,
            chat_label,
            message_id: message.message_id,
            telegram_date: message.date,
            content,
            local_audio_path: Some(local_path),
        });
    }

    if let Some(audio) = &message.audio {
        let local_path =
            download_telegram_file(app, client, bot_token, &audio.file_id, "audio").await?;
        let content = format!(
            "[Telegram audio message received. Local audio copy: {}. File: {}. Duration: {}s. MIME: {}. Transcription provider is not configured in this channel yet, so ask the user for a text summary if the audio content is required before acting.]",
            local_path,
            audio.file_name.as_deref().unwrap_or("unknown"),
            audio.duration.unwrap_or_default(),
            audio.mime_type.as_deref().unwrap_or("unknown")
        );
        return Ok(TelegramInbound {
            chat_id: message.chat.id,
            chat_label,
            message_id: message.message_id,
            telegram_date: message.date,
            content,
            local_audio_path: Some(local_path),
        });
    }

    Err("Telegram message type is not supported yet. Send text, voice, or audio.".to_string())
}

async fn download_telegram_file(
    app: &AppHandle,
    client: &Client,
    bot_token: &str,
    file_id: &str,
    kind: &str,
) -> Result<String, String> {
    let endpoint = format!("https://api.telegram.org/bot{bot_token}/getFile");
    let response = client
        .get(endpoint)
        .query(&[("file_id", file_id)])
        .send()
        .await
        .map_err(|error| format!("Telegram getFile failed: {error}"))?;
    let payload = response
        .json::<TelegramApiResponse<TelegramFile>>()
        .await
        .map_err(|error| format!("Telegram getFile response was invalid: {error}"))?;
    if !payload.ok {
        return Err(payload
            .description
            .unwrap_or_else(|| "Telegram getFile returned ok=false.".to_string()));
    }
    let file_path = payload
        .result
        .file_path
        .ok_or_else(|| "Telegram did not return a downloadable file path.".to_string())?;
    let bytes = client
        .get(format!(
            "https://api.telegram.org/file/bot{bot_token}/{file_path}"
        ))
        .send()
        .await
        .map_err(|error| format!("Telegram file download failed: {error}"))?
        .bytes()
        .await
        .map_err(|error| format!("Telegram file bytes could not be read: {error}"))?;

    let extension = PathBuf::from(&file_path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("bin")
        .to_string();
    let audio_dir = app_state_dir(app)?.join("telegram").join("audio");
    fs::create_dir_all(&audio_dir)
        .map_err(|error| format!("Failed to create Telegram audio directory: {error}"))?;
    let target = audio_dir.join(format!("{kind}-{}.{extension}", safe_file_id(file_id)));
    fs::write(&target, bytes)
        .map_err(|error| format!("Failed to save Telegram audio file: {error}"))?;
    Ok(target.display().to_string())
}

async fn send_message(
    client: &Client,
    bot_token: &str,
    chat_id: i64,
    content: &str,
) -> Result<(), String> {
    for chunk in split_telegram_message(content) {
        let response = client
            .post(format!(
                "https://api.telegram.org/bot{bot_token}/sendMessage"
            ))
            .json(&json!({
                "chat_id": chat_id,
                "text": chunk,
                "disable_web_page_preview": true
            }))
            .send()
            .await
            .map_err(|error| format!("Telegram sendMessage failed: {error}"))?;
        let payload = response
            .json::<TelegramApiResponse<Value>>()
            .await
            .map_err(|error| format!("Telegram sendMessage response was invalid: {error}"))?;
        if !payload.ok {
            return Err(payload
                .description
                .unwrap_or_else(|| "Telegram sendMessage returned ok=false.".to_string()));
        }
    }
    Ok(())
}

fn resolve_strategist_route(
    app: &AppHandle,
    state: &Value,
    preferred_model: Option<&str>,
) -> Result<ProviderRoute, String> {
    let strategy_routes = strategy_routes_for_agent(state, STRATEGIST_AGENT_ID);
    for route in strategy_routes {
        if let Some(candidate) = route_from_reference(app, state, &route, preferred_model)? {
            return Ok(candidate);
        }
    }

    let agent = state
        .get("agents")
        .and_then(Value::as_array)
        .and_then(|agents| {
            agents
                .iter()
                .find(|agent| agent.get("id").and_then(Value::as_str) == Some(STRATEGIST_AGENT_ID))
        });
    let mut provider_ids = Vec::new();
    if let Some(provider_id) = agent
        .and_then(|agent| agent.get("providerProfileId"))
        .and_then(Value::as_str)
    {
        provider_ids.push(provider_id.to_string());
    }
    if let Some(provider_id) = agent
        .and_then(|agent| agent.get("fallbackProviderProfileId"))
        .and_then(Value::as_str)
    {
        provider_ids.push(provider_id.to_string());
    }
    for provider_id in provider_ids {
        let route = json!({
            "providerProfileId": provider_id,
            "model": preferred_model.unwrap_or("")
        });
        if let Some(candidate) = route_from_reference(app, state, &route, preferred_model)? {
            return Ok(candidate);
        }
    }

    Err("No routable provider is available for Augmentor on Telegram. Configure a provider profile or fallback model.".to_string())
}

fn strategy_routes_for_agent(state: &Value, agent_id: &str) -> Vec<Value> {
    let Some(strategy) = state
        .get("modelStrategy")
        .and_then(|model_strategy| model_strategy.get("workloadStrategies"))
        .and_then(Value::as_array)
        .and_then(|strategies| {
            strategies.iter().find(|strategy| {
                strategy.get("ownerType").and_then(Value::as_str) == Some("agent")
                    && strategy.get("ownerId").and_then(Value::as_str) == Some(agent_id)
            })
        })
    else {
        return Vec::new();
    };

    let mut routes = Vec::new();
    if let Some(primary) = strategy.get("primaryRoute") {
        routes.push(primary.clone());
    }
    if let Some(chain_id) = strategy.get("fallbackChainId").and_then(Value::as_str) {
        if let Some(chain) = state
            .get("modelStrategy")
            .and_then(|model_strategy| model_strategy.get("fallbackChains"))
            .and_then(Value::as_array)
            .and_then(|chains| {
                chains
                    .iter()
                    .find(|chain| chain.get("id").and_then(Value::as_str) == Some(chain_id))
            })
        {
            if let Some(ordered) = chain.get("orderedRoutes").and_then(Value::as_array) {
                routes.extend(ordered.iter().cloned());
            }
            if let Some(last_resort) = chain.get("lastResortRoute") {
                routes.push(last_resort.clone());
            }
        }
    }
    routes
}

fn route_from_reference(
    app: &AppHandle,
    state: &Value,
    reference: &Value,
    preferred_model: Option<&str>,
) -> Result<Option<ProviderRoute>, String> {
    let Some(provider_id) = reference.get("providerProfileId").and_then(Value::as_str) else {
        return Ok(None);
    };
    let Some(provider) = find_by_id(state, "providers", provider_id) else {
        return Ok(None);
    };
    if provider.get("status").and_then(Value::as_str) == Some("missing") {
        return Ok(None);
    }
    let provider_type = provider
        .get("providerType")
        .and_then(Value::as_str)
        .unwrap_or("custom")
        .to_string();
    let auth_method = provider
        .get("authMethod")
        .and_then(Value::as_str)
        .unwrap_or("");
    if provider_type != "local"
        && auth_method != "local-runtime"
        && resolve_provider_secret(app, provider_id)?.is_none()
    {
        return Ok(None);
    }
    let model = preferred_model
        .filter(|model| model_supported_by_provider(provider, model))
        .or_else(|| {
            reference
                .get("model")
                .and_then(Value::as_str)
                .filter(|model| !model.is_empty())
        })
        .or_else(|| provider.get("primaryModel").and_then(Value::as_str))
        .ok_or_else(|| format!("Provider `{provider_id}` does not define a model."))?;
    let runtime_node = runtime_node_for_route(
        state,
        provider_id,
        reference.get("runtimeNodeId").and_then(Value::as_str),
        model,
    );
    let Some(runtime_node) = runtime_node else {
        return Ok(None);
    };
    Ok(Some(ProviderRoute {
        provider_id: provider_id.to_string(),
        provider_type,
        api_base_url: provider
            .get("apiBaseUrl")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        runtime_node_id: runtime_node
            .get("id")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        runtime_node_kind: runtime_node
            .get("kind")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        runtime_node_endpoint: runtime_node
            .get("endpoint")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        auth_tier: runtime_node
            .get("authTier")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .or_else(|| {
                provider
                    .get("authTier")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            }),
        model: model.to_string(),
    }))
}

fn runtime_node_for_route<'a>(
    state: &'a Value,
    provider_id: &str,
    preferred_runtime_node_id: Option<&str>,
    model: &str,
) -> Option<&'a Value> {
    let nodes = state.get("runtimeNodes").and_then(Value::as_array)?;
    if let Some(node_id) = preferred_runtime_node_id {
        let node = nodes
            .iter()
            .find(|node| node.get("id").and_then(Value::as_str) == Some(node_id))?;
        if runtime_node_can_serve(node, provider_id, model) {
            return Some(node);
        }
    }
    nodes
        .iter()
        .find(|node| runtime_node_can_serve(node, provider_id, model))
}

fn runtime_node_can_serve(node: &Value, provider_id: &str, model: &str) -> bool {
    let health = node
        .get("healthState")
        .and_then(Value::as_str)
        .unwrap_or("unavailable");
    let kind = node.get("kind").and_then(Value::as_str).unwrap_or("");
    let endpoint = node.get("endpoint").and_then(Value::as_str).unwrap_or("");
    node.get("providerProfileId").and_then(Value::as_str) == Some(provider_id)
        && matches!(health, "ready" | "degraded" | "deployable")
        && (kind != "remote-user-owned" || endpoint.starts_with("http"))
        && node
            .get("supportedModels")
            .and_then(Value::as_array)
            .map(|models| models.iter().any(|item| item.as_str() == Some(model)))
            .unwrap_or(false)
}

fn model_supported_by_provider(provider: &Value, model: &str) -> bool {
    provider
        .get("allowedModels")
        .and_then(Value::as_array)
        .map(|models| models.iter().any(|item| item.as_str() == Some(model)))
        .unwrap_or(false)
}

fn find_by_id<'a>(state: &'a Value, collection: &str, id: &str) -> Option<&'a Value> {
    state
        .get(collection)
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("id").and_then(Value::as_str) == Some(id))
        })
}

fn upsert_telegram_user_message(
    state: &mut Value,
    channel_id: &str,
    inbound: &TelegramInbound,
) -> Result<String, String> {
    let thread_id = telegram_thread_id(channel_id, inbound.chat_id);
    ensure_thread(state, channel_id, &thread_id, inbound);
    append_message(
        state,
        &thread_id,
        channel_id,
        "user",
        "Telegram",
        &inbound.content,
        Some(json!({
            "source": "telegram",
            "chatId": inbound.chat_id.to_string(),
            "messageId": inbound.message_id,
            "telegramDate": inbound.telegram_date,
            "localAudioPath": inbound.local_audio_path,
        })),
    )?;
    Ok(thread_id)
}

fn upsert_telegram_assistant_message(
    state: &mut Value,
    channel_id: &str,
    thread_id: &str,
    reply: &str,
) -> Result<(), String> {
    append_message(
        state,
        thread_id,
        channel_id,
        "assistant",
        "Augmentor",
        reply,
        Some(json!({ "source": "telegram" })),
    )
}

fn ensure_thread(state: &mut Value, channel_id: &str, thread_id: &str, inbound: &TelegramInbound) {
    let workspace_id = workspace_id_for_channel(state, channel_id);
    let threads = state
        .get_mut("conversationThreads")
        .and_then(Value::as_array_mut)
        .expect("runtime state must include conversationThreads");
    if threads
        .iter()
        .any(|thread| thread.get("id").and_then(Value::as_str) == Some(thread_id))
    {
        return;
    }
    threads.insert(0, json!({
        "id": thread_id,
        "title": format!("Telegram · {}", inbound.chat_label),
        "owningAgentId": STRATEGIST_AGENT_ID,
        "workspaceId": workspace_id,
        "channelId": channel_id,
        "summary": "Telegram conversation mirrored into the local ResonantOS Augmentor history.",
        "messages": []
    }));
}

fn append_message(
    state: &mut Value,
    thread_id: &str,
    channel_id: &str,
    role: &str,
    author: &str,
    content: &str,
    payload_extra: Option<Value>,
) -> Result<(), String> {
    let threads = state
        .get_mut("conversationThreads")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Runtime state is missing conversationThreads.".to_string())?;
    let thread = threads
        .iter_mut()
        .find(|thread| thread.get("id").and_then(Value::as_str) == Some(thread_id))
        .ok_or_else(|| format!("Conversation thread `{thread_id}` was not found."))?;
    let messages = thread
        .get_mut("messages")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("Conversation thread `{thread_id}` has no messages array."))?;
    let message_id = format!("{thread_id}:m{}", messages.len() + 1);
    let created_at = now_iso();
    messages.push(json!({
        "id": message_id,
        "threadId": thread_id,
        "channelId": channel_id,
        "role": role,
        "author": author,
        "createdAt": created_at,
        "content": content,
        "status": "complete"
    }));
    append_transcript_event(
        state,
        thread_id,
        channel_id,
        &message_id,
        role,
        author,
        content,
        payload_extra,
    );
    Ok(())
}

fn append_transcript_event(
    state: &mut Value,
    thread_id: &str,
    channel_id: &str,
    message_id: &str,
    role: &str,
    author: &str,
    content: &str,
    payload_extra: Option<Value>,
) {
    let ledger = state
        .get_mut("transcriptLedger")
        .and_then(Value::as_array_mut);
    let Some(ledger) = ledger else {
        return;
    };
    let mut payload = json!({
        "author": author,
        "content": content,
        "status": "complete",
        "archiveCitations": []
    });
    if let (Some(object), Some(extra)) = (payload.as_object_mut(), payload_extra) {
        object.insert("telegram".to_string(), extra);
    }
    ledger.push(json!({
        "id": format!("{thread_id}:e{}", ledger.len() + 1),
        "createdAt": now_iso(),
        "action": "message-appended",
        "threadId": thread_id,
        "channelId": channel_id,
        "messageId": message_id,
        "role": role,
        "agentId": if role == "assistant" { STRATEGIST_AGENT_ID } else { "" },
        "payload": payload
    }));
}

fn thread_messages_for_provider(state: &Value, thread_id: &str) -> Vec<ChatMessageInput> {
    state
        .get("conversationThreads")
        .and_then(Value::as_array)
        .and_then(|threads| {
            threads
                .iter()
                .find(|thread| thread.get("id").and_then(Value::as_str) == Some(thread_id))
        })
        .and_then(|thread| thread.get("messages"))
        .and_then(Value::as_array)
        .map(|messages| {
            messages
                .iter()
                .filter_map(|message| {
                    let role = message.get("role").and_then(Value::as_str)?;
                    let content = message.get("content").and_then(Value::as_str)?;
                    Some(ChatMessageInput {
                        role: role.to_string(),
                        content: content.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn workspace_id_for_channel(state: &Value, channel_id: &str) -> String {
    state
        .get("channels")
        .and_then(Value::as_array)
        .and_then(|channels| {
            channels
                .iter()
                .find(|channel| channel.get("id").and_then(Value::as_str) == Some(channel_id))
        })
        .and_then(|channel| channel.get("workspaceId"))
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_WORKSPACE_ID)
        .to_string()
}

fn telegram_system_prompt(inbound: &TelegramInbound) -> String {
    format!(
        "You are Augmentor, the trusted Strategist identity inside ResonantOS. This turn arrived through Telegram from {}. Reply naturally and concisely for Telegram, but preserve the same trust boundary and memory discipline as the desktop chat. If the message is an audio placeholder without transcription, say that the audio was received and ask for a short text summary before making decisions based on its content.",
        inbound.chat_label
    )
}

fn save_state_and_emit(app: &AppHandle, state: &Value) -> Result<(), String> {
    let path = state_file(app)?;
    let payload = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to encode runtime state: {error}"))?;
    fs::write(&path, payload).map_err(|error| format!("Failed to write runtime state: {error}"))?;
    app.emit("runtime-state-updated", state.clone())
        .map_err(|error| format!("Failed to broadcast runtime state update: {error}"))
}

fn set_status(
    status: &Arc<Mutex<TelegramServiceStatus>>,
    updater: impl FnOnce(&mut TelegramServiceStatus),
) {
    if let Ok(mut item) = status.lock() {
        updater(&mut item);
    }
}

fn status_snapshot(status: &Arc<Mutex<TelegramServiceStatus>>) -> TelegramServiceStatus {
    status
        .lock()
        .map(|item| item.clone())
        .unwrap_or(TelegramServiceStatus {
            running: false,
            token_configured: false,
            channel_id: DEFAULT_CHANNEL_ID.to_string(),
            last_error: Some("Telegram service status lock is poisoned.".to_string()),
            last_update_id: None,
            started_at: None,
        })
}

fn telegram_thread_id(channel_id: &str, chat_id: i64) -> String {
    format!(
        "thread-{channel_id}-chat-{}",
        chat_id.to_string().replace('-', "neg")
    )
}

fn chat_label(chat: &TelegramChat) -> String {
    chat.title
        .as_ref()
        .or(chat.username.as_ref())
        .cloned()
        .unwrap_or_else(|| {
            [chat.first_name.as_deref(), chat.last_name.as_deref()]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" ")
        })
        .trim()
        .to_string()
        .if_empty_then(|| chat.id.to_string())
}

trait EmptyStringFallback {
    fn if_empty_then(self, fallback: impl FnOnce() -> String) -> String;
}

impl EmptyStringFallback for String {
    fn if_empty_then(self, fallback: impl FnOnce() -> String) -> String {
        if self.trim().is_empty() {
            fallback()
        } else {
            self
        }
    }
}

fn split_telegram_message(content: &str) -> Vec<String> {
    const LIMIT: usize = 3900;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return vec!["Augmentor returned an empty response.".to_string()];
    }
    let chars = trimmed.chars().collect::<Vec<_>>();
    chars
        .chunks(LIMIT)
        .map(|chunk| chunk.iter().collect::<String>())
        .collect()
}

fn safe_file_id(file_id: &str) -> String {
    file_id
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect()
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::{split_telegram_message, telegram_thread_id};

    #[test]
    fn telegram_thread_id_is_stable_for_negative_chat_ids() {
        assert_eq!(
            telegram_thread_id("telegram-primary", -123),
            "thread-telegram-primary-chat-neg123"
        );
    }

    #[test]
    fn split_telegram_message_respects_telegram_sized_chunks() {
        let chunks = split_telegram_message(&"a".repeat(8_100));
        assert_eq!(chunks.len(), 3);
        assert!(chunks.iter().all(|chunk| chunk.len() <= 3_900));
    }
}
