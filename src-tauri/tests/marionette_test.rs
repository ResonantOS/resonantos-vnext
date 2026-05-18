//! Integration test: CamoFox Marionette bridge

use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

// We can't easily import from the lib without the full Tauri setup.
// Instead, test the Marionette protocol directly with raw TCP.
use std::io::{BufReader, Read, Write};
use std::net::TcpStream;

fn read_marionette_message(reader: &mut BufReader<TcpStream>) -> String {
    let mut len_buf = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        reader.read_exact(&mut byte).unwrap();
        if byte[0] == b':' { break; }
        len_buf.push(byte[0]);
    }
    let length: usize = String::from_utf8(len_buf).unwrap().parse().unwrap();
    let mut payload = vec![0u8; length];
    reader.read_exact(&mut payload).unwrap();
    String::from_utf8(payload).unwrap()
}

fn send_marionette_command(stream: &mut TcpStream, id: u64, command: &str, params: &str) -> String {
    let cmd = format!(r#"[0,{},"{}",{}]"#, id, command, params);
    let framed = format!("{}:{}", cmd.len(), cmd);
    stream.write_all(framed.as_bytes()).unwrap();
    stream.flush().unwrap();
    // Read response using a temp reader
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    read_marionette_message(&mut reader)
}

#[test]
fn test_marionette_raw_protocol() {
    // Kill any existing camoufox
    let _ = Command::new("pkill").args(["-f", "camoufox"]).status();
    thread::sleep(Duration::from_secs(2));
    
    let home = std::env::var("HOME").unwrap();
    let binary = format!("{}/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox", home);
    let profile = format!("{}/.camofox/profiles/resonantos", home);
    
    println!("Launching CamoFox...");
    let mut child = Command::new(&binary)
        .args(["-profile", &profile, "-marionette", "-no-remote", "--headless"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("Launch failed");
    
    println!("Waiting 8s for Marionette...");
    thread::sleep(Duration::from_secs(8));
    
    // Connect
    println!("Connecting...");
    let stream = TcpStream::connect("127.0.0.1:2828").expect("TCP connect failed");
    stream.set_read_timeout(Some(Duration::from_secs(30))).unwrap();
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut writer = stream;
    
    // Read greeting
    let greeting = read_marionette_message(&mut reader);
    println!("✅ Greeting: {}", &greeting[..greeting.len().min(100)]);
    assert!(greeting.contains("applicationType"), "Bad greeting: {}", greeting);
    
    // New session: [0, 1, "WebDriver:NewSession", {"capabilities":{}}]
    let cmd = r#"[0,1,"WebDriver:NewSession",{"capabilities":{}}]"#;
    let framed = format!("{}:{}", cmd.len(), cmd);
    writer.write_all(framed.as_bytes()).unwrap();
    writer.flush().unwrap();
    let resp = read_marionette_message(&mut reader);
    println!("✅ NewSession: {}...", &resp[..resp.len().min(100)]);
    assert!(resp.contains("sessionId"), "No sessionId: {}", resp);
    
    // Navigate: [0, 2, "WebDriver:Navigate", {"url":"https://example.com"}]
    let cmd = r#"[0,2,"WebDriver:Navigate",{"url":"https://example.com"}]"#;
    let framed = format!("{}:{}", cmd.len(), cmd);
    writer.write_all(framed.as_bytes()).unwrap();
    writer.flush().unwrap();
    let resp = read_marionette_message(&mut reader);
    println!("✅ Navigate: {}", &resp[..resp.len().min(80)]);
    
    thread::sleep(Duration::from_secs(3));
    
    // GetTitle: [0, 3, "WebDriver:GetTitle", {}]
    let cmd = r#"[0,3,"WebDriver:GetTitle",{}]"#;
    let framed = format!("{}:{}", cmd.len(), cmd);
    writer.write_all(framed.as_bytes()).unwrap();
    writer.flush().unwrap();
    let resp = read_marionette_message(&mut reader);
    println!("✅ Title: {}", resp);
    assert!(resp.contains("Example Domain"), "Expected Example Domain in: {}", resp);
    
    // Screenshot: [0, 4, "WebDriver:TakeScreenshot", {}]
    let cmd = r#"[0,4,"WebDriver:TakeScreenshot",{}]"#;
    let framed = format!("{}:{}", cmd.len(), cmd);
    writer.write_all(framed.as_bytes()).unwrap();
    writer.flush().unwrap();
    let resp = read_marionette_message(&mut reader);
    println!("✅ Screenshot: {} bytes", resp.len());
    assert!(resp.len() > 1000, "Screenshot response too small");
    
    // Cleanup
    child.kill().ok();
    child.wait().ok();
    
    println!("\n🎉 ALL MARIONETTE PROTOCOL TESTS PASSED");
}
