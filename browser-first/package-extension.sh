#!/usr/bin/env bash
# package-extension.sh — Build a production zip of the ResonantOS Browser Layer extension
# Output: resonantos-browser-layer-v{version}.zip (ready for Chrome Web Store upload)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTENSION_SRC="${SCRIPT_DIR}/resonantos-side-panel-extension"
DIST_DIR="${SCRIPT_DIR}/dist/extension"

# ---------------------------------------------------------------------------
# Read version from manifest.json
# ---------------------------------------------------------------------------
MANIFEST="${EXTENSION_SRC}/manifest.json"
if [ ! -f "${MANIFEST}" ]; then
  echo "ERROR: manifest.json not found at ${MANIFEST}" >&2
  exit 1
fi

VERSION="$(python3 -c "import json,sys; d=json.load(open('${MANIFEST}')); print(d['version'])")"
if [ -z "${VERSION}" ]; then
  echo "ERROR: Could not read version from manifest.json" >&2
  exit 1
fi

ZIP_NAME="resonantos-browser-layer-v${VERSION}.zip"
ZIP_PATH="${SCRIPT_DIR}/dist/${ZIP_NAME}"

echo "==> ResonantOS Browser Layer — packaging v${VERSION}"

# ---------------------------------------------------------------------------
# Clean and recreate dist/extension
# ---------------------------------------------------------------------------
echo "--> Cleaning dist/extension..."
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# ---------------------------------------------------------------------------
# Copy extension files (exclude dev/source-map artifacts)
# ---------------------------------------------------------------------------
echo "--> Copying extension files..."

rsync -a \
  --exclude='.DS_Store' \
  --exclude='*.map' \
  --exclude='*.test.*' \
  --exclude='__tests__' \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='*.md' \
  --exclude='*.sh' \
  "${EXTENSION_SRC}/" "${DIST_DIR}/"

# ---------------------------------------------------------------------------
# Verify critical files are present
# ---------------------------------------------------------------------------
for REQUIRED in manifest.json src/background.js src/content.js src/side-panel.html src/side-panel.js src/side-panel.css; do
  if [ ! -f "${DIST_DIR}/${REQUIRED}" ]; then
    echo "ERROR: Required file missing in dist: ${REQUIRED}" >&2
    exit 1
  fi
done

echo "--> Verified required files present."

# ---------------------------------------------------------------------------
# Create zip
# ---------------------------------------------------------------------------
echo "--> Creating ${ZIP_NAME}..."
rm -f "${ZIP_PATH}"
(cd "${DIST_DIR}" && zip -r "${ZIP_PATH}" . -x '*.DS_Store')

# ---------------------------------------------------------------------------
# Verify zip
# ---------------------------------------------------------------------------
MANIFEST_CHECK="$(unzip -l "${ZIP_PATH}" | grep manifest.json || true)"
if [ -z "${MANIFEST_CHECK}" ]; then
  echo "ERROR: manifest.json not found in zip output." >&2
  exit 1
fi

ZIP_SIZE="$(du -sh "${ZIP_PATH}" | cut -f1)"
echo ""
echo "==> Build complete ✓"
echo "    Version:  ${VERSION}"
echo "    File:     ${ZIP_PATH}"
echo "    Size:     ${ZIP_SIZE}"
echo ""
echo "    Contents:"
unzip -l "${ZIP_PATH}" | awk 'NR>3 && /^ / {print "      "$NF}'
echo ""
echo "Ready for Chrome Web Store upload."
