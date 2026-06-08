#!/bin/sh

set -eu

APP_NAME="Sanaka Linux 增强功能安装程序"
INSTALL_ROOT="${HOME}/.local/share/sanaka-tools"
BIN_DIR="${INSTALL_ROOT}/bin"
CONFIG_DIR="${INSTALL_ROOT}/config"
SHARE_DIR="${INSTALL_ROOT}/share"
LOG_DIR="${INSTALL_ROOT}/logs"
AUTOSTART_DIR="${HOME}/.config/autostart"
AUTOSTART_FILE="${AUTOSTART_DIR}/sanaka.desktop"
SOURCE_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
MARKER_BEGIN="# >>> sanaka clipboard start >>>"
MARKER_END="# <<< sanaka clipboard end <<<"
SELECTED_BINARY=""

log_step() {
  printf '%s\n' "$1"
}

fail() {
  printf '%s\n' "安装失败：$1" >&2
  exit 1
}

detect_desktop() {
  if [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ] || [ -n "${XDG_CURRENT_DESKTOP:-}" ] || [ -n "${DESKTOP_SESSION:-}" ]; then
    return 0
  fi
  return 1
}

pick_shell_profile() {
  for candidate in "${HOME}/.profile" "${HOME}/.bash_profile" "${HOME}/.bashrc" "${HOME}/.zprofile"; do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf '%s\n' "${HOME}/.profile"
}

ensure_shell_hook() {
  profile_path=$1
  mkdir -p "$(dirname "$profile_path")"
  [ -f "$profile_path" ] || : > "$profile_path"

  if grep -F "$MARKER_BEGIN" "$profile_path" >/dev/null 2>&1; then
    return 0
  fi

  {
    printf '\n%s\n' "$MARKER_BEGIN"
    printf '%s\n' "\"${BIN_DIR}/start.sh\" >/dev/null 2>&1 &"
    printf '%s\n' "$MARKER_END"
  } >> "$profile_path" || fail "无法写入 shell 启动文件：$profile_path"
}

write_desktop_file() {
  mkdir -p "$AUTOSTART_DIR"
  sed "s#__SANAKA_START__#${BIN_DIR}/start.sh#g" \
    "${SOURCE_DIR}/share/sanaka-autostart.desktop" > "$AUTOSTART_FILE" \
    || fail "无法写入自启动文件：$AUTOSTART_FILE"
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
  mkdir -p "$BIN_DIR" "$CONFIG_DIR" "$SHARE_DIR" "$LOG_DIR"

  SELECTED_BINARY=$(resolve_payload_binary) || fail "找不到适合当前 Linux 架构的增强程序"
  cp "$SELECTED_BINARY" "${BIN_DIR}/sanaka-clipboard" || fail "复制 Linux 客户机程序失败"
  cp "${SOURCE_DIR}/bin/start.sh" "${BIN_DIR}/start.sh" || fail "复制启动脚本失败"
  cp "${SOURCE_DIR}/config/sanaka-clipboard.ini" "${CONFIG_DIR}/sanaka-clipboard.ini" || fail "复制配置文件失败"
  cp "${SOURCE_DIR}/share/sanaka.desktop" "${SHARE_DIR}/sanaka.desktop" || fail "复制 desktop 文件失败"
  cp "${SOURCE_DIR}/share/sanaka-autostart.desktop" "${SHARE_DIR}/sanaka-autostart.desktop" || fail "复制 autostart 模板失败"

  chmod +x "${BIN_DIR}/sanaka-clipboard" "${BIN_DIR}/start.sh" || fail "设置执行权限失败"
}

printf '%s\n\n' "$APP_NAME"
log_step "[1/6] 检查目录..."
[ -w "${HOME}" ] || fail "当前用户目录不可写：${HOME}"

log_step "[2/6] 复制程序..."
copy_payload
printf '%s\n' "已选择增强程序：$(basename "$SELECTED_BINARY")"

log_step "[3/6] 写入配置..."
[ -f "${CONFIG_DIR}/sanaka-clipboard.ini" ] || fail "配置文件写入失败"

log_step "[4/6] 检查当前环境..."
if detect_desktop; then
  MODE="desktop"
  log_step "检测到桌面环境，使用 XDG 自启动模式。"
else
  MODE="cli"
  log_step "未检测到桌面环境，切换到 CLI 常驻模式。"
fi

log_step "[5/6] 配置自启动..."
if [ "$MODE" = "desktop" ]; then
  write_desktop_file
else
  PROFILE_PATH=$(pick_shell_profile)
  ensure_shell_hook "$PROFILE_PATH"
  printf '%s\n' "已写入 shell 启动文件：$PROFILE_PATH"
fi

log_step "[6/6] 安装完成"
printf '\n%s\n' "注意：当前 Linux 版还是预览骨架，真正的共享剪贴板逻辑还在继续补。"
printf '%s\n' "你现在可以："
printf '%s\n' "1. 重新登录系统或重新进入 shell"
printf '%s\n' "2. 或手动运行 ${BIN_DIR}/start.sh"
