#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ISO_DIR="$REPO_DIR/iso"
TARGET_ISO="$ISO_DIR/sanaka-tools-linux.iso"

printf '%s\n' "当前目录: $REPO_DIR"

mkdir -p "$ISO_DIR"

if [ ! -f "$REPO_DIR/sanaka-tools/linux/bin/sanaka-clipboard-amd64" ] || [ ! -f "$REPO_DIR/sanaka-tools/linux/bin/sanaka-clipboard-aarch64" ]; then
  printf '%s\n' "缺少 Linux 客户机程序: sanaka-tools/linux/bin/sanaka-clipboard-amd64 或 sanaka-tools/linux/bin/sanaka-clipboard-aarch64" >&2
  printf '%s\n' "请先完成双架构构建：SANAKA_TARGET_ARCH=all sh sanaka-tools/linux/src/build.sh" >&2
  exit 1
fi

if command -v file >/dev/null 2>&1; then
  for candidate in \
    "$REPO_DIR/sanaka-tools/linux/bin/sanaka-clipboard-amd64" \
    "$REPO_DIR/sanaka-tools/linux/bin/sanaka-clipboard-aarch64"
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
const fs = require('fs/promises');
const path = require('path');
const { IsoImageService } = require(path.join(process.cwd(), 'runtime/IsoImageService'));

async function copyTextWithLf(sourcePath, targetPath, mode) {
  const content = await fs.readFile(sourcePath, 'utf8');
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, normalized, 'utf8');
  if (typeof mode === 'number') {
    await fs.chmod(targetPath, mode);
  }
}

async function copyBinary(sourcePath, targetPath, mode) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
  if (typeof mode === 'number') {
    await fs.chmod(targetPath, mode);
  }
}

async function main() {
  const repoDir = process.cwd();
  const isoService = new IsoImageService({ platform: process.platform });
  const outputPath = path.join(repoDir, 'iso', 'sanaka-tools-linux.iso');
  const workspace = await isoService.createTemporaryWorkspace('sanaka-tools-linux-src-');

  try {
    const sourceRoot = path.join(repoDir, 'sanaka-tools', 'linux');
    const readmeSource = path.join(sourceRoot, 'README.txt');
    const installSource = path.join(sourceRoot, 'install.sh');
    const uninstallSource = path.join(sourceRoot, 'uninstall.sh');
    const startSource = path.join(sourceRoot, 'bin', 'start.sh');
    const doctorSource = path.join(sourceRoot, 'bin', 'doctor.sh');
    const i18nSource = path.join(sourceRoot, 'lib', 'i18n.sh');
    const configSource = path.join(sourceRoot, 'config', 'sanaka-clipboard.ini');
    const desktopSource = path.join(sourceRoot, 'share', 'sanaka.desktop');
    const autostartSource = path.join(sourceRoot, 'share', 'sanaka-autostart.desktop');
    const localesSource = path.join(sourceRoot, 'locales');

    await copyTextWithLf(readmeSource, path.join(workspace, 'README.txt'));
    await copyTextWithLf(installSource, path.join(workspace, 'install.sh'), 0o755);
    await copyTextWithLf(uninstallSource, path.join(workspace, 'uninstall.sh'), 0o755);
    await copyTextWithLf(startSource, path.join(workspace, 'bin', 'start.sh'), 0o755);
    await copyTextWithLf(doctorSource, path.join(workspace, 'bin', 'doctor.sh'), 0o755);
    await copyTextWithLf(i18nSource, path.join(workspace, 'lib', 'i18n.sh'), 0o755);
    await copyTextWithLf(configSource, path.join(workspace, 'config', 'sanaka-clipboard.ini'));
    await copyTextWithLf(desktopSource, path.join(workspace, 'share', 'sanaka.desktop'));
    await copyTextWithLf(autostartSource, path.join(workspace, 'share', 'sanaka-autostart.desktop'));
    for (const localeName of ['en-US.sh', 'zh-CN.sh']) {
      await copyTextWithLf(path.join(localesSource, localeName), path.join(workspace, 'locales', localeName));
    }

    const payloadCandidates = [
      ['sanaka-clipboard-amd64', 0o755],
      ['sanaka-clipboard-aarch64', 0o755]
    ];
    for (const [name, mode] of payloadCandidates) {
      const sourcePath = path.join(sourceRoot, 'bin', name);
      try {
        await fs.access(sourcePath);
        await copyBinary(sourcePath, path.join(workspace, 'bin', name), mode);
      } catch {
        // optional payload
      }
    }

    const result = await isoService.createFromDirectory({
      sourceDirectory: workspace,
      outputPath,
      volumeLabel: 'SANAKA_TOOLS_LINUX'
    });
    console.log(result.path);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
EOF

printf '%s\n' "完成: $TARGET_ISO"
