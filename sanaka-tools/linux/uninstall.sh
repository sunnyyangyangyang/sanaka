#!/bin/sh

set -eu

INSTALL_ROOT="${HOME}/.local/share/sanaka-tools"
AUTOSTART_FILE="${HOME}/.config/autostart/sanaka.desktop"
MARKER_BEGIN="# >>> sanaka clipboard start >>>"
MARKER_END="# <<< sanaka clipboard end <<<"

remove_markers_from_file() {
  file_path=$1
  [ -f "$file_path" ] || return 0
  tmp_file="${file_path}.sanaka.tmp"
  awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
    $0 == begin { skip = 1; next }
    $0 == end { skip = 0; next }
    skip != 1 { print }
  ' "$file_path" > "$tmp_file" && mv "$tmp_file" "$file_path"
}

printf '%s\n' "Sanaka Linux 增强功能卸载程序"

rm -rf "$INSTALL_ROOT"
rm -f "$AUTOSTART_FILE"

remove_markers_from_file "${HOME}/.profile"
remove_markers_from_file "${HOME}/.bash_profile"
remove_markers_from_file "${HOME}/.bashrc"
remove_markers_from_file "${HOME}/.zprofile"

printf '%s\n' "已删除安装目录和自启动项。"
printf '%s\n' "如果程序当前还在运行，请重新登录或手动结束进程。"
