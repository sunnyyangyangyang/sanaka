const fs = require('fs/promises');
const path = require('path');

class SanakaToolsService {
  constructor(options = {}) {
    this.fs = options.fsImpl || fs;
    this.app = options.app;
  }

  async ensureBundledIso() {
    const candidates = [];
    if (typeof this.app?.getAppPath === 'function') {
      candidates.push(path.join(this.app.getAppPath(), 'iso', 'sanaka-tools.iso'));
    }
    if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
      candidates.push(path.join(process.resourcesPath, 'iso', 'sanaka-tools.iso'));
    }
    candidates.push(path.join(process.cwd(), 'iso', 'sanaka-tools.iso'));

    for (const candidate of candidates) {
      try {
        await this.fs.access(candidate);
        return candidate;
      } catch {
        // ignore
      }
    }

    throw new Error('Missing Sanaka tools ISO: iso/sanaka-tools.iso. Rebuild the ISO before using guest enhancements.');
  }
}

module.exports = {
  SanakaToolsService
};
