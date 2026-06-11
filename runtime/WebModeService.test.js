import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { WebModeService } from './WebModeService';

async function fetchText(url) {
  const response = await fetch(url);
  return {
    status: response.status,
    text: await response.text(),
    headers: response.headers
  };
}

describe('WebModeService', () => {
  const services = [];
  const tempDirs = [];

  afterEach(async () => {
    while (services.length > 0) {
      const service = services.pop();
      await service.stop();
    }
    while (tempDirs.length > 0) {
      await fs.rm(tempDirs.pop(), { recursive: true, force: true });
    }
  });

  it('starts a local web mode server and returns a usable URL', async () => {
    const service = new WebModeService({
      appName: 'Sanaka',
      appVersion: '0.0.3-beta',
      host: '127.0.0.1',
      getRuntimeSummary: async () => ({
        qemuAvailable: true,
        runningMachines: 2
      })
    });
    services.push(service);

    const state = await service.start();

    expect(state.active).toBe(true);
    expect(state.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(state.localUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(typeof state.networkUrl === 'string' || state.networkUrl === null).toBe(true);
    expect(state.port).toBeGreaterThan(0);
  });

  it('returns 500 for the root page when no dist directory is configured', async () => {
    const service = new WebModeService({
      appName: 'Sanaka',
      appVersion: '0.0.3-beta',
      getRuntimeSummary: async () => ({
        qemuAvailable: false,
        runningMachines: 0
      })
    });
    services.push(service);

    const state = await service.start();
    const result = await fetchText(state.url);

    expect(result.status).toBe(500);
    expect(result.text).toContain('Missing dist directory.');
  });

  it('serves a machine-readable status endpoint', async () => {
    const service = new WebModeService({
      appName: 'Sanaka',
      appVersion: '0.0.3-beta',
      getRuntimeSummary: async () => ({
        qemuAvailable: true,
        runningMachines: 1
      })
    });
    services.push(service);

    const state = await service.start();
    const response = await fetch(`${state.url}api/status`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.appName).toBe('Sanaka');
    expect(payload.runtimeSummary.runningMachines).toBe(1);
    expect(payload.runtimeSummary.qemuAvailable).toBe(true);
  });

  it('serves the existing web entry and injects the web bridge', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanaka-webmode-'));
    tempDirs.push(tempDir);
    await fs.mkdir(path.join(tempDir, 'assets'));
    await fs.writeFile(
      path.join(tempDir, 'web.html'),
      '<!doctype html><html><head><title>Sanaka</title></head><body><div id="root"></div></body></html>',
      'utf8'
    );

    const service = new WebModeService({
      appName: 'Sanaka',
      appVersion: '0.0.3-beta',
      distDir: tempDir,
      invokeHandlers: {
        settings: {
          load: async () => ({ language: 'zh-CN' })
        }
      }
    });
    services.push(service);

    const state = await service.start();
    const result = await fetchText(state.url);

    expect(result.status).toBe(200);
    expect(result.text).toContain('<script src="./web-bridge.js"></script>');
    expect(result.text).toContain('<div id="root"></div>');
  });

  it('handles rpc through the electron api contract', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanaka-webmode-'));
    tempDirs.push(tempDir);
    await fs.writeFile(path.join(tempDir, 'web.html'), '<!doctype html><html><head></head><body></body></html>', 'utf8');

    const service = new WebModeService({
      appName: 'Sanaka',
      appVersion: '0.0.3-beta',
      distDir: tempDir,
      invokeHandlers: {
        settings: {
          load: async () => ({ language: 'zh-CN', theme: 'light' })
        }
      }
    });
    services.push(service);

    const state = await service.start();
    const response = await fetch(`${state.url}api/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'settings:load',
        args: []
      })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.result.language).toBe('zh-CN');
  });

  it('rewrites file urls through the local file proxy bridge script', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanaka-webmode-'));
    tempDirs.push(tempDir);
    await fs.writeFile(path.join(tempDir, 'web.html'), '<!doctype html><html><head></head><body></body></html>', 'utf8');

    const service = new WebModeService({
      appName: 'Sanaka',
      appVersion: '0.0.3-beta',
      distDir: tempDir
    });
    services.push(service);

    const state = await service.start();
    const result = await fetchText(`${state.url}web-bridge.js`);

    expect(result.status).toBe(200);
    expect(result.text).toContain("/api/file?url=");
  });
});
