import { describe, expect, it, vi } from 'vitest';
import { SanakaToolsService } from './SanakaToolsService';

describe('SanakaToolsService', () => {
  it('reuses a bundled iso when present', async () => {
    const fsImpl = {
      access: vi.fn(async (targetPath) => {
        if (String(targetPath) === '/tmp/app/sanaka-tools.iso') {
          return undefined;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    };
    const isoService = {
      createTemporaryWorkspace: vi.fn(),
      createFromDirectory: vi.fn()
    };
    const service = new SanakaToolsService({
      fsImpl,
      isoService,
      app: {
        getAppPath: () => '/tmp/app',
        getPath: () => '/tmp/userdata'
      }
    });

    const result = await service.ensureBundledIso();

    expect(result).toBe('/tmp/app/sanaka-tools.iso');
    expect(isoService.createFromDirectory).not.toHaveBeenCalled();
  });

  it('generates an iso when no bundled resource exists', async () => {
    const writes = [];
    const fsImpl = {
      access: vi.fn(async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }),
      readFile: vi.fn(async () => Buffer.from('placeholder')),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async (filePath) => {
        writes.push(String(filePath));
      }),
      rm: vi.fn(async () => undefined)
    };
    const isoService = {
      createTemporaryWorkspace: vi.fn(async () => '/tmp/workspace-tools'),
      createFromDirectory: vi.fn(async () => ({ path: '/tmp/userdata/generated-tools-iso/sanaka-tools.iso', tool: 'mkisofs' }))
    };
    const service = new SanakaToolsService({
      fsImpl,
      isoService,
      app: {
        getAppPath: () => '/tmp/app',
        getPath: () => '/tmp/userdata'
      }
    });

    const result = await service.ensureBundledIso();

    expect(result).toBe('/tmp/userdata/generated-tools-iso/sanaka-tools.iso');
    expect(isoService.createFromDirectory).toHaveBeenCalledTimes(1);
    expect(writes.some((item) => item.endsWith('autorun.inf'))).toBe(true);
    expect(writes.some((item) => item.endsWith('setup.exe'))).toBe(true);
    expect(writes.some((item) => item.endsWith('sanaka_clipboard.exe'))).toBe(true);
  });
});
