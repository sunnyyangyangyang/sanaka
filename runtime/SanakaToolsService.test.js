import { describe, expect, it, vi } from 'vitest';
import { SanakaToolsService } from './SanakaToolsService';

describe('SanakaToolsService', () => {
  it('reuses a bundled iso when present', async () => {
    const fsImpl = {
      access: vi.fn(async (targetPath) => {
        if (String(targetPath) === '/tmp/app/iso/sanaka-tools.iso') {
          return undefined;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      })
    };
    const service = new SanakaToolsService({
      fsImpl,
      app: {
        getAppPath: () => '/tmp/app',
        getPath: () => '/tmp/userdata'
      }
    });

    const result = await service.ensureBundledIso();

    expect(result).toBe('/tmp/app/iso/sanaka-tools.iso');
  });

  it('throws a clear error when no bundled resource exists', async () => {
    const fsImpl = {
      access: vi.fn(async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      })
    };
    const service = new SanakaToolsService({
      fsImpl,
      app: {
        getAppPath: () => '/tmp/app',
        getPath: () => '/tmp/userdata'
      }
    });

    await expect(service.ensureBundledIso()).rejects.toThrow(
      'Missing Sanaka tools ISO: iso/sanaka-tools.iso. Rebuild the ISO before using guest enhancements.'
    );
  });
});
