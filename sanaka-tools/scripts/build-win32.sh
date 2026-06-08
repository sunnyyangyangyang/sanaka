#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SRC_FILE="$PROJECT_DIR/src/sanaka_tools.c"
DIST_DIR="$PROJECT_DIR/dist"
OUTPUT_FILE="$DIST_DIR/sanaka_clipboard.exe"

CC="${CC:-i686-w64-mingw32-gcc}"

mkdir -p "$DIST_DIR"

"$CC" \
  -std=c89 \
  -Os \
  -mwindows \
  -DWINVER=0x0501 \
  -D_WIN32_WINNT=0x0501 \
  -Wall \
  -Wextra \
  -o "$OUTPUT_FILE" \
  "$SRC_FILE" \
  -lws2_32

echo "Built: $OUTPUT_FILE"
