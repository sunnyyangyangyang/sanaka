#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
RUNTIME_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
. "$RUNTIME_DIR/lib/i18n.sh"
sanaka_load_i18n "$RUNTIME_DIR/locales"

INSTALL_ROOT="${HOME}/.local/share/sanaka-tools"
BIN_DIR="${INSTALL_ROOT}/bin"
CONFIG_DIR="${INSTALL_ROOT}/config"
SHARE_DIR="${INSTALL_ROOT}/share"
LOG_DIR="${INSTALL_ROOT}/logs"
AUTOSTART_DIR="${HOME}/.config/autostart"
AUTOSTART_FILE="${AUTOSTART_DIR}/sanaka.desktop"
PROFILE_PATH=""
SOURCE_SHARE_DIR=""
MARKER_BEGIN="# >>> sanaka clipboard start >>>"
MARKER_END="# <<< sanaka clipboard end <<<"
AUTO_MODE=0

log() {
  printf '%s\n' "$1"
}

warn() {
  printf '%s\n' "$1" >&2
}

detect_source_share_dir() {
  if [ -d "${BIN_DIR}/../share" ]; then
    SOURCE_SHARE_DIR=$(CDPATH= cd -- "${BIN_DIR}/../share" && pwd)
    return 0
  fi
  if [ -d "$(CDPATH= cd -- "$(dirname "$0")" && pwd)/../share" ]; then
    SOURCE_SHARE_DIR=$(CDPATH= cd -- "$(dirname "$0")/../share" && pwd)
    return 0
  fi
  SOURCE_SHARE_DIR=""
}

pick_shell_profile() {
  for candidate in "${HOME}/.profile" "${HOME}/.bash_profile" "${HOME}/.bashrc" "${HOME}/.zprofile"; do
    if [ -f "$candidate" ]; then
      PROFILE_PATH=$candidate
      return 0
    fi
  done
  PROFILE_PATH="${HOME}/.profile"
}

ensure_shell_hook() {
  mkdir -p "$(dirname "$PROFILE_PATH")"
  [ -f "$PROFILE_PATH" ] || : > "$PROFILE_PATH"

  if grep -F "$MARKER_BEGIN" "$PROFILE_PATH" >/dev/null 2>&1; then
    return 0
  fi

  {
    printf '\n%s\n' "$MARKER_BEGIN"
    printf '%s\n' "\"${BIN_DIR}/start.sh\" >/dev/null 2>&1 &"
    printf '%s\n' "$MARKER_END"
  } >> "$PROFILE_PATH"
}

ensure_autostart_file() {
  detect_source_share_dir
  [ -n "$SOURCE_SHARE_DIR" ] || return 0
  [ -f "${SOURCE_SHARE_DIR}/sanaka-autostart.desktop" ] || return 0
  mkdir -p "$AUTOSTART_DIR"
  sed "s#__SANAKA_START__#${BIN_DIR}/start.sh#g" \
    "${SOURCE_SHARE_DIR}/sanaka-autostart.desktop" > "$AUTOSTART_FILE"
}

ensure_config_line() {
  key=$1
  value=$2
  config_file="${CONFIG_DIR}/sanaka-clipboard.ini"

  if grep -E "^${key}=" "$config_file" >/dev/null 2>&1; then
    tmp_file="${config_file}.tmp"
    awk -F= -v wanted_key="$key" -v wanted_value="$value" '
      BEGIN { updated = 0 }
      $1 == wanted_key { print wanted_key "=" wanted_value; updated = 1; next }
      { print }
      END { if (updated == 0) print wanted_key "=" wanted_value }
    ' "$config_file" > "$tmp_file" && mv "$tmp_file" "$config_file"
    return 0
  fi

  printf '%s=%s\n' "$key" "$value" >> "$config_file"
}

ensure_config() {
  config_file="${CONFIG_DIR}/sanaka-clipboard.ini"
  mkdir -p "$CONFIG_DIR"
  if [ ! -f "$config_file" ]; then
    cat > "$config_file" <<'EOF'
host=10.0.2.2
bootstrap_port=7935
port=0
session_id=
machine_mac=
protocol_version=1
EOF
  fi
  ensure_config_line host 10.0.2.2
  ensure_config_line bootstrap_port 7935
  ensure_config_line port 0
  ensure_config_line protocol_version 1
  ensure_config_line machine_mac ""
}

