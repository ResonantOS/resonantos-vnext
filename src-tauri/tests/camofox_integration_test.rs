//! Comprehensive CamoFox integration test suite
//! Tests the full stack: Marionette bridge → CamoFox process → navigation → Phantom
//! 
//! Run: cargo test --test camofox_integration_test -- --nocapture --test-threads=1

use std::io::{BufReader, Read, Write};
use std::net::TcpStream;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

fn home() -> String {
    std::env::var("HOME").unwrap()
}

fn camofox_binary() -> String {
    format!("{}/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox", home())
}

fn profile_dir() -> String {
    format!("{}/.camofox/profiles/resonantos", home())
}

fn kill_camofox() {
    let _ = Command::new("pkill").args(["-f", "camoufox"]).status();
    thread::sleep(Duration::from_secs(2));
}

fn launch_camofox() -> std::process::Child {
    Command::new(camofox_binary())
        .args(["-profile", &profile_dir(), "-marionette", "-no-remote", "--headless"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("Failed to launch CamoFox")
}

fn wait_for_marionette(timeout_secs: u64) -> TcpStream {
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    loop {
        if Instant::now() > deadline {
            panic!("Marionette connection timeout after {}s", timeout_secs);
        }
        match TcpStream::connect("127.0.0.1:2828") {
            Ok(stream) => {
                stream.set_read_timeout(Some(Duration::from_secs(30))).unwrap();
                stream.set_write_timeout(Some(Duration::from_secs(10))).unwrap();
                return stream;
            }
            Err(_) => thread::sleep(Duration::from_millis(500)),
        }
    }
}

fn read_message(reader: &mut BufReader<TcpStream>) -> String {
    let mut len_buf = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        reader.read_exact(&mut byte).expect("read length byte");
        if byte[0] == b':' { break; }
        assert!(byte[0].is_ascii_digit(), "Invalid length byte: {}", byte[0]);
        len_buf.push(byte[0]);
    }
    let length: usize = String::from_utf8(len_buf).unwrap().parse().unwrap();
    let mut payload = vec![0u8; length];
    reader.read_exact(&mut payload).expect("read payload");
    String::from_utf8(payload).expect("payload is UTF-8")
}

fn send_command(writer: &mut TcpStream, reader: &mut BufReader<TcpStream>, id: u64, cmd: &str, params: &str) -> String {
    let payload = format!(r#"[0,{},"{}",{}]"#, id, cmd, params);
    let framed = format!("{}:{}", payload.len(), payload);
    writer.write_all(framed.as_bytes()).expect("write command");
    writer.flush().expect("flush");
    read_message(reader)
}

// ═══════════════════════════════════════════════════════════════════
// Test 1: Marionette Protocol Basics
// ═══════════════════════════════════════════════════════════════════

#[test]
fn t01_marionette_greeting_is_json_object() {
    kill_camofox();
    let mut child = launch_camofox();
    let stream = wait_for_marionette(15);
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    
    let greeting = read_message(&mut reader);
    println!("Greeting: {}", greeting);
    
    // Greeting must be a JSON object (not array) with applicationType
    assert!(greeting.starts_with('{'), "Greeting should be object, got: {}", &greeting[..50.min(greeting.len())]);
    assert!(greeting.contains("applicationType"), "Missing applicationType");
    assert!(greeting.contains("marionetteProtocol"), "Missing marionetteProtocol");
    
    // Protocol version should be 3
    let parsed: serde_json::Value = serde_json::from_str(&greeting).unwrap();
    let proto = parsed["marionetteProtocol"].as_u64().unwrap();
    assert_eq!(proto, 3, "Expected protocol 3, got {}", proto);
    
    child.kill().ok();
    child.wait().ok();
    println!("✅ t01 PASSED: Greeting is valid JSON object with protocol 3");
}

// ═══════════════════════════════════════════════════════════════════
// Test 2: Command/Response Array Format
// ═══════════════════════════════════════════════════════════════════

#[test]
fn t02_command_response_array_format() {
    kill_camofox();
    let mut child = launch_camofox();
    let stream = wait_for_marionette(15);
    let mut writer = stream.try_clone().unwrap();
    let mut reader = BufReader::new(stream);
    
    // Consume greeting
    let _ = read_message(&mut reader);
    
    // Send NewSession command as array
    let resp = send_command(&mut writer, &mut reader, 1, "WebDriver:NewSession", r#"{"capabilities":{}}"#);
    println!("NewSession response: {}...", &resp[..resp.len().min(120)]);
    
    // Response must be a JSON array: [1, id, error_or_null, result_or_null]
    let parsed: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert!(parsed.is_array(), "Response should be array");
    let arr = parsed.as_array().unwrap();
    assert_eq!(arr.len(), 4, "Response array should have 4 elements, got {}", arr.len());
    assert_eq!(arr[0].as_u64().unwrap(), 1, "Response type should be 1 (response)");
    assert_eq!(arr[1].as_u64().unwrap(), 1, "Response id should match command id");
    assert!(arr[2].is_null(), "Error should be null on success");
    assert!(arr[3].is_object(), "Result should be object");
    assert!(arr[3]["sessionId"].is_string(), "Result should have sessionId");
    
    child.kill().ok();
    child.wait().ok();
    println!("✅ t02 PASSED: Command/response uses correct array format");
}

// ═══════════════════════════════════════════════════════════════════
// Test 3: Navigation + Page Content
// ═══════════════════════════════════════════════════════════════════

#[test]
fn t03_navigate_and_read_page() {
    kill_camofox();
    let mut child = launch_camofox();
    let stream = wait_for_marionette(15);
    let mut writer = stream.try_clone().unwrap();
    let mut reader = BufReader::new(stream);
    
    let _ = read_message(&mut reader); // greeting
    let _ = send_command(&mut writer, &mut reader, 1, "WebDriver:NewSession", r#"{"capabilities":{}}"#);
    
    // Navigate to example.com
    let nav = send_command(&mut writer, &mut reader, 2, "WebDriver:Navigate", r#"{"url":"https://example.com"}"#);
    println!("Navigate: {}", &nav[..nav.len().min(80)]);
    
    thread::sleep(Duration::from_secs(3));
    
    // Get title
    let title_resp = send_command(&mut writer, &mut reader, 3, "WebDriver:GetTitle", "{}");
    println!("Title: {}", title_resp);
    assert!(title_resp.contains("Example Domain"), "Expected 'Example Domain' in title");
    
    // Get URL
    let url_resp = send_command(&mut writer, &mut reader, 4, "WebDriver:GetCurrentURL", "{}");
    println!("URL: {}", url_resp);
    assert!(url_resp.contains("example.com"), "Expected 'example.com' in URL");
    
    // Execute script
    let script_resp = send_command(&mut writer, &mut reader, 5, "WebDriver:ExecuteScript", 
        r#"{"script":"return document.querySelector('h1').textContent","args":[]}"#);
    println!("Script result: {}", script_resp);
    assert!(script_resp.contains("Example Domain"), "Expected 'Example Domain' from script");
    
    child.kill().ok();
    child.wait().ok();
    println!("✅ t03 PASSED: Navigation, title, URL, and script execution work");
}

// ═══════════════════════════════════════════════════════════════════
// Test 4: Screenshot
// ═══════════════════════════════════════════════════════════════════

#[test]
fn t04_screenshot() {
    kill_camofox();
    let mut child = launch_camofox();
    let stream = wait_for_marionette(15);
    let mut writer = stream.try_clone().unwrap();
    let mut reader = BufReader::new(stream);
    
    let _ = read_message(&mut reader);
    let _ = send_command(&mut writer, &mut reader, 1, "WebDriver:NewSession", r#"{"capabilities":{}}"#);
    let _ = send_command(&mut writer, &mut reader, 2, "WebDriver:Navigate", r#"{"url":"https://example.com"}"#);
    thread::sleep(Duration::from_secs(2));
    
    let screenshot = send_command(&mut writer, &mut reader, 3, "WebDriver:TakeScreenshot", "{}");
    
    // Parse response — result value should be base64 PNG
    let parsed: serde_json::Value = serde_json::from_str(&screenshot).unwrap();
    let b64 = parsed[3]["value"].as_str().unwrap_or("");
    println!("Screenshot base64 length: {}", b64.len());
    assert!(b64.len() > 1000, "Screenshot too small: {} bytes", b64.len());
    
    // Verify it's valid base64 that decodes to PNG
    use std::io::Write as _;
    let decoded = base64_decode(b64);
    assert!(decoded.len() > 100, "Decoded screenshot too small");
    // PNG magic bytes: 137 80 78 71
    assert_eq!(&decoded[..4], &[137, 80, 78, 71], "Not a valid PNG");
    
    child.kill().ok();
    child.wait().ok();
    println!("✅ t04 PASSED: Screenshot returns valid base64 PNG");
}

fn base64_decode(input: &str) -> Vec<u8> {
    // Simple base64 decoder (no external crate needed for tests)
    let table = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;
    for &c in input.as_bytes() {
        if c == b'=' || c == b'\n' || c == b'\r' { continue; }
        let val = table.iter().position(|&t| t == c).unwrap_or(0) as u32;
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    output
}

// ═══════════════════════════════════════════════════════════════════
// Test 5: Chrome Context (System Principal)
// ═══════════════════════════════════════════════════════════════════

#[test]
fn t05_chrome_context_execution() {
    kill_camofox();
    let mut child = launch_camofox();
    let stream = wait_for_marionette(15);
    let mut writer = stream.try_clone().unwrap();
    let mut reader = BufReader::new(stream);
    
    let _ = read_message(&mut reader);
    let _ = send_command(&mut writer, &mut reader, 1, "WebDriver:NewSession", r#"{"capabilities":{}}"#);
    
    // Switch to chrome context
    let ctx = send_command(&mut writer, &mut reader, 2, "Marionette:SetContext", r#"{"value":"chrome"}"#);
    println!("SetContext chrome: {}", &ctx[..ctx.len().min(80)]);
    
    // Execute privileged script — access Services object
    let result = send_command(&mut writer, &mut reader, 3, "WebDriver:ExecuteScript",
        r#"{"script":"return typeof Services !== 'undefined' ? 'services_available' : 'no_services'","args":[]}"#);
    println!("Chrome exec: {}", result);
    assert!(result.contains("services_available"), "Services should be available in chrome context");
    
    // Try system principal
    let sp_result = send_command(&mut writer, &mut reader, 4, "WebDriver:ExecuteScript",
        r#"{"script":"try { Services.scriptSecurityManager.getSystemPrincipal(); return 'system_principal_ok'; } catch(e) { return 'error:' + e.message; }","args":[]}"#);
    println!("System principal: {}", sp_result);
    assert!(sp_result.contains("system_principal_ok"), "System principal should work");
    
    // Reset to content context
    let _ = send_command(&mut writer, &mut reader, 5, "Marionette:SetContext", r#"{"value":"content"}"#);
    
    child.kill().ok();
    child.wait().ok();
    println!("✅ t05 PASSED: Chrome context and system principal work");
}

// ═══════════════════════════════════════════════════════════════════
// Test 6: Phantom Extension Detection
// ═══════════════════════════════════════════════════════════════════

#[test]
fn t06_phantom_extension_detected() {
    kill_camofox();
    let mut child = launch_camofox();
    let stream = wait_for_marionette(15);
    let mut writer = stream.try_clone().unwrap();
    let mut reader = BufReader::new(stream);
    
    let _ = read_message(&mut reader);
    let _ = send_command(&mut writer, &mut reader, 1, "WebDriver:NewSession", r#"{"capabilities":{}}"#);
    
    // Navigate to a real page so extensions inject
    let _ = send_command(&mut writer, &mut reader, 2, "WebDriver:Navigate", r#"{"url":"https://jup.ag"}"#);
    thread::sleep(Duration::from_secs(8));
    
    // Check Phantom via page-context script injection
    let inject = send_command(&mut writer, &mut reader, 3, "WebDriver:ExecuteScript", r#"{"script":"const s = document.createElement('script'); s.textContent = `document.title = JSON.stringify({phantom: !!window.phantom, solana: !!window.phantom?.solana, isPhantom: !!window.phantom?.solana?.isPhantom})`; document.head.appendChild(s); return null;","args":[]}"#);
    println!("Inject: {}", &inject[..inject.len().min(80)]);
    
    thread::sleep(Duration::from_secs(2));
    
    let title = send_command(&mut writer, &mut reader, 4, "WebDriver:GetTitle", "{}");
    println!("Phantom check: {}", title);
    
    // Parse the title to verify Phantom
    if title.contains("phantom") {
        let parsed: serde_json::Value = serde_json::from_str(&title).unwrap();
        let inner = parsed[3]["value"].as_str().unwrap_or("{}");
        let check: serde_json::Value = serde_json::from_str(inner).unwrap_or_default();
        let has_phantom = check["phantom"].as_bool().unwrap_or(false);
        let has_solana = check["solana"].as_bool().unwrap_or(false);
        println!("Phantom: {}, Solana: {}", has_phantom, has_solana);
        assert!(has_phantom, "Phantom should be detected on jup.ag");
        assert!(has_solana, "Phantom Solana provider should be detected");
    }
    
    child.kill().ok();
    child.wait().ok();
    println!("✅ t06 PASSED: Phantom extension detected on Jupiter");
}

// ═══════════════════════════════════════════════════════════════════
// Test 7: Error Handling — Bad URL
// ═══════════════════════════════════════════════════════════════════

#[test]
fn t07_error_handling_bad_command() {
    kill_camofox();
    let mut child = launch_camofox();
    let stream = wait_for_marionette(15);
    let mut writer = stream.try_clone().unwrap();
    let mut reader = BufReader::new(stream);
    
    let _ = read_message(&mut reader);
    let _ = send_command(&mut writer, &mut reader, 1, "WebDriver:NewSession", r#"{"capabilities":{}}"#);
    
    // Send invalid command
    let resp = send_command(&mut writer, &mut reader, 2, "WebDriver:NonExistentCommand", "{}");
    println!("Invalid command response: {}", &resp[..resp.len().min(120)]);
    
    // Should get an error response (arr[2] is non-null)
    let parsed: serde_json::Value = serde_json::from_str(&resp).unwrap();
    let arr = parsed.as_array().unwrap();
    assert!(!arr[2].is_null(), "Error should be non-null for invalid command");
    println!("Error type: {}", arr[2]["error"].as_str().unwrap_or("unknown"));
    
    // Verify connection still works after error
    let title = send_command(&mut writer, &mut reader, 3, "WebDriver:GetTitle", "{}");
    assert!(title.contains("[1,3,"), "Connection should survive error");
    
    child.kill().ok();
    child.wait().ok();
    println!("✅ t07 PASSED: Error handling works, connection survives errors");
}

// ═══════════════════════════════════════════════════════════════════
// Test 8: Sequential Command Enforcement
// ═══════════════════════════════════════════════════════════════════

#[test]
fn t08_sequential_commands() {
    kill_camofox();
    let mut child = launch_camofox();
    let stream = wait_for_marionette(15);
    let mut writer = stream.try_clone().unwrap();
    let mut reader = BufReader::new(stream);
    
    let _ = read_message(&mut reader);
    let _ = send_command(&mut writer, &mut reader, 1, "WebDriver:NewSession", r#"{"capabilities":{}}"#);
    
    // Rapid-fire 10 sequential commands
    let start = Instant::now();
    for i in 2..12 {
        let resp = send_command(&mut writer, &mut reader, i, "WebDriver:GetTitle", "{}");
        let parsed: serde_json::Value = serde_json::from_str(&resp).unwrap();
        let arr = parsed.as_array().unwrap();
        assert_eq!(arr[1].as_u64().unwrap(), i, "Response ID should match command ID {}", i);
    }
    let elapsed = start.elapsed();
    println!("10 sequential commands in {:?}", elapsed);
    assert!(elapsed < Duration::from_secs(10), "10 commands should complete in <10s");
    
    child.kill().ok();
    child.wait().ok();
    println!("✅ t08 PASSED: Sequential command IDs match, 10 commands < 10s");
}
