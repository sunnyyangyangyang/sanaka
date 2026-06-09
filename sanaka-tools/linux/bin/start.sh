#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
RUNTIME_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$RUNTIME_DIR/lib/i18n.sh"
sanaka_load_i18n "$RUNTIME_DIR/locales"

TARGET="${HOME}/.local/share/sanaka-tools/bin/sanaka-clipboard"
DOCTOR="${HOME}/.local/share/sanaka-tools/bin/doctor.sh"
CONFIG_FILE="${HOME}/.local/share/sanaka-tools/config/sanaka-clipboard.ini"
LOG_DIR="${HOME}/.local/share/sanaka-tools/logs"
LOG_FILE="${LOG_DIR}/sanaka-clipboard.log"

mkdir -p "$LOG_DIR"

read_config_value() {
  key=$1
  file_path=$2
  [ -f "$file_path" ] || return 0
  awk -F= -v wanted_key="$key" '
    $1 == wanted_key {
      print substr($0, index($0, "=") + 1)
      exit
    }
  ' "$file_path"
}

if [ -x "$DOCTOR" ]; then
  "$DOCTOR" --auto >> "$LOG_FILE" 2>&1 || true
fi

if [ ! -x "$TARGET" ]; then
  sanaka_printf "linux.start.missing_executable" "$TARGET" >> "$LOG_FILE"
  printf '\n' >> "$LOG_FILE"
  exit 1
fi

PORT_VALUE=$(read_config_value port "$CONFIG_FILE")
BOOTSTRAP_PORT_VALUE=$(read_config_value bootstrap_port "$CONFIG_FILE")
if [ -z "$PORT_VALUE" ] || [ "$PORT_VALUE" = "0" ]; then
  PORT_VALUE=${BOOTSTRAP_PORT_VALUE:-7935}
fi

if ps -ef 2>/dev/null | grep -F "$TARGET" | grep -v grep >/dev/null 2>&1; then
  sanaka_printf_ln "linux.start.running"
  sanaka_printf_ln "linux.start.port" "$PORT_VALUE"
  sanaka_printf_ln "linux.start.log_file" "$LOG_FILE"
  exit 0
fi

nohup "$TARGET" >> "$LOG_FILE" 2>&1 &

sanaka_printf_ln "linux.start.running"
sanaka_printf_ln "linux.start.port" "$PORT_VALUE"
sanaka_printf_ln "linux.start.log_file" "$LOG_FILE"
