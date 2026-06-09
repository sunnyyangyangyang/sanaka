#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SOURCE="$ROOT_DIR/src/sanaka_clipboard_linux.c"
HOST_OS=$(uname -s)
HOST_ARCH=$(uname -m)
BUILD_DIR="$ROOT_DIR/build"
DEFAULT_OUTPUT="$BUILD_DIR/sanaka-clipboard-${HOST_OS}-${HOST_ARCH}"
OUTPUT=${SANAKA_OUTPUT:-$DEFAULT_OUTPUT}
TARGET_ARCH=${SANAKA_TARGET_ARCH:-$HOST_ARCH}
CFLAGS_EXTRA=${CFLAGS:-}

log() {
  printf '%s\n' "$1"
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

is_debian_like() {
  [ -f /etc/debian_version ] || [ -f /etc/lsb-release ]
}

ensure_package() {
  package_name=$1
  if dpkg -s "$package_name" >/dev/null 2>&1; then
    return 0
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    fail "缺少软件包 $package_name，且当前系统没有 sudo，请手动安装。"
  fi
  log "检测到缺少 $package_name，正在自动安装..."
  sudo apt-get update
  sudo apt-get install -y "$package_name"
}

ensure_toolchain_for_arch() {
  target=$1
  if [ "$HOST_OS" = "Darwin" ]; then
    if command -v zig >/dev/null 2>&1; then
      return 0
    fi
    fail "当前是 macOS，缺少 zig。请先安装 zig，或改在 Linux 上构建。"
  fi
  if ! is_debian_like; then
    return 0
  fi
  ensure_package build-essential
  case "$target" in
    x86_64|amd64)
      ensure_package gcc
      ;;
    aarch64|arm64)
      ensure_package gcc-aarch64-linux-gnu
      ;;
  esac
}

resolve_cc_for_arch() {
  target=$1
  if [ -n "${CC:-}" ]; then
    printf '%s\n' "$CC"
    return 0
  fi
  if [ "$HOST_OS" = "Darwin" ]; then
    printf '%s\n' "zig"
    return 0
  fi
  case "$target" in
    x86_64|amd64)
      printf '%s\n' "cc"
      ;;
    aarch64|arm64)
      printf '%s\n' "aarch64-linux-gnu-gcc"
      ;;
    *)
      printf '%s\n' "cc"
      ;;
  esac
}

resolve_target_cflags_for_arch() {
  target=$1
  if [ "$HOST_OS" != "Darwin" ]; then
    printf '%s\n' ""
    return 0
  fi
  case "$target" in
    x86_64|amd64)
      printf '%s\n' "-target x86_64-linux-musl"
      ;;
    aarch64|arm64)
      printf '%s\n' "-target aarch64-linux-musl"
      ;;
    *)
      printf '%s\n' ""
      ;;
  esac
}

install_name_for_arch() {
  target=$1
  case "$target" in
    x86_64|amd64)
      printf '%s\n' "sanaka-clipboard-amd64"
      ;;
    aarch64|arm64)
      printf '%s\n' "sanaka-clipboard-aarch64"
      ;;
    *)
      printf '%s\n' "sanaka-clipboard-${target}"
      ;;
  esac
}

build_one() {
  target=$1
  cc_bin=$(resolve_cc_for_arch "$target")
  target_cflags=$(resolve_target_cflags_for_arch "$target")
  output_path=${2:-"$BUILD_DIR/sanaka-clipboard-Linux-$target"}

  ensure_toolchain_for_arch "$target"

  log "Building Linux clipboard client for $target with: $cc_bin"
  mkdir -p "$BUILD_DIR"

  if [ "$HOST_OS" = "Darwin" ]; then
    "$cc_bin" cc -std=c99 -O2 -Wall -Wextra -pedantic $target_cflags $CFLAGS_EXTRA -o "$output_path" "$SOURCE"
  else
    "$cc_bin" -std=c99 -O2 -Wall -Wextra -pedantic $CFLAGS_EXTRA -o "$output_path" "$SOURCE"
  fi

  chmod +x "$output_path"
  log "Built: $output_path"

  install_name=$(install_name_for_arch "$target")
  cp "$output_path" "$ROOT_DIR/bin/$install_name"
  chmod +x "$ROOT_DIR/bin/$install_name"
  log "Installed Linux payload: $ROOT_DIR/bin/$install_name"
}

if [ "$TARGET_ARCH" = "all" ]; then
  build_one amd64 "$BUILD_DIR/sanaka-clipboard-Linux-amd64"
  build_one aarch64 "$BUILD_DIR/sanaka-clipboard-Linux-aarch64"
  exit 0
fi

build_one "$TARGET_ARCH" "$OUTPUT"
