#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <qemu-install-dir> <Sanaka-win-unpacked-dir>" >&2
  exit 1
fi

QEMU_DIR="$1"
APP_DIR="$2"

if [[ ! -d "$QEMU_DIR" ]]; then
  echo "QEMU directory not found: $QEMU_DIR" >&2
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "Sanaka unpacked app directory not found: $APP_DIR" >&2
  exit 1
fi

RESOURCES_DIR="$APP_DIR/resources"
TARGET_QEMU_DIR="$RESOURCES_DIR/qemu"

rm -rf "$TARGET_QEMU_DIR"
mkdir -p "$TARGET_QEMU_DIR"

copy_if_exists() {
  local source_path="$1"
  local target_path="$2"
  if [[ -e "$source_path" ]]; then
    mkdir -p "$(dirname "$target_path")"
    cp -R "$source_path" "$target_path"
  fi
}

SYSTEM_TARGETS=(
  qemu-system-x86_64.exe
  qemu-system-i386.exe
  qemu-system-aarch64.exe
  qemu-system-arm.exe
  qemu-system-riscv64.exe
  qemu-system-ppc.exe
  qemu-system-ppc64.exe
)

TOOLS=(
  qemu-img.exe
)

OPTIONAL_SKIP=(
  qemu-ga.exe
  qemu-io.exe
  qemu-nbd.exe
  qemu-storage-daemon.exe
  qemu-edid.exe
  qemu-uninstall.exe
)

for binary in "${SYSTEM_TARGETS[@]}"; do
  if [[ ! -f "$QEMU_DIR/$binary" ]]; then
    echo "Missing required QEMU binary: $QEMU_DIR/$binary" >&2
    exit 1
  fi
  cp -f "$QEMU_DIR/$binary" "$TARGET_QEMU_DIR/$binary"
done

for tool in "${TOOLS[@]}"; do
  if [[ -f "$QEMU_DIR/$tool" ]]; then
    cp -f "$QEMU_DIR/$tool" "$TARGET_QEMU_DIR/$tool"
  fi
done

while IFS= read -r dll_path; do
  cp -f "$dll_path" "$TARGET_QEMU_DIR/$(basename "$dll_path")"
done < <(find "$QEMU_DIR" -maxdepth 1 -type f \( -iname '*.dll' -o -iname 'zlib1.dll' \) | sort)

copy_if_exists "$QEMU_DIR/share" "$TARGET_QEMU_DIR/share"
copy_if_exists "$QEMU_DIR/lib" "$TARGET_QEMU_DIR/lib"

rm -rf "$TARGET_QEMU_DIR/share/doc" \
  "$TARGET_QEMU_DIR/share/man" \
  "$TARGET_QEMU_DIR/share/icons" \
  "$TARGET_QEMU_DIR/share/applications"

echo
echo "Embedded Windows QEMU into: $APP_DIR"
echo "QEMU source: $QEMU_DIR"
echo "QEMU target: $TARGET_QEMU_DIR"
