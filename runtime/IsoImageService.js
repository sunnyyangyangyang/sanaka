const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

class IsoImageService {
  constructor(options = {}) {
    this.execFileImpl = options.execFileImpl || execFileAsync;
    this.fs = options.fsImpl || fs;
    this.tempRoot = options.tempRoot || os.tmpdir();
    this.platform = options.platform || process.platform;
    this.whichImpl = options.whichImpl || this.#defaultWhich.bind(this);
  }

  async createFromDirectory({ sourceDirectory, outputPath, volumeLabel = 'SANAKA_ISO' }) {
    if (!sourceDirectory || !outputPath) {
      throw new Error('Source directory and output path are required.');
    }

    const sourcePath = path.resolve(sourceDirectory);
    const isoPath = path.resolve(outputPath);
    await this.fs.mkdir(path.dirname(isoPath), { recursive: true });

    const generator = await this.#resolveIsoGenerator();
    if (!generator) {
      throw new Error('No ISO generator was found. Install mkisofs, genisoimage, xorriso, or ensure hdiutil is available.');
    }

    if (generator.kind === 'hdiutil') {
      await this.execFileImpl(generator.path, [
        'makehybrid',
        '-iso',
        '-joliet',
        '-default-volume-name',
        volumeLabel,
        '-o',
        isoPath,
        sourcePath
      ]);
      return { path: isoPath, tool: 'hdiutil' };
    }

    if (generator.kind === 'xorriso-mkisofs') {
      await this.execFileImpl(generator.path, [
        '-as',
        'mkisofs',
        '-V',
        volumeLabel,
        '-J',
        '-r',
        '-o',
        isoPath,
        sourcePath
      ]);
      return { path: isoPath, tool: 'xorriso' };
    }

    await this.execFileImpl(generator.path, [
      '-V',
      volumeLabel,
      '-J',
      '-r',
      '-o',
      isoPath,
      sourcePath
    ]);
    return { path: isoPath, tool: path.basename(generator.path) };
  }

  async createTemporaryWorkspace(prefix = 'sanaka-iso-') {
    return this.fs.mkdtemp(path.join(this.tempRoot, prefix));
  }

  async #resolveIsoGenerator() {
    const mkisofsPath = await this.whichImpl('mkisofs');
    if (mkisofsPath) {
      return { kind: 'mkisofs', path: mkisofsPath };
    }
    const genisoimagePath = await this.whichImpl('genisoimage');
    if (genisoimagePath) {
      return { kind: 'genisoimage', path: genisoimagePath };
    }
    const xorrisoPath = await this.whichImpl('xorriso');
    if (xorrisoPath) {
      return { kind: 'xorriso-mkisofs', path: xorrisoPath };
    }
    if (this.platform === 'darwin') {
      const hdiutilPath = await this.whichImpl('hdiutil');
      if (hdiutilPath) {
        return { kind: 'hdiutil', path: hdiutilPath };
      }
    }
    return null;
  }

  async #defaultWhich(binary) {
    const pathEnv = String(process.env.PATH || '').split(path.delimiter);
    for (const segment of pathEnv) {
      const candidate = path.join(segment, binary);
      try {
        await this.fs.access(candidate);
        return candidate;
      } catch {
        // ignore
      }
    }
    return null;
  }
}

module.exports = {
  IsoImageService
};
