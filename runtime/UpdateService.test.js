import { describe, expect, it, vi } from 'vitest';
import { UpdateService, compareVersions, detectUpdateChannel, isManifestCompatible } from './UpdateService';

describe('UpdateService helpers', () => {
  it('detects beta channel from version', () => {
    expect(detectUpdateChannel('0.0.1-beta')).toBe('beta');
    expect(detectUpdateChannel('0.0.1')).toBe('release');
  });

  it('compares release higher than beta prerelease', () => {
    expect(compareVersions('0.0.1', '0.0.1-beta')).toBeGreaterThan(0);
    expect(compareVersions('0.0.3-beta', '0.0.1')).toBeGreaterThan(0);
  });

  it('checks compatible channels', () => {
    expect(isManifestCompatible('release', 'release')).toBe(true);
    expect(isManifestCompatible('release', 'beta')).toBe(false);
    expect(isManifestCompatible('beta', 'beta')).toBe(true);
    expect(isManifestCompatible('beta', 'release')).toBe(true);
  });
});

describe('UpdateService', () => {
  it('prefers newer release manifest for beta builds', async () => {
    const fetchImpl = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      text: async () =>
        url.includes('beta')
          ? 'version = "0.0.3-beta"\nchannel = "beta"\nmandatory = false\npub_date = "2026-06-05"\nurl = "https://example.com/beta"\nnotes = """\nbeta\n"""'
          : 'version = "0.0.3"\nchannel = "release"\nmandatory = false\npub_date = "2026-06-05"\nurl = "https://example.com/release"\nnotes = """\nrelease\n"""'
    }));
    const emitToRenderer = vi.fn();
    const service = new UpdateService({
      appVersion: '0.0.1-beta',
      loadSettings: vi.fn(async () => ({ updates: { skippedVersion: '' } })),
      saveSettings: vi.fn(async (value) => value),
      emitToRenderer,
      openExternal: vi.fn(async () => ({ ok: true })),
      fetchImpl
    });

    const result = await service.checkForUpdates({ silent: true });
    expect(result.hasUpdate).toBe(true);
    expect(result.latest?.version).toBe('0.0.3');
    expect(emitToRenderer).toHaveBeenCalledWith('app:update-available', expect.objectContaining({ source: 'automatic' }));
  });

  it('suppresses automatic reminder for skipped version', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'version = "0.0.3"\nchannel = "release"\nmandatory = false\npub_date = "2026-06-05"\nurl = "https://example.com/release"\nnotes = """\nrelease\n"""'
    }));
    const emitToRenderer = vi.fn();
    const service = new UpdateService({
      appVersion: '0.0.1',
      loadSettings: vi.fn(async () => ({ updates: { skippedVersion: '0.0.3' } })),
      saveSettings: vi.fn(async (value) => value),
      emitToRenderer,
      openExternal: vi.fn(async () => ({ ok: true })),
      fetchImpl
    });

    const result = await service.checkForUpdates({ silent: true });
    expect(result.hasUpdate).toBe(true);
    expect(emitToRenderer).not.toHaveBeenCalled();
  });

  it('can override remote version for debug checks', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'version = "0.0.3"\nchannel = "release"\nmandatory = false\npub_date = "2026-06-05"\nurl = "https://example.com/release"\nnotes = """\nrelease\n"""'
    }));
    const service = new UpdateService({
      appVersion: '0.0.1',
      loadSettings: vi.fn(async () => ({ updates: { skippedVersion: '' } })),
      saveSettings: vi.fn(async (value) => value),
      emitToRenderer: vi.fn(),
      openExternal: vi.fn(async () => ({ ok: true })),
      fetchImpl,
      forcedRemoteVersion: '9.9.9'
    });

    const result = await service.checkForUpdates({ silent: true });
    expect(result.hasUpdate).toBe(true);
    expect(result.latest?.version).toBe('9.9.9');
  });
});
