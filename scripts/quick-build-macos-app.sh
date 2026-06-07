#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_QEMU_BUILD_DIR="/Volumes/sks/src/qemu-11.0.1/build-sanaka"
QEMU_BUILD_DIR="${1:-$DEFAULT_QEMU_BUILD_DIR}"
OUTPUT_ROOT="$REPO_ROOT/release"
DMG_BACKGROUND="$REPO_ROOT/build/dmg.png"
CREATE_DMG_BIN="${CREATE_DMG_BIN:-/opt/homebrew/opt/create-dmg/bin/create-dmg}"

if [[ ! -d "$QEMU_BUILD_DIR" ]]; then
  echo "QEMU build directory not found:" >&2
  echo "  $QEMU_BUILD_DIR" >&2
  echo >&2
  echo "Usage:" >&2
  echo "  sh scripts/quick-build-macos-app.sh [qemu-build-dir]" >&2
  exit 1
fi

echo "Using QEMU build directory:"
echo "  $QEMU_BUILD_DIR"
echo

cd "$REPO_ROOT"
bash "$REPO_ROOT/scripts/package-sanaka-macos.sh" "$QEMU_BUILD_DIR"

APP_PATH="$(find "$OUTPUT_ROOT" -type d -name 'Sanaka.app' | head -n 1)"

if [[ "$APP_PATH" == "" ]]; then
  echo "Unable to locate packaged Sanaka.app under $OUTPUT_ROOT" >&2
  exit 1
fi

if [[ ! -f "$DMG_BACKGROUND" ]]; then
  echo "DMG background not found: $DMG_BACKGROUND" >&2
  exit 1
fi

FINAL_DMG_PATH="$OUTPUT_ROOT/Sanaka.dmg"

if [[ ! -x "$CREATE_DMG_BIN" ]]; then
  echo "create-dmg not found:" >&2
  echo "  $CREATE_DMG_BIN" >&2
  echo >&2
  echo "Install it with:" >&2
  echo "  brew install create-dmg" >&2
  exit 1
fi

rm -f "$FINAL_DMG_PATH"
"$CREATE_DMG_BIN" \
  --volname "Sanaka" \
  --window-pos 100 100 \
  --window-size 540 380 \
  --icon-size 100 \
  --icon "Sanaka.app" 130 190 \
  --app-drop-link 410 190 \
  --background "$DMG_BACKGROUND" \
  "$FINAL_DMG_PATH" \
  "$(dirname "$APP_PATH")"

echo
echo "Packaged app:"
echo "$APP_PATH"
echo
echo "Packaged dmg:"
echo "$FINAL_DMG_PATH"
