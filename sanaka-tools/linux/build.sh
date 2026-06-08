#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR" && pwd)
SOURCE="$ROOT_DIR/src/sanaka_clipboard_linux.c"
HOST_OS=$(uname -s)
HOST_ARCH=$(uname -m)
BUILD_DIR="$ROOT_DIR/build"
DEFAULT_OUTPUT="$BUILD_DIR/sanaka-clipboard-${HOST_OS}-${HOST_ARCH}"
OUTPUT=${SANAKA_OUTPUT:-$DEFAULT_OUTPUT}

CC_BIN=${CC:-cc}
CFLAGS_EXTRA=${CFLAGS:-}

printf '%s\n' "Building Linux clipboard client with: $CC_BIN"

"$CC_BIN" -std=c99 -O2 -Wall -Wextra -pedantic $CFLAGS_EXTRA -o "$OUTPUT" "$SOURCE"

chmod +x "$OUTPUT"
printf '%s\n' "Built: $OUTPUT"

if [ "$HOST_OS" = "Linux" ]; then
  cp "$OUTPUT" "$ROOT_DIR/bin/sanaka-clipboard"
  chmod +x "$ROOT_DIR/bin/sanaka-clipboard"
  printf '%s\n' "Installed Linux payload: $ROOT_DIR/bin/sanaka-clipboard"
else
  printf '%s\n' "当前不是 Linux 主机，未覆盖 ISO 里的 bin/sanaka-clipboard。"
  printf '%s\n' "如果要产出真正可打包的 Linux 二进制，请在 Linux 上构建，或运行 Podman 交叉构建脚本。"
fi
