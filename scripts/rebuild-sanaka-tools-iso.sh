#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ISO_DIR="$REPO_DIR/iso"
TARGET_ISO="$ISO_DIR/sanaka-tools.iso"

printf '%s\n' "当前目录: $REPO_DIR"

mkdir -p "$ISO_DIR"

if [ -f "$TARGET_ISO" ]; then
  printf '%s\n' "删除旧的 sanaka-tools.iso ..."
  rm -f "$TARGET_ISO"
fi

printf '%s\n' "重新生成 sanaka-tools.iso ..."

node <<'EOF'
const fs = require('fs/promises');
const path = require('path');
const { IsoImageService } = require(path.join(process.cwd(), 'runtime/IsoImageService'));
const { SanakaToolsService } = require(path.join(process.cwd(), 'runtime/SanakaToolsService'));

async function main() {
  const repoDir = process.cwd();
  const outputDir = path.join(repoDir, 'iso');
  const outputPath = path.join(outputDir, 'sanaka-tools.iso');
  const tmpRoot = path.join(repoDir, '.tmp-sanaka-tools-userdata');
  await fs.mkdir(outputDir, { recursive: true });

  const isoService = new IsoImageService({ platform: process.platform });
  const workspace = await isoService.createTemporaryWorkspace('sanaka-tools-src-');
  try {
    const binDir = path.join(workspace, 'bin');
    const configDir = path.join(workspace, 'config');
    await fs.mkdir(binDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });

    await fs.writeFile(path.join(workspace, 'autorun.inf'), '[autorun]\nopen=setup.exe\nlabel=Sanaka Tools\n', 'utf8');
    await fs.copyFile(path.join(repoDir, 'sanaka-tools', 'README.md'), path.join(workspace, 'readme.txt'));
    await fs.copyFile(path.join(repoDir, 'sanaka-tools', 'dist', 'setup.exe'), path.join(workspace, 'setup.exe'));
    await fs.copyFile(path.join(repoDir, 'sanaka-tools', 'config', 'sanaka-clipboard.ini'), path.join(configDir, 'sanaka-clipboard.ini'));
    await fs.copyFile(path.join(repoDir, 'sanaka-tools', 'dist', 'sanaka_clipboard.exe'), path.join(binDir, 'sanaka_clipboard.exe'));
    await isoService.createFromDirectory({
      sourceDirectory: workspace,
      outputPath,
      volumeLabel: 'SANAKA_TOOLS'
    });
  } finally {
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
EOF

printf '%s\n' "完成: $TARGET_ISO"
