#!/bin/sh

set -eu

TARGET="${HOME}/.local/share/sanaka-tools/bin/sanaka-clipboard"
LOG_DIR="${HOME}/.local/share/sanaka-tools/logs"
LOG_FILE="${LOG_DIR}/sanaka-clipboard.log"

mkdir -p "$LOG_DIR"

if [ ! -x "$TARGET" ]; then
  printf '%s\n' "Sanaka Linux 剪贴板程序不存在或不可执行：$TARGET" >> "$LOG_FILE"
  exit 1
fi

if ps -ef 2>/dev/null | grep -F "$TARGET" | grep -v grep >/dev/null 2>&1; then
  exit 0
fi

nohup "$TARGET" >> "$LOG_FILE" 2>&1 &
