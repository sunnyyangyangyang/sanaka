#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "$SCRIPT_DIR/lib/i18n.sh"
sanaka_load_i18n "$SCRIPT_DIR/locales"

INSTALL_ROOT="${HOME}/.local/share/sanaka-tools"
BIN_DIR="${INSTALL_ROOT}/bin"
CONFIG_DIR="${INSTALL_ROOT}/config"
SHARE_DIR="${INSTALL_ROOT}/share"
LIB_DIR="${INSTALL_ROOT}/lib"
LOCALES_DIR="${INSTALL_ROOT}/locales"
LOG_DIR="${INSTALL_ROOT}/logs"
SOURCE_DIR="$SCRIPT_DIR"
SELECTED_BINARY=""

log_step() {
  printf '%s\n' "$1"
}

fail() {
  sanaka_warn_ln "linux.install.fail" "$1"
  exit 1
}

detect_guest_arch() {
  raw_arch=$(uname -m 2>/dev/null || printf '%s' unknown)
  case "$raw_arch" in
    x86_64|amd64)
      printf '%s\n' "amd64"
      ;;
    aarch64|arm64)
      printf '%s\n' "aarch64"
      ;;
    *)
      printf '%s\n' "$raw_arch"
      ;;
  esac
}

resolve_payload_binary() {
  guest_arch=$(detect_guest_arch)
  case "$guest_arch" in
    amd64)
      if [ -f "${SOURCE_DIR}/bin/sanaka-clipboard-amd64" ]; then
        printf '%s\n' "${SOURCE_DIR}/bin/sanaka-clipboard-amd64"
        return 0
      fi
      ;;
    aarch64)
      if [ -f "${SOURCE_DIR}/bin/sanaka-clipboard-aarch64" ]; then
        printf '%s\n' "${SOURCE_DIR}/bin/sanaka-clipboard-aarch64"
        return 0
      fi
      ;;
  esac
  if [ -f "${SOURCE_DIR}/bin/sanaka-clipboard" ]; then
    printf '%s\n' "${SOURCE_DIR}/bin/sanaka-clipboard"
    return 0
  fi
  return 1
}

copy_payload() {
  mkdir -p "$BIN_DIR" "$CONFIG_DIR" "$SHARE_DIR" "$LIB_DIR" "$LOCALES_DIR" "$LOG_DIR"

  SELECTED_BINARY=$(resolve_payload_binary) || fail "$(sanaka_t "linux.install.binary_not_found")"
  cp "$SELECTED_BINARY" "${BIN_DIR}/sanaka-clipboard" || fail "$(sanaka_t "linux.install.copy_binary_failed")"
  cp "${SOURCE_DIR}/bin/start.sh" "${BIN_DIR}/start.sh" || fail "$(sanaka_t "linux.install.copy_start_failed")"
  cp "${SOURCE_DIR}/bin/doctor.sh" "${BIN_DIR}/doctor.sh" || fail "$(sanaka_t "linux.install.copy_doctor_failed")"
  cp "${SOURCE_DIR}/lib/i18n.sh" "${LIB_DIR}/i18n.sh" || fail "$(sanaka_t "linux.install.copy_i18n_failed")"
  cp "${SOURCE_DIR}/locales/"*.sh "${LOCALES_DIR}/" || fail "$(sanaka_t "linux.install.copy_i18n_failed")"
  cp "${SOURCE_DIR}/config/sanaka-clipboard.ini" "${CONFIG_DIR}/sanaka-clipboard.ini" || fail "$(sanaka_t "linux.install.copy_config_failed")"
  cp "${SOURCE_DIR}/share/sanaka.desktop" "${SHARE_DIR}/sanaka.desktop" || fail "$(sanaka_t "linux.install.copy_desktop_failed")"
  cp "${SOURCE_DIR}/share/sanaka-autostart.desktop" "${SHARE_DIR}/sanaka-autostart.desktop" || fail "$(sanaka_t "linux.install.copy_autostart_failed")"

  chmod +x "${BIN_DIR}/sanaka-clipboard" "${BIN_DIR}/start.sh" "${BIN_DIR}/doctor.sh" || fail "$(sanaka_t "linux.install.chmod_failed")"
}

sanaka_printf_ln "linux.install.app_name"
printf '\n'
log_step "$(sanaka_t "linux.install.step_1")"
[ -w "${HOME}" ] || fail "$(sanaka_printf 'linux.install.home_not_writable' "${HOME}")"

log_step "$(sanaka_t "linux.install.step_2")"
copy_payload
sanaka_printf_ln "linux.install.selected_binary" "$(basename "$SELECTED_BINARY")"

log_step "$(sanaka_t "linux.install.step_3")"
[ -f "${CONFIG_DIR}/sanaka-clipboard.ini" ] || fail "$(sanaka_t "linux.install.config_missing")"

log_step "$(sanaka_t "linux.install.step_4")"
log_step "$(sanaka_t "linux.install.step_4_detail")"

log_step "$(sanaka_t "linux.install.step_5")"
"${BIN_DIR}/doctor.sh" --auto || fail "$(sanaka_t "linux.install.doctor_failed")"

log_step "$(sanaka_t "linux.install.step_6")"
sanaka_printf_ln "linux.install.next"
sanaka_printf_ln "linux.install.next_1"
sanaka_printf_ln "linux.install.next_2" "${BIN_DIR}/start.sh"
