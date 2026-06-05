import { describe, expect, it } from 'vitest';
import { QemuCommandBuilder, chooseAccelerator } from './QemuCommandBuilder';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('chooseAccelerator', () => {
  it('keeps an explicitly requested accelerator so QEMU can report the raw startup error', () => {
    expect(
      chooseAccelerator('kvm', 'darwin', 'x86_64', 'arm64', ['hvf', 'tcg'])
    ).toBe('kvm');
  });

  it('still falls back to the platform default when no accelerator is specified', () => {
    expect(
      chooseAccelerator(null, 'darwin', 'aarch64', 'arm64', ['hvf', 'tcg'])
    ).toBe('hvf');
  });
});

describe('QemuCommandBuilder machine types', () => {
  it('uses the dedicated qemu-system-arm binary for arm guests', () => {
    const builder = new QemuCommandBuilder();
    const result = builder.build({
      machine: {
        title: 'ARM Guest',
        system: {
          arch: 'arm',
          machine_type: 'virt',
          accelerator: 'tcg',
          boot_order: 'disk',
          memory_mib: 512,
          cpu_cores: 1,
          sound_card: 'sb16',
          uefi: false
        },
        media: { iso: '', floppy: '' },
        disks: [],
        network: { enabled: false, mode: 'user', card: 'rtl8139' },
        display: { frontend: 'sanaka', gpu: 'std', sanaka: { backend: 'vnc', scale_mode: 'fit', clipboard: true } },
        peripherals: { usb_tablet: true },
        advanced: { audio_backend: 'auto', qemu_args: '' }
      },
      environment: {
        binaries: {
          arm: { found: true, path: '/usr/bin/qemu-system-arm' }
        },
        accelerators: ['tcg']
      },
      runtimePaths: {
        qmp: { transport: 'tcp', host: '127.0.0.1', port: 47001 }
      },
      displayConfig: {
        port: 5901,
        websocketPort: 5701,
        displayNumber: 1
      },
      host: {
        platform: 'darwin',
        arch: 'arm64'
      }
    });

    expect(result.binaryPath).toBe('/usr/bin/qemu-system-arm');
  });

  it('emits -machine q35 for x86 machines configured with q35', () => {
    const builder = new QemuCommandBuilder();
    const result = builder.build({
      machine: {
        title: 'Test Machine',
        system: {
          arch: 'x86_64',
          machine_type: 'q35',
          accelerator: 'tcg',
          boot_order: 'cdrom',
          memory_mib: 2048,
          cpu_cores: 2,
          sound_card: 'intel-hda'
        },
        media: { iso: '', floppy: '' },
        disks: [],
        network: { enabled: false, mode: 'user', card: 'virtio-net-pci' },
        display: { frontend: 'sanaka', gpu: 'virtio-vga', sanaka: { backend: 'vnc', scale_mode: 'fit', clipboard: true } },
        peripherals: { usb_tablet: true },
        advanced: { audio_backend: 'auto', qemu_args: '' }
      },
      environment: {
        binaries: {
          x86_64: { found: true, path: '/usr/bin/qemu-system-x86_64' }
        },
        accelerators: ['tcg']
      },
      runtimePaths: {
        qmp: { transport: 'tcp', host: '127.0.0.1', port: 47001 }
      },
      displayConfig: {
        port: 5901,
        websocketPort: 5701,
        displayNumber: 1
      },
      host: {
        platform: 'darwin',
        arch: 'arm64'
      }
    });

    expect(result.args).toContain('-machine');
    expect(result.args).toContain('q35');
  });

  it('emits -machine pc for x86 machines configured with pc', () => {
    const builder = new QemuCommandBuilder();
    const result = builder.build({
      machine: {
        title: 'Test Machine',
        system: {
          arch: 'i386',
          machine_type: 'pc',
          accelerator: 'tcg',
          boot_order: 'cdrom',
          memory_mib: 512,
          cpu_cores: 1,
          sound_card: 'ac97'
        },
        media: { iso: '', floppy: '' },
        disks: [],
        network: { enabled: false, mode: 'user', card: 'rtl8139' },
        display: { frontend: 'sanaka', gpu: 'cirrus-vga', sanaka: { backend: 'vnc', scale_mode: 'fit', clipboard: true } },
        peripherals: { usb_tablet: true },
        advanced: { audio_backend: 'auto', qemu_args: '' }
      },
      environment: {
        binaries: {
          i386: { found: true, path: '/usr/bin/qemu-system-i386' }
        },
        accelerators: ['tcg']
      },
      runtimePaths: {
        qmp: { transport: 'tcp', host: '127.0.0.1', port: 47001 }
      },
      displayConfig: {
        port: 5901,
        websocketPort: 5701,
        displayNumber: 1
      },
      host: {
        platform: 'darwin',
        arch: 'arm64'
      }
    });

    expect(result.args).toContain('-machine');
    expect(result.args).toContain('pc');
  });

  it('maps sata disks through an AHCI controller', () => {
    const builder = new QemuCommandBuilder();
    const result = builder.build({
      machine: {
        title: 'Windows 10',
        system: {
          arch: 'x86_64',
          machine_type: 'q35',
          accelerator: 'tcg',
          boot_order: 'disk',
          memory_mib: 2048,
          cpu_cores: 2,
          sound_card: 'intel-hda',
          uefi: false
        },
        media: { iso: '', floppy: '' },
        disks: [
          {
            id: 'disk0',
            path: '/tmp/windows10.qcow2',
            format: 'qcow2',
            interface: 'sata',
            boot: true,
            readonly: false
          }
        ],
        network: { enabled: true, mode: 'user', card: 'rtl8139' },
        display: { frontend: 'sanaka', gpu: 'std', sanaka: { backend: 'vnc', scale_mode: 'fit', clipboard: true } },
        peripherals: { usb_tablet: true },
        advanced: { audio_backend: 'auto', qemu_args: '' }
      },
      environment: {
        binaries: {
          x86_64: { found: true, path: '/usr/bin/qemu-system-x86_64' }
        },
        accelerators: ['tcg']
      },
      runtimePaths: {
        runtimeDir: '/tmp/sanaka-runtime',
        qmp: { transport: 'tcp', host: '127.0.0.1', port: 47001 }
      },
      displayConfig: {
        port: 5901,
        websocketPort: 5701,
        displayNumber: 1
      },
      host: {
        platform: 'darwin',
        arch: 'arm64'
      }
    });

    expect(result.args).toContain('ich9-ahci,id=ahci0');
    expect(result.args).toContain('ide-hd,drive=drive0,bus=ahci0.0');
  });

  it('adds pflash firmware drives when UEFI is enabled', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sanaka-qemu-'));
    const fakeBinaryPath = path.join(tempRoot, 'bin', 'qemu-system-x86_64');
    const shareDir = path.join(tempRoot, 'share', 'qemu');
    fs.mkdirSync(path.dirname(fakeBinaryPath), { recursive: true });
    fs.mkdirSync(shareDir, { recursive: true });
    fs.writeFileSync(fakeBinaryPath, '');
    fs.writeFileSync(path.join(shareDir, 'edk2-x86_64-code.fd'), 'code');
    fs.writeFileSync(path.join(shareDir, 'edk2-i386-vars.fd'), 'vars');

    const builder = new QemuCommandBuilder();
    const runtimeDir = path.join(tempRoot, 'runtime');
    fs.mkdirSync(runtimeDir, { recursive: true });

    const result = builder.build({
      machine: {
        title: 'UEFI Machine',
        system: {
          arch: 'x86_64',
          machine_type: 'q35',
          accelerator: 'tcg',
          boot_order: 'disk',
          memory_mib: 2048,
          cpu_cores: 2,
          sound_card: 'intel-hda',
          uefi: true
        },
        media: { iso: '', floppy: '' },
        disks: [],
        network: { enabled: false, mode: 'user', card: 'rtl8139' },
        display: { frontend: 'sanaka', gpu: 'std', sanaka: { backend: 'vnc', scale_mode: 'fit', clipboard: true } },
        peripherals: { usb_tablet: true },
        advanced: { audio_backend: 'auto', qemu_args: '' }
      },
      environment: {
        binaries: {
          x86_64: { found: true, path: fakeBinaryPath }
        },
        accelerators: ['tcg']
      },
      runtimePaths: {
        runtimeDir,
        qmp: { transport: 'tcp', host: '127.0.0.1', port: 47001 }
      },
      displayConfig: {
        port: 5901,
        websocketPort: 5701,
        displayNumber: 1
      },
      host: {
        platform: 'darwin',
        arch: 'arm64'
      }
    });

    expect(result.args).toContain(`if=pflash,format=raw,readonly=on,file=${path.join(shareDir, 'edk2-x86_64-code.fd')}`);
    expect(result.args.some((value) => String(value).includes('uefi-x86_64-vars.fd'))).toBe(true);
  });

  it('resolves bundled Windows share firmware next to the embedded qemu directory', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sanaka-qemu-win-'));
    const fakeBinaryPath = path.join(tempRoot, 'qemu', 'qemu-system-x86_64.exe');
    const shareDir = path.join(tempRoot, 'qemu', 'share');
    fs.mkdirSync(path.dirname(fakeBinaryPath), { recursive: true });
    fs.mkdirSync(shareDir, { recursive: true });
    fs.writeFileSync(fakeBinaryPath, '');
    fs.writeFileSync(path.join(shareDir, 'edk2-x86_64-code.fd'), 'code');
    fs.writeFileSync(path.join(shareDir, 'edk2-i386-vars.fd'), 'vars');

    const builder = new QemuCommandBuilder();
    const runtimeDir = path.join(tempRoot, 'runtime');
    fs.mkdirSync(runtimeDir, { recursive: true });

    const result = builder.build({
      machine: {
        title: 'Windows Embedded QEMU',
        system: {
          arch: 'x86_64',
          machine_type: 'q35',
          accelerator: 'tcg',
          boot_order: 'disk',
          memory_mib: 2048,
          cpu_cores: 2,
          sound_card: 'intel-hda',
          uefi: true
        },
        media: { iso: '', floppy: '' },
        disks: [],
        network: { enabled: false, mode: 'user', card: 'rtl8139' },
        display: { frontend: 'sanaka', gpu: 'std', sanaka: { backend: 'vnc', scale_mode: 'fit', clipboard: true } },
        peripherals: { usb_tablet: true },
        advanced: { audio_backend: 'auto', qemu_args: '' }
      },
      environment: {
        binaries: {
          x86_64: { found: true, path: fakeBinaryPath }
        },
        accelerators: ['tcg']
      },
      runtimePaths: {
        runtimeDir,
        qmp: { transport: 'tcp', host: '127.0.0.1', port: 47001 }
      },
      displayConfig: {
        port: 5901,
        websocketPort: 5701,
        displayNumber: 1
      },
      host: {
        platform: 'win32',
        arch: 'x64'
      }
    });

    expect(result.args).toContain(`if=pflash,format=raw,readonly=on,file=${path.join(shareDir, 'edk2-x86_64-code.fd')}`);
  });
});
