#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ResonantOS Browser-First — One-Line Installer
# Usage: curl -fsSL https://resonantos.com/install.sh | bash
#        — or —
#        bash ~/resonantos-vnext/browser-first/install.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors & symbols ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}✅ ${1}${RESET}"; }
info() { echo -e "${CYAN}ℹ️  ${1}${RESET}"; }
warn() { echo -e "${YELLOW}⚠️  ${1}${RESET}"; }
err()  { echo -e "${RED}❌ ${1}${RESET}" >&2; }
step() { echo -e "\n${BOLD}${BLUE}▶ ${1}${RESET}"; }

REPO_URL="https://github.com/tompennington/resonantos-vnext-Experimental.git"
BRANCH="tom/browser-first-merged"
REPO_DIR="$HOME/resonantos-vnext"
USER_DIR="$HOME/ResonantOS_User"
BRIDGE_PORT=47773

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║       ResonantOS Browser-First Installer      ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${RESET}"
echo ""

# ── Step 1: Detect OS ─────────────────────────────────────────────────────────
step "Detecting operating system"

OS_TYPE=""
case "$(uname -s)" in
  Darwin*)
    OS_TYPE="macos"
    ARCH="$(uname -m)"
    ok "macOS detected ($ARCH)"
    ;;
  Linux*)
    OS_TYPE="linux"
    # Detect distro
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      DISTRO_ID="${ID:-unknown}"
      DISTRO_ID_LIKE="${ID_LIKE:-}"
    else
      DISTRO_ID="unknown"
      DISTRO_ID_LIKE=""
    fi
    ok "Linux detected (${DISTRO_ID})"
    ;;
  MINGW*|MSYS*|CYGWIN*|Windows*)
    err "Windows is not yet supported by this installer."
    echo ""
    echo "  Options:"
    echo "  • WSL (Windows Subsystem for Linux) — run this installer inside Ubuntu/WSL"
    echo "  • Wait for the .exe installer (coming soon)"
    echo ""
    exit 1
    ;;
  *)
    err "Unknown OS: $(uname -s). Only macOS and Linux are supported."
    exit 1
    ;;
esac

# ── Step 2: Check / Install Node.js ──────────────────────────────────────────
step "Checking Node.js (>= 22 required)"

NODE_OK=false
NODE_BIN=""

# Find node in PATH or known locations
for candidate in node /opt/homebrew/bin/node /usr/local/bin/node ~/.local/bin/node; do
  if command -v "$candidate" &>/dev/null 2>&1; then
    NODE_VER=$("$candidate" --version 2>/dev/null | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 22 ] 2>/dev/null; then
      NODE_OK=true
      NODE_BIN=$(command -v "$candidate")
      ok "Node.js v${NODE_VER} found at ${NODE_BIN}"
      break
    else
      warn "Node.js v${NODE_VER} is too old (need ≥ 22)"
    fi
  fi
done