has_any_desktop_marker() {
  [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ] || [ -n "${XDG_CURRENT_DESKTOP:-}" ] || [ -n "${DESKTOP_SESSION:-}" ] || [ -d /usr/share/xsessions ] || [ -d /usr/share/wayland-sessions ]
}

missing_desktop_backends() {
  missing=""

  if [ -n "${WAYLAND_DISPLAY:-}" ] || [ -n "${WAYLAND_SOCKET:-}" ]; then
    command -v wl-copy >/dev/null 2>&1 || missing="${missing} wl-clipboard"
    command -v wl-paste >/dev/null 2>&1 || missing="${missing} wl-clipboard"
  fi

  if [ -n "${DISPLAY:-}" ] || has_any_desktop_marker; then
    if ! command -v xclip >/dev/null 2>&1 && ! command -v xsel >/dev/null 2>&1; then
      missing="${missing} xclip xsel"
    fi
  fi

  printf '%s\n' "$missing" | awk '
    {
      for (i = 1; i <= NF; i++) {
        if (!seen[$i]++) {
          if (out != "") out = out " "
          out = out $i
        }
      }
    }
    END { print out }
  '
}

detect_package_manager() {
  for candidate in apt-get dnf pacman zypper apk; do
    if command -v "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf '%s\n' ""
}

can_escalate() {
  [ "$(id -u)" -eq 0 ] && return 0
  command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1
}

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return 0
  fi
  sudo -n "$@"
}

install_missing_packages() {
  packages=$1
  [ -n "$packages" ] || return 0
  package_manager=$(detect_package_manager)
  if [ -z "$package_manager" ]; then
    sanaka_warn_ln "linux.doctor.no_package_manager" "$packages"
    return 0
  fi
  if ! can_escalate; then
    sanaka_warn_ln "linux.doctor.no_privilege" "$packages"
    return 0
  fi

  sanaka_printf_ln "linux.doctor.missing_packages" "$packages"
  if [ "${SANAKA_DOCTOR_ASSUME_YES:-0}" != "1" ]; then
    if sanaka_is_interactive; then
      if ! sanaka_confirm_yes "linux.doctor.ask_install"; then
        sanaka_printf_ln "linux.doctor.skipped_install" "$packages"
        return 0
      fi
    else
      sanaka_printf_ln "linux.doctor.skipped_install" "$packages"
      return 0
    fi
  fi

  sanaka_printf_ln "linux.doctor.installing" "$packages"

  case "$package_manager" in
    apt-get)
      run_privileged apt-get update
      run_privileged apt-get install -y $packages
      ;;
    dnf)
      run_privileged dnf install -y $packages
      ;;
    pacman)
      run_privileged pacman -Sy --noconfirm $packages
      ;;
    zypper)
      run_privileged zypper --non-interactive install $packages
      ;;
    apk)
      run_privileged apk add $packages
      ;;
  esac
}

run_auto() {
  mkdir -p "$BIN_DIR" "$CONFIG_DIR" "$SHARE_DIR" "$LOG_DIR"
  pick_shell_profile
  ensure_shell_hook
  ensure_autostart_file
  ensure_config

  missing_packages=$(missing_desktop_backends)
  if [ -n "$missing_packages" ]; then
    install_missing_packages "$missing_packages" || true
  fi

  sanaka_printf_ln "linux.doctor.auto_done"
  sanaka_printf_ln "linux.doctor.shell_profile" "$PROFILE_PATH"
  if [ -f "$AUTOSTART_FILE" ]; then
    sanaka_printf_ln "linux.doctor.autostart_file" "$AUTOSTART_FILE"
  fi
}

show_help() {
  sanaka_printf_ln "linux.doctor.usage"
  sanaka_printf_ln "linux.doctor.usage_line"
}

if [ "${1:-}" = "--auto" ]; then
  AUTO_MODE=1
elif [ "${1:-}" = "" ]; then
  show_help
  exit 0
else
  show_help
  exit 1
fi

if [ "$AUTO_MODE" -eq 1 ]; then
  run_auto
fi
