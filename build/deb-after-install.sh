#!/bin/sh

set -eu

REQUIRED_BINARIES="
qemu-system-x86_64
qemu-system-i386
qemu-system-aarch64
qemu-system-arm
qemu-system-riscv64
qemu-system-ppc
qemu-system-ppc64
qemu-img
"

MISSING=""

for binary in $REQUIRED_BINARIES; do
  if ! command -v "$binary" >/dev/null 2>&1; then
    if [ -n "$MISSING" ]; then
      MISSING="$MISSING, $binary"
    else
      MISSING="$binary"
    fi
  fi
done

if [ -n "$MISSING" ]; then
  echo "Sanaka installation failed: required QEMU binaries are missing: $MISSING" >&2
  echo "Sanaka requires a full qemu-system installation with all 7 supported system targets plus qemu-img." >&2
  echo "Please install or fix your distribution QEMU packages, then install Sanaka again." >&2
  exit 1
fi

exit 0
