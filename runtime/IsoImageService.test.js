import { describe, expect, it, vi } from 'vitest';
import { IsoImageService } from './IsoImageService';

describe('IsoImageService', () => {
  it('uses mkisofs when available', async () => {
    const execFileImpl = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const fsImpl = {
      mkdir: vi.fn(async () => undefined),
      access: vi.fn(async () => undefined),
      mkdtemp: vi.fn(async () => '/tmp/sanaka-iso-123')
    };
    const service = new IsoImageService({
      execFileImpl,
      fsImpl,
      whichImpl: vi.fn(async (binary) => (binary === 'mkisofs' ? '/opt/homebrew/bin/mkisofs' : null))
    });

    const result = await service.createFromDirectory({
      sourceDirectory: '/tmp/source',
      outputPath: '/tmp/out/test.iso',
      volumeLabel: 'SANAKA_TEST'
    });

    expect(result).toEqual({
      path: '/tmp/out/test.iso',
      tool: 'mkisofs'
    });
    expect(execFileImpl).toHaveBeenCalledWith('/opt/homebrew/bin/mkisofs', [
      '-V',
      'SANAKA_TEST',
      '-J',
      '-r',
      '-o',
      '/tmp/out/test.iso',
      '/tmp/source'
    ]);
  });

  it('falls back to hdiutil on macOS when mkisofs is unavailable', async () => {
    const execFileImpl = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const fsImpl = {
      mkdir: vi.fn(async () => undefined),
      access: vi.fn(async () => undefined),
      mkdtemp: vi.fn(async () => '/tmp/sanaka-iso-123')
    };
    const service = new IsoImageService({
      execFileImpl,
      fsImpl,
      platform: 'darwin',
      whichImpl: vi.fn(async (binary) => (binary === 'hdiutil' ? '/usr/bin/hdiutil' : null))
    });

    const result = await service.createFromDirectory({
      sourceDirectory: '/tmp/source',
      outputPath: '/tmp/out/test.iso',
      volumeLabel: 'SANAKA_TEST'
    });

    expect(result).toEqual({
      path: '/tmp/out/test.iso',
      tool: 'hdiutil'
    });
    expect(execFileImpl).toHaveBeenCalledWith('/usr/bin/hdiutil', [
      'makehybrid',
      '-iso',
      '-joliet',
      '-default-volume-name',
      'SANAKA_TEST',
      '-o',
      '/tmp/out/test.iso',
      '/tmp/source'
    ]);
  });
});