if [ "$NODE_OK" = false ]; then
  info "Installing Node.js..."

  if [ "$OS_TYPE" = "macos" ]; then
    if command -v brew &>/dev/null; then
      info "Installing via Homebrew..."
      brew install node
    else
      info "Homebrew not found. Downloading Node.js 20 LTS from nodejs.org..."
      if [ "$ARCH" = "arm64" ]; then
        NODE_PKG="node-v20.18.0-darwin-arm64.tar.gz"
      else
        NODE_PKG="node-v20.18.0-darwin-x64.tar.gz"
      fi
      NODE_URL="https://nodejs.org/dist/v20.18.0/${NODE_PKG}"
      TMPDIR_NODE=$(mktemp -d)
      curl -fsSL "$NODE_URL" -o "$TMPDIR_NODE/$NODE_PKG"
      tar -xzf "$TMPDIR_NODE/$NODE_PKG" -C "$TMPDIR_NODE"
      mkdir -p "$HOME/.local/bin"
      cp "$TMPDIR_NODE/${NODE_PKG%.tar.gz}/bin/node" "$HOME/.local/bin/node"
      rm -rf "$TMPDIR_NODE"
      export PATH="$HOME/.local/bin:$PATH"
    fi

  elif [ "$OS_TYPE" = "linux" ]; then
    is_debian_like() {
      [ "$DISTRO_ID" = "ubuntu" ] || [ "$DISTRO_ID" = "debian" ] || \
        echo "$DISTRO_ID_LIKE" | grep -qE '(debian|ubuntu)'
    }
    is_rhel_like() {
      [ "$DISTRO_ID" = "fedora" ] || [ "$DISTRO_ID" = "rhel" ] || \
        [ "$DISTRO_ID" = "centos" ] || [ "$DISTRO_ID" = "rocky" ] || \
        echo "$DISTRO_ID_LIKE" | grep -qE '(fedora|rhel)'
    }

    if is_debian_like; then
      info "Installing Node.js 22 via NodeSource (Ubuntu/Debian)..."
      echo "This requires sudo. You may be prompted for your password."
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif is_rhel_like; then
      info "Installing Node.js 22 via NodeSource (Fedora/RHEL)..."
      echo "This requires sudo. You may be prompted for your password."
      curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
      sudo dnf install -y nodejs || sudo yum install -y nodejs
    else
      warn "Unknown Linux distro. Attempting NodeSource generic install..."
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - || true
      sudo apt-get install -y nodejs 2>/dev/null || \
        { err "Could not auto-install Node.js. Please install Node.js 22+ manually from https://nodejs.org"; exit 1; }
    fi
  fi

  # Re-locate node after install
  if command -v node &>/dev/null; then
    NODE_BIN=$(command -v node)
    NODE_VER=$(node --version | sed 's/v//')
    ok "Node.js v${NODE_VER} installed at ${NODE_BIN}"
  else
    err "Node.js installation failed. Please install Node.js 22+ manually from https://nodejs.org"
    exit 1
  fi
fi

# ── Step 3: Clone / Update Repo ───────────────────────────────────────────────
step "Setting up ResonantOS repository"

if [ ! -d "$REPO_DIR/.git" ]; then
  info "Cloning ${REPO_URL} (branch: ${BRANCH})..."
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$REPO_DIR"
  ok "Repository cloned to ${REPO_DIR}"
else
  info "Repository already exists — pulling latest changes..."
  git -C "$REPO_DIR" fetch origin "$BRANCH" 2>/dev/null || warn "Could not fetch — continuing with local version"
  git -C "$REPO_DIR" checkout "$BRANCH" 2>/dev/null || true
  git -C "$REPO_DIR" pull --ff-only 2>/dev/null || warn "Pull failed — continuing with local version"
  ok "Repository up to date"
fi

# ── Step 4: Create directory structure ────────────────────────────────────────
step "Creating ResonantOS user directories"

dirs=(
  "$USER_DIR/Secrets"
  "$USER_DIR/Memory/AI_MEMORY/wiki"
  "$USER_DIR/Memory/INTAKE/browser"
  "$USER_DIR/Memory/REVIEW/requests"
  "$USER_DIR/Memory/REVIEW/artifacts"
  "$USER_DIR/BrowserFirst/Profiles"
  "$USER_DIR/BrowserFirst/Goals"
  "$USER_DIR/BrowserFirst/Delegations"
  "$USER_DIR/Logs"
)

for dir in "${dirs[@]}"; do
  mkdir -p "$dir"
done

# Create provider-secrets template if missing
SECRETS_FILE="$USER_DIR/Secrets/provider-secrets.json"
if [ ! -f "$SECRETS_FILE" ]; then
  cat > "$SECRETS_FILE" << 'EOF'
{
  "_comment": "Add your API keys here. This file is local and never synced.",
  "openai": "",
  "anthropic": "",
  "google": "",
  "groq": "",
  "openrouter": ""
}
EOF
  ok "Created Secrets/provider-secrets.json (template)"
else
  ok "Secrets/provider-secrets.json already exists"
fi

ok "Directory structure ready at ${USER_DIR}"

# ── Step 5: Install bridge daemon ─────────────────────────────────────────────
step "Installing ResonantOS bridge daemon"

BRIDGE_DIR="$REPO_DIR/browser-first/host"

# Detect whether the native host binary exists — if not, run in bridge-only mode
HOST_BINARY="$REPO_DIR/addons/resonant-browser-native/build/ResonantBrowserNativeHost.app/Contents/MacOS/ResonantBrowserNativeHost"
if [ ! -f "$HOST_BINARY" ]; then
  BRIDGE_ARGS="run-browser-first.mjs --bridge-only"
  info "Native host not found — bridge will run in standalone mode (--bridge-only)"
