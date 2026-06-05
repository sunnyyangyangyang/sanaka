#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_ROOT="$REPO_ROOT/release"

resolve_qemu_dir() {
  if [[ -n "${1:-}" ]]; then
    printf '%s\n' "$1"
    return 0
  fi

  local candidates=(
    "/c/Program Files/qemu"
    "/c/Program Files/QEMU"
    "/mnt/c/Program Files/qemu"
    "/mnt/c/Program Files/QEMU"
    "C:/Program Files/qemu"
    "C:/Program Files/QEMU"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

QEMU_DIR="$(resolve_qemu_dir "${1:-}" || true)"

if [[ -z "$QEMU_DIR" ]]; then
  echo "QEMU directory not found automatically." >&2
  echo "Usage: $0 <qemu-install-dir>" >&2
  exit 1
fi

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
