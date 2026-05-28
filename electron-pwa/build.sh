#!/usr/bin/env bash
# ResonantOS Electron PWA — build/package script
# Usage: bash electron-pwa/build.sh [--platform mac|win|linux]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$SCRIPT_DIR"

# ── Ensure deps are installed ─────────────────────────────────────────────────
if [[ ! -d node_modules/electron ]]; then
  echo "[build] Installing electron-pwa dependencies…"
  npm install --prefer-offline
fi

# ── Determine target platform ─────────────────────────────────────────────────
PLATFORM="${1:---platform}"
if [[ "$PLATFORM" == "--platform" ]]; then
  # Detect host platform
  case "$(uname -s)" in
    Darwin) PLATFORM="mac" ;;
    Linux)  PLATFORM="linux" ;;
    *)      PLATFORM="win" ;;
  esac
fi

echo "[build] Building for platform: $PLATFORM"

# ── Generate electron-builder config ─────────────────────────────────────────
cat > "$SCRIPT_DIR/electron-builder.json" <<EOF
{
  "appId": "com.resonantos.electron-pwa",
  "productName": "ResonantOS",
  "directories": {
    "output": "$REPO_ROOT/dist/electron-pwa"
  },
  "files": [
    "main.mjs",
    "preload.mjs",
    "start.mjs",
    "package.json",
    "node_modules/**"
  ],
  "extraResources": [
    {
      "from": "$REPO_ROOT/browser-first",
      "to": "browser-first",
      "filter": ["**/*", "!**/node_modules"]
    }
  ],
  "mac": {
    "target": "dmg",
    "icon": "$REPO_ROOT/electron-pwa/icon.icns",
    "category": "public.app-category.productivity"
  },
  "linux": {
    "target": "AppImage",
    "icon": "$REPO_ROOT/electron-pwa/icon.icns"
  },
  "win": {
    "target": "nsis",
    "icon": "$REPO_ROOT/electron-pwa/icon.icns"
  }
}
EOF

# ── Run electron-builder ──────────────────────────────────────────────────────
npx electron-builder --config electron-builder.json "--$PLATFORM"

echo "[build] Done. Output: $REPO_ROOT/dist/electron-pwa/"
