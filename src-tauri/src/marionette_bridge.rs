use std::io::{BufReader, Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use serde_json::{json, Value};
use tracing::{debug, error, info, warn};

/// Marionette wire protocol client for Firefox/CamoFox.
///
/// Wire format:
///   Command:  [0, messageId, "CommandName", {params}]
///   Response: [1, messageId, errorOrNull, resultOrNull]
/// Framing:   `<byte_length>:<json_payload>`
///
/// The greeting on connect is a plain JSON object (exception to the array format):
///   <len>:{"applicationType":"gecko","marionetteProtocol":3}
///
/// Marionette is strictly sequential — one command in-flight at a time.
pub struct MarionetteClient {
    stream: TcpStream,
    reader: BufReader<TcpStream>,
    session_id: Option<String>,
    command_id: u64,
    /// Port stored so `send_command` can reconnect without extra parameters.
    port: u16,
}

impl MarionetteClient {
    /// Connect to Marionette on the given port, consume the greeting banner, and
    /// verify that the protocol version is compatible.
    pub fn connect(port: u16) -> Result<Self, String> {
        info!(port, "Connecting to Marionette");
        let stream = TcpStream::connect(("127.0.0.1", port))
            .map_err(|e| format!("Marionette connect failed on port {port}: {e}"))?;

        stream
            .set_read_timeout(Some(Duration::from_secs(30)))
            .map_err(|e| format!("Set read timeout: {e}"))?;
        stream
            .set_write_timeout(Some(Duration::from_secs(10)))
            .map_err(|e| format!("Set write timeout: {e}"))?;

        let reader_stream = stream
            .try_clone()
            .map_err(|e| format!("Clone stream for reader: {e}"))?;
        let reader = BufReader::new(reader_stream);

        let mut client = MarionetteClient {
            stream,
            reader,
            session_id: None,
            command_id: 0,
            port,
        };

        // Consume the greeting banner — it is a plain JSON object, not an array.
        let greeting = client.read_message()?;
        let protocol = greeting
            .get("marionetteProtocol")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        if protocol < 3 {
            return Err(format!(
                "Unsupported Marionette protocol version: {protocol} (need >= 3)"
            ));
        }

        info!(port, "Marionette connected, protocol verified");
        Ok(client)
    }

    // -------------------------------------------------------------------------
    // Core send/receive
    // -------------------------------------------------------------------------

    /// Maximum allowed Marionette message size (64 MB). Prevents OOM from
    /// malformed or malicious length prefixes.
    const MAX_MESSAGE_SIZE: usize = 64 * 1024 * 1024;

    fn read_message(&mut self) -> Result<Value, String> {
        // Read ASCII decimal length prefix terminated by ':'
        let mut len_buf = Vec::new();
        let mut byte = [0u8; 1];
        loop {
            self.reader
                .read_exact(&mut byte)
                .map_err(|e| format!("Read length byte: {e}"))?;
            if byte[0] == b':' {
                break;
            }
            if !byte[0].is_ascii_digit() {
                return Err(format!("Invalid length byte: 0x{:02x}", byte[0]));
            }
            len_buf.push(byte[0]);
            // Guard against absurdly long length prefix strings
            if len_buf.len() > 10 {
                return Err("Marionette length prefix too long".to_string());
            }
        }
        let length: usize = String::from_utf8(len_buf)
            .map_err(|e| format!("Length not UTF-8: {e}"))?
            .parse()
            .map_err(|e| format!("Parse length: {e}"))?;

        // M11 fix: cap message size to prevent OOM
        if length > Self::MAX_MESSAGE_SIZE {
            return Err(format!(
                "Marionette message too large: {length} bytes (max {})",
                Self::MAX_MESSAGE_SIZE
            ));
        }

        let mut payload = vec![0u8; length];
        self.reader
            .read_exact(&mut payload)
            .map_err(|e| format!("Read payload ({length} bytes): {e}"))?;

        serde_json::from_slice(&payload).map_err(|e| format!("Parse JSON payload: {e}"))
    }

    /// Drop the current TCP connection and open a fresh one, consuming the
    /// greeting and re-establishing the Marionette/WebDriver session.
    ///
    /// Called automatically by `send_command` when a read error occurs; the
    /// caller still receives the original error so they know the in-flight
    /// command did not complete.
    fn reconnect(&mut self, port: u16) -> Result<(), String> {
        warn!(port, "Reconnecting to Marionette (previous session state will be lost)");
        let stream = TcpStream::connect(("127.0.0.1", port))
            .map_err(|e| format!("Reconnect to Marionette on port {port}: {e}"))?;
        stream
            .set_read_timeout(Some(Duration::from_secs(30)))
            .map_err(|e| format!("Set read timeout on reconnect: {e}"))?;
        stream
            .set_write_timeout(Some(Duration::from_secs(10)))
            .map_err(|e| format!("Set write timeout on reconnect: {e}"))?;
        let reader_stream = stream
            .try_clone()
            .map_err(|e| format!("Clone stream on reconnect: {e}"))?;
        // Replace the broken socket/reader with the fresh ones.
        self.stream = stream;
        self.reader = BufReader::new(reader_stream);
        // Consume the greeting banner to advance the protocol state machine.
        let greeting = self.read_message()?;
        let protocol = greeting
            .get("marionetteProtocol")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        if protocol < 3 {
            return Err(format!(
                "Unsupported Marionette protocol version after reconnect: {protocol}"
            ));
        }
        // Re-establish the WebDriver session so subsequent commands work.
        self.new_session()?;
        Ok(())
    }

    fn send_command(&mut self, command: &str, params: Value) -> Result<Value, String> {
        self.command_id += 1;
        debug!(command, id = self.command_id, "Sending Marionette command");
        // Array format: [type=0, id, command_name, params]
        let cmd = Value::Array(vec![
            Value::from(0u64),
            Value::from(self.command_id),
            Value::String(command.to_string()),
            params,
        ]);
        let json = serde_json::to_string(&cmd).unwrap();
        let framed = format!("{}:{}", json.len(), json);

        self.stream
            .write_all(framed.as_bytes())
            .map_err(|e| format!("Send command '{command}': {e}"))?;
        self.stream
            .flush()
            .map_err(|e| format!("Flush after '{command}': {e}"))?;

        let response = match self.read_message() {
            Ok(r) => r,
            Err(e) => {
                // The TCP socket is in an unknown state after a read error.
                // Attempt to reconnect once so future calls have a working
                // connection; the in-flight command result is unrecoverable.
                error!(command, error = %e, "Marionette read failed, attempting reconnect");
                let _ = self.reconnect(self.port);
                return Err(e);
            }
        };
        // Response: [1, id, error_or_null, result_or_null]
        let arr = response
            .as_array()
            .ok_or_else(|| format!("Response to '{command}' is not an array: {response:?}"))?;
        if arr.len() < 4 {
            return Err(format!(
                "Malformed response to '{command}' (len={}): {arr:?}",
                arr.len()
            ));
        }
        // Verify that the response ID matches the command we sent.
        // A mismatch indicates a desync — the connection must be reset.
        let expected_id = self.command_id;
        let response_id = arr[1].as_u64().unwrap_or(u64::MAX);
        if response_id != expected_id {
            return Err(format!(
                "Response ID mismatch: expected {expected_id}, got {response_id}"
            ));
        }
        // arr[2] is the error object (null on success)
        if !arr[2].is_null() {
            let err = &arr[2];
            return Err(format!(
                "Marionette error for '{}': {} — {}",
                command,
                err["error"].as_str().unwrap_or("unknown"),
                err["message"].as_str().unwrap_or("")
            ));
        }
        Ok(arr[3].clone())
    }

    // -------------------------------------------------------------------------
    // Session management
    // -------------------------------------------------------------------------

    /// Perform the WebDriver:NewSession handshake and store the session id.
    pub fn new_session(&mut self) -> Result<String, String> {
        let result = self.send_command(
            "WebDriver:NewSession",
            json!({
                "capabilities": {
                    "alwaysMatch": {
                        "moz:firefoxOptions": {}
                    }
                }
            }),
        )?;
        let session_id = result["sessionId"]
            .as_str()
            .ok_or_else(|| format!("NewSession response missing sessionId: {result:?}"))?
            .to_string();
        self.session_id = Some(session_id.clone());
        Ok(session_id)
    }

    /// Tear down the WebDriver session.
    pub fn close_session(&mut self) -> Result<(), String> {
        self.send_command("WebDriver:DeleteSession", json!({}))?;
        self.session_id = None;
        Ok(())
    }

    // -------------------------------------------------------------------------
    // Navigation
    // -------------------------------------------------------------------------

    pub fn navigate(&mut self, url: &str) -> Result<(), String> {
        self.send_command("WebDriver:Navigate", json!({ "url": url }))?;
        Ok(())
    }

    pub fn get_url(&mut self) -> Result<String, String> {
        let result = self.send_command("WebDriver:GetCurrentURL", json!({}))?;
        result
            .as_str()
            .map(str::to_string)
            .or_else(|| result["value"].as_str().map(str::to_string))
            .ok_or_else(|| format!("GetCurrentURL unexpected result: {result:?}"))
    }

    pub fn get_title(&mut self) -> Result<String, String> {
        let result = self.send_command("WebDriver:GetTitle", json!({}))?;
        result
            .as_str()
            .map(str::to_string)
            .or_else(|| result["value"].as_str().map(str::to_string))
            .ok_or_else(|| format!("GetTitle unexpected result: {result:?}"))
    }

    // -------------------------------------------------------------------------
    // Script execution
    // -------------------------------------------------------------------------

    /// Execute a script in the page (content) context.
    pub fn execute_script(&mut self, script: &str) -> Result<Value, String> {
        let result = self.send_command(
            "WebDriver:ExecuteScript",
            json!({
                "script": script,
                "args": []
            }),
        )?;
        // Result is wrapped under "value" key
        Ok(result
            .get("value")
            .cloned()
            .unwrap_or(result))
    }

    /// Set context to chrome, execute the script, then restore context to content.
    ///
    /// ⚠️ SECURITY: Executes with full system principal privileges.
    /// NEVER pass user-controlled input as the script parameter.
    /// This function must only be called with hardcoded internal scripts.
    pub fn execute_script_chrome(&mut self, script: &str) -> Result<Value, String> {
        info!("Executing script in chrome (privileged) context");
        // Switch to chrome context
        self.send_command(
            "Marionette:SetContext",
            json!({ "value": "chrome" }),
        )?;
        let result = self.send_command(
            "WebDriver:ExecuteScript",
            json!({
                "script": script,
                "args": []
            }),
        );
        // C4 fix: Always restore to content. If restore fails, force reconnect.
        // If reconnect also fails, mark session defunct to prevent privilege leak.
        let restore = self.send_command("Marionette:SetContext", json!({ "value": "content" }));
        if restore.is_err() {
            error!("Failed to restore content context after chrome execution — forcing reconnect");
            if self.reconnect(self.port).is_err() {
                error!("Reconnect also failed — marking session as defunct");
                self.session_id = None;
            }
        }
        let result = result?;
        Ok(result.get("value").cloned().unwrap_or(result))
    }

    // -------------------------------------------------------------------------
    // Screenshots
    // -------------------------------------------------------------------------

    /// Take a full-page screenshot and return the base64-encoded PNG.
    pub fn screenshot(&mut self) -> Result<String, String> {
        let result = self.send_command("WebDriver:TakeScreenshot", json!({ "full": true }))?;
        result["value"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| format!("TakeScreenshot unexpected result: {result:?}"))
    }

    // -------------------------------------------------------------------------
    // Element interaction
    // -------------------------------------------------------------------------

    /// Find a single element. Returns the internal element id string.
    /// `using` is e.g. `"css selector"`, `"xpath"`, `"id"`.
    pub fn find_element(&mut self, using: &str, value: &str) -> Result<String, String> {
        let result = self.send_command(
            "WebDriver:FindElement",
            json!({
                "using": using,
                "value": value
            }),
        )?;
        // Element id is nested under a special key
        let obj = result.as_object().ok_or_else(|| {
            format!("FindElement unexpected result type: {result:?}")
        })?;
        // The element reference key varies; try known WebDriver keys
        let element_id = obj
            .get("web-element-identifier")
            .or_else(|| obj.get("element-6066-11e4-a52e-4f735466cecf"))
            .or_else(|| obj.values().next())
            .and_then(Value::as_str)
            .ok_or_else(|| format!("FindElement: no element id in result: {result:?}"))?
            .to_string();
        Ok(element_id)
    }

    /// Click on an element by its internal element id.
    pub fn click_element(&mut self, element_id: &str) -> Result<(), String> {
        self.send_command(
            "WebDriver:ElementClick",
            json!({ "id": element_id }),
        )?;
        Ok(())
    }

    // -------------------------------------------------------------------------
    // Health check
    // -------------------------------------------------------------------------

    /// Quick liveness probe — returns true if the Marionette connection is alive.
    pub fn is_connected(&mut self) -> bool {
        self.get_title().is_ok()
    }

    // -------------------------------------------------------------------------
    // Phantom wallet helpers
    // -------------------------------------------------------------------------

    /// Get the moz-extension UUID for the Phantom wallet extension.
    pub fn get_phantom_uuid(&mut self) -> Result<String, String> {
        let result = self.execute_script_chrome(
            r#"
            const {AddonManager} = ChromeUtils.importESModule(
                "resource://gre/modules/AddonManager.sys.mjs"
            );
            let addon = await AddonManager.getAddonByID(
                "{7c42eea1-b3e4-4be4-a56f-82a5852b12dc}"
            );
            if (!addon) return null;
            const {WebExtensionPolicy} = Cu.getGlobalForObject(Cu);
            const policy = WebExtensionPolicy.getByID(addon.id);
            return policy?.mozExtensionHostname || null;
            "#,
        )?;
        result
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| "Phantom extension not found or UUID unavailable".to_string())
    }

    /// Navigate to a Phantom extension page using the system principal (needed for
    /// approval popups).
    pub fn open_phantom_page(&mut self, page: &str) -> Result<(), String> {
        let uuid = self.get_phantom_uuid()?;
        self.execute_script_chrome(&format!(
            r#"
            const win = Services.wm.getMostRecentWindow("navigator:browser");
            win.gBrowser.selectedBrowser.loadURI(
                Services.io.newURI("moz-extension://{uuid}/{page}"),
                {{ triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }}
            );
            "#,
            uuid = uuid,
            page = page,
        ))
        .map(|_| ())
    }

    /// Trigger Phantom wallet connect and return the public key directly via
    /// `executeAsyncScript`. This avoids the spoofable page-title side channel
    /// (C3 fix) and works correctly after page navigations (C1 fix).
    ///
    /// The script injects a DOM `<script>` element (to access the page's
    /// `window.phantom` object injected by the extension content script) and
    /// communicates the result back through a custom DOM event.
    pub fn trigger_phantom_connect(&mut self) -> Result<Value, String> {
        info!("Triggering Phantom wallet connect via executeAsyncScript");
        // C3 fix: use executeAsyncScript to return pubkey directly from
        // Marionette script context rather than side-channeling through title.
        let result = self.send_command(
            "WebDriver:ExecuteAsyncScript",
            json!({
                "script": r#"
                    const resolve = arguments[arguments.length - 1];
                    const s = document.createElement('script');
                    s.textContent = `
                        (async () => {
                            try {
                                const resp = await window.phantom.solana.connect();
                                const pubkey = resp.publicKey.toString();
                                document.dispatchEvent(new CustomEvent('__phantom_result__', { detail: pubkey }));
                            } catch(e) {
                                document.dispatchEvent(new CustomEvent('__phantom_result__', { detail: 'ERROR:' + e.message }));
                            }
                        })();
                    `;
                    document.addEventListener('__phantom_result__', (e) => {
                        resolve(e.detail);
                    }, { once: true });
                    document.head.appendChild(s);
                "#,
                "args": [],
                "scriptTimeout": 60000
            }),
        )?;
        Ok(result.get("value").cloned().unwrap_or(result))
    }

    /// Check if the page has the Phantom extension's content script injected.
    /// Returns true if `window.phantom.solana` is available.
    pub fn check_phantom_available(&mut self) -> Result<bool, String> {
        let result = self.execute_script(
            r#"
            const s = document.createElement('script');
            s.textContent = `document.title = (!!window.phantom && !!window.phantom.solana) ? '__PHANTOM_OK__' : '__PHANTOM_MISSING__';`;
            document.head.appendChild(s);
            return null;
            "#,
        )?;
        let title = self.get_title()?;
        Ok(title.contains("__PHANTOM_OK__"))
    }
}
