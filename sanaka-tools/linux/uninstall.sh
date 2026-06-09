#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
. "$SCRIPT_DIR/lib/i18n.sh"
sanaka_load_i18n "$SCRIPT_DIR/locales"

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

sanaka_printf_ln "linux.uninstall.app_name"

rm -rf "$INSTALL_ROOT"
rm -f "$AUTOSTART_FILE"

remove_markers_from_file "${HOME}/.profile"
remove_markers_from_file "${HOME}/.bash_profile"
remove_markers_from_file "${HOME}/.bashrc"
remove_markers_from_file "${HOME}/.zprofile"

sanaka_printf_ln "linux.uninstall.done_1"
sanaka_printf_ln "linux.uninstall.done_2"