else
  BRIDGE_ARGS="run-browser-first.mjs"
  info "Native host found — bridge will run in full mode"
fi

if [ "$OS_TYPE" = "macos" ]; then
  LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
  PLIST_DEST="$LAUNCH_AGENTS_DIR/com.resonantos.bridge.plist"
  mkdir -p "$LAUNCH_AGENTS_DIR"

  # Generate plist with real paths resolved at install time
  cat > "$PLIST_DEST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.resonantos.bridge</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
$(for arg in $BRIDGE_ARGS; do echo "    <string>${arg}</string>"; done)
  </array>

  <key>WorkingDirectory</key>
  <string>${BRIDGE_DIR}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${USER_DIR}/Logs/bridge-stdout.log</string>

  <key>StandardErrorPath</key>
  <string>${USER_DIR}/Logs/bridge-stderr.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$(dirname "$NODE_BIN")</string>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>RESONANTOS_ALPHA_KEY</key>
    <string>YOUR_GROQ_API_KEY</string>
  </dict>

  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
EOF

  # Unload if already loaded (idempotent)
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  launchctl load "$PLIST_DEST"
  ok "Bridge daemon loaded via launchctl"

elif [ "$OS_TYPE" = "linux" ]; then
  SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SYSTEMD_USER_DIR"

  cat > "$SYSTEMD_USER_DIR/resonantos-bridge.service" << EOF
[Unit]
Description=ResonantOS Bridge Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${BRIDGE_DIR}
ExecStart=${NODE_BIN} ${BRIDGE_ARGS}
Restart=always
RestartSec=5
Environment=HOME=${HOME}
Environment=PATH=/usr/local/bin:/usr/bin:/bin:$(dirname "$NODE_BIN")
Environment=RESONANTOS_ALPHA_KEY=YOUR_GROQ_API_KEY
StandardOutput=append:${USER_DIR}/Logs/bridge-stdout.log
StandardError=append:${USER_DIR}/Logs/bridge-stderr.log

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable --now resonantos-bridge.service
  ok "Bridge service enabled via systemd --user"
fi

# Wait for bridge to come up (up to 15s)
info "Waiting for bridge on port ${BRIDGE_PORT}..."
BRIDGE_READY=false
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${BRIDGE_PORT}/health" &>/dev/null 2>&1 || \
     curl -sf "http://localhost:${BRIDGE_PORT}/" &>/dev/null 2>&1; then
    BRIDGE_READY=true
    break
  fi
  # Also check if port is open even if no /health endpoint
  if (echo > /dev/tcp/localhost/${BRIDGE_PORT}) &>/dev/null 2>&1; then
    BRIDGE_READY=true
    break
  fi
  sleep 1
  echo -n "."
done
echo ""

if [ "$BRIDGE_READY" = true ]; then
  ok "Bridge server is running on port ${BRIDGE_PORT}"
else
  warn "Bridge did not respond within 15s — it may still be starting up"
  info "Check logs at: ${USER_DIR}/Logs/bridge-stderr.log"
fi

# ── Step 6: Detect browser ────────────────────────────────────────────────────
step "Detecting browser"

BROWSER_FOUND=""
BROWSER_NAME=""

if [ "$OS_TYPE" = "macos" ]; then
  # Prefer Brave
  if [ -d "/Applications/Brave Browser.app" ]; then
    BROWSER_FOUND="/Applications/Brave Browser.app"
    BROWSER_NAME="Brave Browser"
  elif [ -d "/Applications/Google Chrome.app" ]; then
    BROWSER_FOUND="/Applications/Google Chrome.app"
    BROWSER_NAME="Google Chrome"
  elif [ -d "$HOME/Applications/Brave Browser.app" ]; then
    BROWSER_FOUND="$HOME/Applications/Brave Browser.app"
    BROWSER_NAME="Brave Browser"
  elif [ -d "$HOME/Applications/Google Chrome.app" ]; then
    BROWSER_FOUND="$HOME/Applications/Google Chrome.app"
    BROWSER_NAME="Google Chrome"
  fi
