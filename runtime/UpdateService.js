const { parse: parseToml } = require('smol-toml');

const UPDATE_CHANNELS = ['release', 'beta'];
const DEFAULT_STARTUP_DELAY_MS = 5_000;
const DEFAULT_CHECK_INTERVAL_MS = 8 * 60 * 60 * 1_000;
const DEFAULT_MANIFEST_URLS = {
  release: 'https://steve372a.github.io/update/release.toml',
  beta: 'https://steve372a.github.io/update/beta.toml'
};

function detectUpdateChannel(version) {
  return typeof version === 'string' && /beta/i.test(version) ? 'beta' : 'release';
}

function tokenizePreRelease(value) {
  if (!value) return [];
  return value.split('.').filter(Boolean).map((token) => (/^\d+$/.test(token) ? Number(token) : token.toLowerCase()));
}

function parseVersion(version) {
  const normalized = String(version || '').trim();
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    raw: normalized,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    preRelease: tokenizePreRelease(match[4])
  };
}

function compareIdentifiers(left, right) {
  const leftIsNumber = typeof left === 'number';
  const rightIsNumber = typeof right === 'number';
  if (leftIsNumber && rightIsNumber) return left - right;
  if (leftIsNumber) return -1;
  if (rightIsNumber) return 1;
  return String(left).localeCompare(String(right));
}

function compareVersions(leftVersion, rightVersion) {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);
  if (!left || !right) {
    return String(leftVersion).localeCompare(String(rightVersion), undefined, { numeric: true, sensitivity: 'base' });
  }
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;

  if (left.preRelease.length === 0 && right.preRelease.length === 0) return 0;
  if (left.preRelease.length === 0) return 1;
  if (right.preRelease.length === 0) return -1;

  const maxLength = Math.max(left.preRelease.length, right.preRelease.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left.preRelease[index];
    const rightPart = right.preRelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const diff = compareIdentifiers(leftPart, rightPart);
    if (diff !== 0) return diff;
  }
  return 0;
}

function normalizeManifest(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid update manifest.');
  }

  const version = typeof raw.version === 'string' ? raw.version.trim() : '';
  const channel = typeof raw.channel === 'string' ? raw.channel.trim().toLowerCase() : '';
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';

  if (!version) throw new Error('Update manifest is missing version.');
  if (!UPDATE_CHANNELS.includes(channel)) throw new Error('Update manifest has an unsupported channel.');
  if (!url) throw new Error('Update manifest is missing url.');
  if (!notes) throw new Error('Update manifest is missing notes.');

  return {
    version,
    channel,
    mandatory: raw.mandatory === true,
    pubDate: typeof raw.pub_date === 'string' ? raw.pub_date.trim() : '',
    url,
    title: typeof raw.title === 'string' ? raw.title.trim() : '',
    notes
  };
}

function isManifestCompatible(currentChannel, manifestChannel) {
  if (currentChannel === 'beta') {
    return manifestChannel === 'beta' || manifestChannel === 'release';
  }
  return manifestChannel === 'release';
}

class UpdateService {
  constructor(options) {
    this.appVersion = options.appVersion;
    this.loadSettings = options.loadSettings;
    this.saveSettings = options.saveSettings;
    this.emitToRenderer = options.emitToRenderer;
    this.openExternal = options.openExternal;
    this.fetchImpl = options.fetchImpl || global.fetch;
    this.manifestUrls = options.manifestUrls || DEFAULT_MANIFEST_URLS;
    this.startupDelayMs = options.startupDelayMs ?? DEFAULT_STARTUP_DELAY_MS;
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.currentChannel = detectUpdateChannel(this.appVersion);
    this.timer = null;
    this.interval = null;
    this.inFlight = null;
    this.pendingUpdate = null;
  }

  async getCurrentInfo() {
    const settings = await this.loadSettings();
    const skippedVersion = typeof settings?.updates?.skippedVersion === 'string' ? settings.updates.skippedVersion : '';
    return {
      currentVersion: this.appVersion,
      currentChannel: this.currentChannel,
      skippedVersion
    };
  }

  initialize() {
    this.dispose();
    this.timer = setTimeout(() => {
      void this.checkForUpdates({ silent: true });
      this.interval = setInterval(() => {
        void this.checkForUpdates({ silent: true });
      }, this.checkIntervalMs);
    }, this.startupDelayMs);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.interval) clearInterval(this.interval);
    this.timer = null;
    this.interval = null;
  }

  async skipVersion(version) {
    const rawSettings = (await this.loadSettings()) || {};
    const nextSettings = {
      ...rawSettings,
      updates: {
        ...(rawSettings.updates || {}),
        skippedVersion: String(version || '').trim()
      }
    };
    await this.saveSettings(nextSettings);
    return { ok: true, skippedVersion: nextSettings.updates.skippedVersion };
  }

  async openUpdatePage(url) {
    await this.openExternal(url);
    return { ok: true };
  }

  async checkForUpdates({ silent = false } = {}) {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.#performCheck({ silent }).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async #performCheck({ silent }) {
    const settings = (await this.loadSettings()) || {};
    const skippedVersion = typeof settings?.updates?.skippedVersion === 'string' ? settings.updates.skippedVersion : '';

    try {
      const manifests = await this.#loadCandidateManifests();
      const compatible = manifests
        .filter((manifest) => isManifestCompatible(this.currentChannel, manifest.channel))
        .sort((left, right) => compareVersions(right.version, left.version));

      const latest = compatible[0];
      const hasUpdate = Boolean(latest) && compareVersions(latest.version, this.appVersion) > 0;

      const result = {
        currentVersion: this.appVersion,
        currentChannel: this.currentChannel,
        latest: hasUpdate ? latest : undefined,
        hasUpdate,
        skippedVersion
      };

      if (hasUpdate && latest) {
        this.pendingUpdate = latest;
        const shouldNotify = !silent || latest.version !== skippedVersion;
        if (shouldNotify) {
          this.emitToRenderer('app:update-available', {
            source: silent ? 'automatic' : 'manual',
            manifest: latest,
            currentVersion: this.appVersion,
            currentChannel: this.currentChannel,
            skippedVersion
          });
        }
      }

      return result;
    } catch (error) {
      return {
        currentVersion: this.appVersion,
        currentChannel: this.currentChannel,
        latest: undefined,
        hasUpdate: false,
        skippedVersion,
        error: error instanceof Error ? error.message : 'Could not check for updates.'
      };
    }
  }

  async #loadCandidateManifests() {
    const channelsToCheck = this.currentChannel === 'beta' ? ['beta', 'release'] : ['release'];
    const results = await Promise.all(
      channelsToCheck.map(async (channel) => {
        const url = this.manifestUrls[channel];
        const response = await this.fetchImpl(url, { headers: { 'cache-control': 'no-cache' } });
        if (!response.ok) {
          throw new Error(`Update source for ${channel} returned ${response.status}.`);
        }
        const text = await response.text();
        return normalizeManifest(parseToml(text));
      })
    );
    return results.filter(Boolean);
  }
}

module.exports = {
  UpdateService,
  compareVersions,
  detectUpdateChannel,
  normalizeManifest,
  isManifestCompatible
};
