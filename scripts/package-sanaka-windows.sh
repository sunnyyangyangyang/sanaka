#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "" ]]; then
  echo "Usage: $0 <qemu-install-dir>" >&2
  exit 1
fi

QEMU_DIR="$1"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_ROOT="$REPO_ROOT/release"

cd "$REPO_ROOT"

npm run build
npx electron-builder --dir --win

APP_DIR="$(find "$OUTPUT_ROOT" -maxdepth 2 -type d -name 'win-unpacked' | head -n 1)"

if [[ "$APP_DIR" == "" ]]; then
  echo "Unable to locate win-unpacked under $OUTPUT_ROOT" >&2
  exit 1
fi

bash "$REPO_ROOT/scripts/embed-qemu-windows.sh" "$QEMU_DIR" "$APP_DIR"

echo
echo "Packaged Windows app with embedded QEMU:"
echo "$APP_DIR"
