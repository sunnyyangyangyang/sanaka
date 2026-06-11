import { afterEach, describe, expect, it } from 'vitest';
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

  afterEach(async () => {
    while (services.length > 0) {
      const service = services.pop();
      await service.stop();
    }
  });

  it('starts a local web mode server and returns a usable URL', async () => {
    const service = new WebModeService({
      appName: 'Sanaka',
      appVersion: '0.0.3-beta',
      getRuntimeSummary: async () => ({
        qemuAvailable: true,
        runningMachines: 2
      })
    });
    services.push(service);

    const state = await service.start();

    expect(state.active).toBe(true);
    expect(state.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(state.port).toBeGreaterThan(0);
  });

  it('serves an html status page', async () => {
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

    expect(result.status).toBe(200);
    expect(result.headers.get('content-type')).toContain('text/html');
    expect(result.text).toContain('Sanaka 已打开网页模式');
    expect(result.text).toContain('0.0.3-beta');
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
});
