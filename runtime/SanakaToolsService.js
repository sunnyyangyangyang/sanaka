const fs = require('fs/promises');
const path = require('path');

class SanakaToolsService {
  constructor(options = {}) {
    this.fs = options.fsImpl || fs;
    this.isoService = options.isoService;
    this.app = options.app;
  }

  async ensureBundledIso() {
    const candidates = [];
    if (typeof this.app?.getAppPath === 'function') {
      candidates.push(path.join(this.app.getAppPath(), 'sanaka-tools.iso'));
    }
    if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
      candidates.push(path.join(process.resourcesPath, 'sanaka-tools.iso'));
    }

    for (const candidate of candidates) {
      try {
        await this.fs.access(candidate);
        return candidate;
      } catch {
        // ignore
      }
    }

    const userDataPath = typeof this.app?.getPath === 'function' ? this.app.getPath('userData') : process.cwd();
    const runtimeDir = path.join(userDataPath, 'generated-tools-iso');
    const isoPath = path.join(runtimeDir, 'sanaka-tools.iso');
    await this.fs.mkdir(runtimeDir, { recursive: true });

    try {
      await this.fs.access(isoPath);
      return isoPath;
    } catch {
      // continue
    }

    const workspace = await this.isoService.createTemporaryWorkspace('sanaka-tools-src-');
    try {
      await this.#writeWorkspace(workspace);
      await this.isoService.createFromDirectory({
        sourceDirectory: workspace,
        outputPath: isoPath,
        volumeLabel: 'SANAKA_TOOLS'
      });
      return isoPath;
    } finally {
      await this.fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async #writeWorkspace(workspace) {
    const binDir = path.join(workspace, 'bin');
    const configDir = path.join(workspace, 'config');
    await this.fs.mkdir(binDir, { recursive: true });
    await this.fs.mkdir(configDir, { recursive: true });

    await this.fs.writeFile(
      path.join(workspace, 'autorun.inf'),
      ['[autorun]', 'open=setup.exe', 'label=Sanaka Tools', ''].join('\n'),
      'utf8'
    );
    await this.#copyOrWriteFallback('sanaka-tools/README.md', path.join(workspace, 'readme.txt'), [
      'Sanaka 增强功能工具',
      '',
      '工具盘内容正在初始化。',
      ''
    ].join('\n'));
    await this.#copyOrWriteFallback('sanaka-tools/dist/setup.exe', path.join(workspace, 'setup.exe'), null);
    await this.#copyOrWriteFallback('sanaka-tools/installer/sanaka-tools.nsi', path.join(workspace, 'installer-script.nsi'), '; setup.exe is not built yet.\n');
    await this.#copyOrWriteFallback('sanaka-tools/config/sanaka-clipboard.ini', path.join(configDir, 'sanaka-clipboard.ini'), [
      'host=10.0.2.2',
      'port=0',
      'session_id=',
      'protocol_version=1',
      ''
    ].join('\n'));
    await this.#copyOrWriteFallback('sanaka-tools/dist/sanaka_clipboard.exe', path.join(binDir, 'sanaka_clipboard.exe'), null);
    await this.#copyOrWriteFallback('sanaka-tools/dist/README.txt', path.join(binDir, 'README.txt'), 'sanaka_clipboard.exe is not built yet.\n');
    await this.fs.writeFile(
      path.join(configDir, 'placeholder.ini'),
      ['[sanaka_tools]', 'version=0.0.2-beta', 'clipboard=text', 'target=XP-win11+', ''].join('\n'),
      'utf8'
    );
  }

  async #copyOrWriteFallback(repoRelativePath, destinationPath, fallbackContent) {
    const sourcePath = path.join(process.cwd(), repoRelativePath);
    try {
      const content = await this.fs.readFile(sourcePath);
      await this.fs.writeFile(destinationPath, content);
    } catch {
      if (fallbackContent !== null) {
        await this.fs.writeFile(destinationPath, fallbackContent, 'utf8');
      }
    }
  }
}

module.exports = {
  SanakaToolsService
};