elif [ "$OS_TYPE" = "linux" ]; then
  if command -v brave-browser &>/dev/null; then
    BROWSER_FOUND=$(command -v brave-browser)
    BROWSER_NAME="Brave Browser"
  elif command -v brave &>/dev/null; then
    BROWSER_FOUND=$(command -v brave)
    BROWSER_NAME="Brave Browser"
  elif command -v google-chrome &>/dev/null; then
    BROWSER_FOUND=$(command -v google-chrome)
    BROWSER_NAME="Google Chrome"
  elif command -v google-chrome-stable &>/dev/null; then
    BROWSER_FOUND=$(command -v google-chrome-stable)
    BROWSER_NAME="Google Chrome"
  elif command -v chromium-browser &>/dev/null; then
    BROWSER_FOUND=$(command -v chromium-browser)
    BROWSER_NAME="Chromium"
  elif command -v chromium &>/dev/null; then
    BROWSER_FOUND=$(command -v chromium)
    BROWSER_NAME="Chromium"
  fi
fi

if [ -n "$BROWSER_FOUND" ]; then
  ok "Found: ${BROWSER_NAME} at ${BROWSER_FOUND}"
else
  warn "No supported browser found (Brave or Chrome). Install one before loading the extension."
fi

# ── Step 7: Final instructions ────────────────────────────────────────────────
EXTENSION_DIR="$REPO_DIR/browser-first/resonantos-side-panel-extension"
LAUNCHER="$REPO_DIR/browser-first/host/run-browser-first.mjs"

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║          ✅ ResonantOS installed successfully!            ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""

if [ "$BRIDGE_READY" = true ]; then
  echo -e "  ${GREEN}Bridge server:${RESET} running on port ${BRIDGE_PORT}"
else
  echo -e "  ${YELLOW}Bridge server:${RESET} starting (may take a few more seconds)"
fi

echo -e "  ${CYAN}Extension path:${RESET}"
echo -e "    ${EXTENSION_DIR}"
echo ""
echo -e "${BOLD}  Next steps:${RESET}"
echo "    1. Open ${BROWSER_NAME:-Chrome or Brave}"
echo "    2. Go to chrome://extensions"
echo "    3. Enable Developer Mode (toggle, top-right)"
echo "    4. Click \"Load unpacked\""
echo "    5. Select the extension folder above"
echo "    6. Press Alt+Shift+A to open ResonantOS"
echo ""
echo -e "  ${BOLD}Or launch with everything pre-loaded:${RESET}"
echo "    node ${LAUNCHER}"
echo ""
# -- Step 8: Launch browser with extension loaded --------------------------------
step "Launching ResonantOS"

launch_browser() {
  local browser_bin="$1"
  local browser_name="$2"
  local ext_path="$EXTENSION_DIR"
  local profile_dir="$USER_DIR/BrowserFirst/Profiles/main"
  mkdir -p "$profile_dir"

  local launch_args=(
    "--load-extension=${ext_path}"
    "--user-data-dir=${profile_dir}"
    "--no-first-run"
    "--disable-default-apps"
  )

  if [ "$OS_TYPE" = "macos" ]; then
    open -a "$browser_bin" --args "${launch_args[@]}" &
  else
    "$browser_bin" "${launch_args[@]}" &
  fi
  disown 2>/dev/null
  ok "${browser_name} launched with ResonantOS extension loaded!"
  info "Press Alt+Shift+A to open the side panel if it doesn't open automatically."
}

if [ -n "$BROWSER_FOUND" ]; then
  if [ -t 0 ]; then
    echo -e "${BOLD}Launch ${BROWSER_NAME} with ResonantOS now?${RESET} [Y/n] "
    read -r LAUNCH_ANSWER </dev/tty
    LAUNCH_ANSWER="${LAUNCH_ANSWER:-Y}"
    if [[ "$LAUNCH_ANSWER" =~ ^[Yy]$ ]]; then
      launch_browser "$BROWSER_FOUND" "$BROWSER_NAME"
    else
      info "Skipping launch. Open ${BROWSER_NAME} -> chrome://extensions -> Load unpacked -> ${EXTENSION_DIR}"
    fi
  else
    # Non-interactive (piped from curl) -- launch automatically
    launch_browser "$BROWSER_FOUND" "$BROWSER_NAME"
  fi
else
  warn "No browser found. Install Chrome or Brave, then load the extension manually."
  info "  chrome://extensions -> Developer mode -> Load unpacked -> ${EXTENSION_DIR}"
fi

echo ""
echo -e "${BOLD}${CYAN}ResonantOS is ready. Welcome aboard.${RESET}"
echo ""
