import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AppStoreProvider } from './store/AppStore';

const runtimeEnvironment = {
  available: true,
  binaries: {
    x86_64: { name: 'qemu-system-x86_64', found: true, path: '/usr/bin/qemu-system-x86_64', version: 'QEMU emulator version 9.0.0' },
    aarch64: { name: 'qemu-system-aarch64', found: true, path: '/usr/bin/qemu-system-aarch64', version: 'QEMU emulator version 9.0.0' },
    i386: { name: 'qemu-system-i386', found: true, path: '/usr/bin/qemu-system-i386', version: 'QEMU emulator version 9.0.0' },
    arm: { name: 'qemu-system-arm', found: true, path: '/usr/bin/qemu-system-arm', version: 'QEMU emulator version 9.0.0' },
    riscv64: { name: 'qemu-system-riscv64', found: true, path: '/usr/bin/qemu-system-riscv64', version: 'QEMU emulator version 9.0.0' },
    ppc: { name: 'qemu-system-ppc', found: true, path: '/usr/bin/qemu-system-ppc', version: 'QEMU emulator version 9.0.0' },
    ppc64: { name: 'qemu-system-ppc64', found: true, path: '/usr/bin/qemu-system-ppc64', version: 'QEMU emulator version 9.0.0' },
    qemuImg: { name: 'qemu-img', found: true, path: '/usr/bin/qemu-img', version: 'QEMU emulator version 9.0.0' }
  },
  accelerators: ['hvf', 'tcg'],
  availableSystemTargets: ['x86_64'],
  checkedAt: new Date().toISOString(),
  platform: 'darwin',
  arch: 'arm64',
  installHint: ''
};

function mockElectronApi() {
  window.electronAPI = {
    files: {
      openMachineBundle: vi.fn(async () => null),
      openSaka: vi.fn(async () => null),
      createMachineBundle: vi.fn(async () => ({ path: '/tmp/example.saka', configPath: '/tmp/example.saka/machine.svm' })),
      readSaka: vi.fn(async () => null),
      saveSaka: vi.fn(async () => ({ path: '/tmp/example.saka', configPath: '/tmp/example.saka/machine.svm' })),
      saveSakaAs: vi.fn(async () => ({ path: '/tmp/example.saka', configPath: '/tmp/example.saka/machine.svm' })),
      trashMachineBundle: vi.fn(async () => ({ ok: true as const })),
      renamePath: vi.fn(async () => ({ ok: true as const })),
      copyPath: vi.fn(async () => ({ ok: true as const })),
      openPath: vi.fn(async () => ({ ok: true as const })),
      pathExists: vi.fn(async () => true)
    },
    dialogs: {
      pickDisk: vi.fn(async () => null),
      pickIso: vi.fn(async () => null)
    },
    disks: {
      getInfo: vi.fn(async () => ({ path: '/tmp/disk.qcow2', format: 'qcow2' as const, virtualSize: 0, actualSize: 0 })),
      create: vi.fn(async () => ({ ok: true, path: '/tmp/disk.qcow2' })),
      prepareManaged: vi.fn(async () => ({ ok: true, path: '/tmp/example.saka/Disks/disk.qcow2', relativePath: 'Disks/disk.qcow2' })),
      resize: vi.fn(async () => ({ ok: true, path: '/tmp/disk.qcow2' })),
      convert: vi.fn(async () => ({ ok: true, path: '/tmp/disk-converted.qcow2' })),
      reclaimSpace: vi.fn(async () => ({ ok: true, path: '/tmp/disk.qcow2', reclaimedBytes: 0 })),
      listLocalImages: vi.fn(async () => ({ images: [] }))
    },
    settings: {
      load: vi.fn(async () => null),
      save: vi.fn(async (settings) => settings)
    },
    recents: {
      list: vi.fn(async () => [
        {
          id: 'machine-1',
          title: 'Windows Dev Box',
          path: '/tmp/windows-dev-box.saka',
          kind: 'machine',
          templateLabel: 'Windows 10/11',
          updatedAt: '2026-06-02T12:00:00.000Z',
          status: 'saved'
        }
      ]),
      push: vi.fn(async (entry) => [entry]),
      remove: vi.fn(async () => [])
    },
    runtime: {
      detectQemu: vi.fn(async () => runtimeEnvironment),
      getRuntimeEnvironment: vi.fn(async () => runtimeEnvironment),
      startMachine: vi.fn(async () => ({
        ok: false,
        error: 'qemu-system-x86_64: -accel kvm: invalid accelerator kvm'
      })),
      stopMachine: vi.fn(async () => ({ ok: true })),
      forceStopMachine: vi.fn(async () => ({ ok: true })),
      resetMachine: vi.fn(async () => ({ ok: true })),
      changeMedia: vi.fn(async () => ({ ok: true })),
      getMachineState: vi.fn(async () => null),
      listRunningMachines: vi.fn(async () => []),
      onRuntimeEvent: vi.fn(() => () => undefined)
    },
    updater: {
      getCurrentInfo: vi.fn(async () => ({ currentVersion: '1.0.0', currentChannel: 'release' as const, skippedVersion: '' })),
      checkForUpdates: vi.fn(async () => ({ currentVersion: '1.0.0', currentChannel: 'release' as const, hasUpdate: false, skippedVersion: '' })),
      skipVersion: vi.fn(async () => ({ ok: true as const, skippedVersion: '1.0.0' })),
      openUpdatePage: vi.fn(async () => ({ ok: true as const })),
      onUpdateAvailable: vi.fn(() => () => undefined)
    },
    app: {
      getMetadata: vi.fn(async () => ({ name: 'Sanaka', version: '1.0.0', platform: 'darwin', arch: 'x64', userDataPath: '/tmp', documentsPath: '/tmp/Documents', defaultMachineDirectory: '/tmp/Documents/Sanaka' })),
      openExternal: vi.fn(async () => ({ ok: true as const })),
      onOpenSaka: vi.fn(() => () => undefined),
      onOpenAbout: vi.fn(() => () => undefined),
      onOpenSettings: vi.fn(() => () => undefined)
    }
  };
}

describe('App', () => {
  beforeEach(() => {
    mockElectronApi();
    window.location.hash = '#/';
  });

  it('shows a global start failure modal when runtime start fails', async () => {
    const user = userEvent.setup();

    render(
      <AppStoreProvider>
        <App />
      </AppStoreProvider>
    );

    await user.click(await screen.findByRole('button', { name: '启动虚拟机' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('启动失败')).toBeInTheDocument();
    expect(screen.getByText('无法启动虚拟机。下面是 QEMU 返回的原始错误。')).toBeInTheDocument();
    expect(screen.getByText('QEMU / Runtime')).toBeInTheDocument();
    expect(screen.getByText('qemu-system-x86_64: -accel kvm: invalid accelerator kvm')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
