#!/bin/bash
# Resonator Autonomy Validation Test
set -e

echo "=== RESONATOR AUTONOMY TEST ==="
echo "Testing: Screen capture, clipboard, app launch, window list"

cd ~/resonantos-vnext/crates/resonator-control

# Test 1: Screen capture
echo -n "Test 1: Screen capture... "
cargo test --quiet screen_capture_returns_png_bytes 2>/dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 2: Clipboard control
echo -n "Test 2: Clipboard write/read... "
cargo test --quiet clipboard_round_trip 2>/dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 3: App list (can see running apps)
echo -n "Test 3: App enumeration... "
cargo test --quiet app_list_returns_entries 2>/dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 4: Window list (can see windows)
echo -n "Test 4: Window enumeration... "
cargo test --quiet window_list_returns_entries 2>/dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 5: Capability manifest
echo -n "Test 5: Capability manifest... "
cargo test --quiet manifest_has_required_keys 2>/dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 6: Full Tauri build with resonator commands
echo -n "Test 6: Tauri build with resonator service... "
cd ~/resonantos-vnext/src-tauri && cargo build 2>/dev/null && echo "✅ PASS" || echo "❌ FAIL"

echo ""
echo "=== AUTONOMY VALIDATION COMPLETE ==="
