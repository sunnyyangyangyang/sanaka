#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-summary}"
APP_SUPPORT_DIR="${HOME}/Library/Application Support"

find_latest_log() {
  python3 - <<'PY'
import os
from pathlib import Path

base = Path.home() / "Library" / "Application Support"
logs = []
if base.exists():
    for path in base.glob("*/runtime/*/qemu.log"):
        try:
            stat = path.stat()
        except OSError:
            continue
        logs.append((stat.st_mtime, str(path)))

if not logs:
    raise SystemExit(1)

logs.sort(reverse=True)
print(logs[0][1])
PY
}

LATEST_LOG="$(find_latest_log)"

if [[ -z "${LATEST_LOG}" || ! -f "${LATEST_LOG}" ]]; then
  printf '%s\n' "没有找到 qemu.log"
  exit 1
fi

printf '%s\n' "最新日志: ${LATEST_LOG}"

case "$MODE" in
  --full|full)
    if command -v open >/dev/null 2>&1; then
      open "$LATEST_LOG"
    else
      cat "$LATEST_LOG"
    fi
    ;;
  --tail|tail)
    tail -n 120 "$LATEST_LOG"
    ;;
  *)
    grep -En "expected machineMac|qemu command|\\[bootstrap\\]|\\[clipboard\\]|machine starting|lastError|session|listenPort" "$LATEST_LOG" || true
    ;;
esac
