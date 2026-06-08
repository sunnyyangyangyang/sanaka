#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ISO_DIR="$REPO_DIR/iso"
TARGET_ISO="$ISO_DIR/sanaka-tools-linux.iso"

printf '%s\n' "当前目录: $REPO_DIR"

mkdir -p "$ISO_DIR"

if [ ! -f "$REPO_DIR/sanaka-tools/linux/bin/sanaka-clipboard-amd64" ] && [ ! -f "$REPO_DIR/sanaka-tools/linux/bin/sanaka-clipboard-aarch64" ] && [ ! -f "$REPO_DIR/sanaka-tools/linux/bin/sanaka-clipboard" ]; then
  printf '%s\n' "缺少 Linux 客户机程序: sanaka-tools/linux/bin/sanaka-clipboard-*" >&2
  printf '%s\n' "请先在 Linux 上分别构建 amd64 / aarch64，或至少放入一个可用的 Linux ELF。" >&2
  exit 1
fi

if command -v file >/dev/null 2>&1; then
  for candidate in \
    "$REPO_DIR/sanaka-tools/linux/bin/sanaka-clipboard-amd64" \
    "$REPO_DIR/sanaka-tools/linux/bin/sanaka-clipboard-aarch64" \
    "$REPO_DIR/sanaka-tools/linux/bin/sanaka-clipboard"
  do
    if [ -f "$candidate" ]; then
      FILE_INFO=$(file "$candidate")
      case "$FILE_INFO" in
        *ELF*)
          ;;
        *)
          printf '%s\n' "$candidate 不是 Linux ELF，可不能打包进 ISO。" >&2
          printf '%s\n' "$FILE_INFO" >&2
          exit 1
          ;;
      esac
    fi
  done
fi

if [ -f "$TARGET_ISO" ]; then
  printf '%s\n' "删除旧的 sanaka-tools-linux.iso ..."
  rm -f "$TARGET_ISO"
fi

printf '%s\n' "重新生成 sanaka-tools-linux.iso ..."

node <<'EOF'
const path = require('path');
const { IsoImageService } = require(path.join(process.cwd(), 'runtime/IsoImageService'));

async function main() {
  const repoDir = process.cwd();
  const isoService = new IsoImageService({ platform: process.platform });
  const sourceDirectory = path.join(repoDir, 'sanaka-tools', 'linux');
  const outputPath = path.join(repoDir, 'iso', 'sanaka-tools-linux.iso');
  const result = await isoService.createFromDirectory({
    sourceDirectory,
    outputPath,
    volumeLabel: 'SANAKA_TOOLS_LINUX'
  });
  console.log(result.path);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
EOF

printf '%s\n' "完成: $TARGET_ISO"
