#!/usr/bin/env bash
# install-native-host.sh
# Installs the ResonantOS Native Messaging host for Chrome and Brave on
# macOS and Linux.
#
# What this script does:
#   1. Resolves the absolute path to the resonantos-bridge-host wrapper.
#   2. Copies com.resonantos.bridge.json to the correct NativeMessagingHosts
#      directory for each browser / OS combination found on this machine.
#   3. Patches the "path" field in the installed manifest to point at the
#      resolved host wrapper path.
#   4. Makes the host wrapper executable.
#
# Supported browsers: Google Chrome, Brave Browser
# Supported platforms: macOS, Linux
#
# Usage:
#   bash install-native-host.sh
#
# Re-run after moving the resonantos-vnext directory; the manifest path
# needs to reflect the new location.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_WRAPPER="${SCRIPT_DIR}/resonantos-bridge-host"
MANIFEST_TEMPLATE="${SCRIPT_DIR}/com.resonantos.bridge.json"
MANIFEST_NAME="com.resonantos.bridge.json"
HOST_NAME="com.resonantos.bridge"

# ---------------------------------------------------------------------------
# Colour output helpers
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Colour

ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
err()  { echo -e "${RED}  ✗${NC} $*"; }

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
echo ""
echo "ResonantOS Native Messaging Host Installer"
echo "==========================================="
echo ""

if [ ! -f "${HOST_WRAPPER}" ]; then
  err "Host wrapper not found: ${HOST_WRAPPER}"
  echo "  Make sure you are running this script from the native-messaging/ directory"
  echo "  or that the resonantos-bridge-host file is present alongside this script."
  exit 1
fi

if [ ! -f "${MANIFEST_TEMPLATE}" ]; then
  err "Manifest template not found: ${MANIFEST_TEMPLATE}"
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  err "python3 is required to patch the manifest but was not found."
  exit 1
fi

# Make the host wrapper executable
chmod +x "${HOST_WRAPPER}"
ok "Host wrapper marked executable: ${HOST_WRAPPER}"

# ---------------------------------------------------------------------------
# Detect OS
# ---------------------------------------------------------------------------
OS="$(uname -s)"
case "${OS}" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *)
    err "Unsupported OS: ${OS}. Only macOS and Linux are supported."
    exit 1
    ;;
esac
echo "  Platform detected: ${PLATFORM}"
echo ""

# ---------------------------------------------------------------------------
# Define NativeMessagingHosts directories for each browser
# ---------------------------------------------------------------------------
declare -a NM_DIRS=()

if [ "${PLATFORM}" = "macos" ]; then
  CHROME_NM_DIR="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  BRAVE_NM_DIR="${HOME}/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  CHROMIUM_NM_DIR="${HOME}/Library/Application Support/Chromium/NativeMessagingHosts"
else
  # Linux
  CHROME_NM_DIR="${HOME}/.config/google-chrome/NativeMessagingHosts"
  BRAVE_NM_DIR="${HOME}/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  CHROMIUM_NM_DIR="${HOME}/.config/chromium/NativeMessagingHosts"
fi

# We always install to Chrome and Brave directories; Chromium is a bonus
NM_DIRS=("${CHROME_NM_DIR}" "${BRAVE_NM_DIR}" "${CHROMIUM_NM_DIR}")

# ---------------------------------------------------------------------------
# Generate a patched manifest with the correct absolute host wrapper path
# ---------------------------------------------------------------------------
patch_manifest() {
  local dest_dir="$1"
  local dest_file="${dest_dir}/${MANIFEST_NAME}"
  local host_path="${HOST_WRAPPER}"

  mkdir -p "${dest_dir}"

  # Use python3 to write a properly-formatted JSON manifest with the correct path
  python3 - <<PYEOF
import json, sys

template = "${MANIFEST_TEMPLATE}"
dest = "${dest_file}"
host_path = "${host_path}"

with open(template) as f:
    manifest = json.load(f)

manifest["path"] = host_path

with open(dest, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\\n")

print(f"  Written: {dest}")
PYEOF
}

# ---------------------------------------------------------------------------
# Install into each directory
# ---------------------------------------------------------------------------
INSTALLED=0
SKIPPED=0

for NM_DIR in "${NM_DIRS[@]}"; do
  # Determine which browser this directory belongs to
  case "${NM_DIR}" in
    *"Brave"*) BROWSER="Brave Browser" ;;
    *"Chromium"*|*"chromium"*) BROWSER="Chromium" ;;
    *) BROWSER="Google Chrome" ;;
  esac

  # Check if the parent browser config directory exists (skip if browser not installed)
  BROWSER_BASE="$(dirname "${NM_DIR}")"
  if [ ! -d "${BROWSER_BASE}" ] && [ "${BROWSER}" != "Google Chrome" ]; then
    warn "${BROWSER} config directory not found (${BROWSER_BASE}) — skipping."
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "  Installing for ${BROWSER}..."
  if patch_manifest "${NM_DIR}"; then
    ok "Manifest installed: ${NM_DIR}/${MANIFEST_NAME}"
    INSTALLED=$((INSTALLED + 1))
  else
    err "Failed to install manifest for ${BROWSER}."
  fi
done

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [ "${INSTALLED}" -eq 0 ]; then
  err "No manifests installed. No supported browsers detected."
  echo ""
  echo "  Manually install by copying ${MANIFEST_TEMPLATE} to the"
  echo "  NativeMessagingHosts directory for your browser and updating"
  echo "  the \"path\" field to: ${HOST_WRAPPER}"
  exit 1
fi

ok "${INSTALLED} browser(s) configured. ${SKIPPED} skipped (not installed)."
echo ""
echo "  Host name:    ${HOST_NAME}"
echo "  Host wrapper: ${HOST_WRAPPER}"
echo ""
echo "  To verify the installation, load the unpacked extension in Chrome/Brave,"
echo "  open a page, and check that the side panel shows 'Bridge connected'."
echo ""
echo "  If the bridge daemon is not yet running, start it with:"
echo "    node $(realpath "${SCRIPT_DIR}/../host/bridge-daemon.mjs" 2>/dev/null || echo '../host/bridge-daemon.mjs')"
echo ""
