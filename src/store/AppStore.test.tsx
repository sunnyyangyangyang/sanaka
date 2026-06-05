import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStoreProvider, useAppStore } from './AppStore';
import { createMachineFromTemplate } from '../domain/templates';
import { serializeSakaMachine } from '../lib/saka';

const machinePath = '/tmp/windows-dev-box.saka';
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
  const machine = createMachineFromTemplate('win11');
  machine.id = 'machine-1';
  machine.title = 'Windows Dev Box';
  machine.system.accelerator = 'kvm';

  const saveSaka = vi.fn(async () => ({ path: machinePath, configPath: `${machinePath}/machine.svm` }));
  const startMachine = vi.fn(async () => ({ ok: true }));

  window.electronAPI = {
    files: {
      openMachineBundle: vi.fn(async () => null),
      openSaka: vi.fn(async () => null),
      createMachineBundle: vi.fn(async () => ({ path: machinePath, configPath: `${machinePath}/machine.svm` })),
      readSaka: vi.fn(async () => ({
        path: machinePath,
        configPath: `${machinePath}/machine.svm`,
        content: serializeSakaMachine(machine),
        legacySingleFile: false
      })),
      saveSaka,
      saveSakaAs: vi.fn(async () => ({ path: machinePath, configPath: `${machinePath}/machine.svm` })),
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
      prepareManaged: vi.fn(async () => ({ ok: true, path: `${machinePath}/Disks/disk.qcow2`, relativePath: 'Disks/disk.qcow2' })),
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
      list: vi.fn(async () => []),
      push: vi.fn(async (entry) => [entry]),
      remove: vi.fn(async () => [])
    },
    runtime: {
      detectQemu: vi.fn(async () => runtimeEnvironment),
      getRuntimeEnvironment: vi.fn(async () => runtimeEnvironment),
      startMachine,
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
      getMetadata: vi.fn(async () => ({ name: 'Sanaka', version: '1.0.0', platform: 'darwin', arch: 'arm64', userDataPath: '/tmp', documentsPath: '/tmp/Documents', defaultMachineDirectory: '/tmp/Documents/Sanaka' })),
      openExternal: vi.fn(async () => ({ ok: true as const })),
      onOpenSaka: vi.fn(() => () => undefined),
      onOpenAbout: vi.fn(() => () => undefined),
      onOpenSettings: vi.fn(() => () => undefined)
    }
  };

  return { saveSaka, startMachine };
}

function StoreHarness() {
  const { ready, draft, openSakaByPath, updateDraft, startMachine } = useAppStore();

  if (!ready) {
    return <div>loading</div>;
  }

  return (
    <div>
      <button type="button" onClick={() => void openSakaByPath(machinePath)}>
        open
      </button>
      <button
        type="button"
        onClick={() =>
          updateDraft((current) => ({
            ...current,
            system: {
              ...current.system,
              accelerator: 'tcg'
            }
          }))
        }
        disabled={!draft}
      >
        set-tcg
      </button>
      <button type="button" onClick={() => void startMachine(machinePath)} disabled={!draft}>
        start
      </button>
    </div>
  );
}

describe('AppStore startMachine', () => {
  beforeEach(() => {
    mockElectronApi();
  });

  it('saves a dirty machine before starting so runtime reads the updated accelerator', async () => {
    const { saveSaka, startMachine } = mockElectronApi();
    const user = userEvent.setup();

    render(
      <AppStoreProvider>
        <StoreHarness />
      </AppStoreProvider>
    );

    await user.click(await screen.findByRole('button', { name: 'open' }));
    await user.click(await screen.findByRole('button', { name: 'set-tcg' }));
    await user.click(screen.getByRole('button', { name: 'start' }));

    await waitFor(() => {
      expect(saveSaka).toHaveBeenCalledTimes(1);
      expect(startMachine).toHaveBeenCalledWith(machinePath);
    });

    const firstSaveCall = saveSaka.mock.calls[0] as unknown[] | undefined;
    expect(firstSaveCall).toBeTruthy();
    const savedContent = firstSaveCall?.[1];
    expect(typeof savedContent).toBe('string');
    expect(savedContent).toContain('accelerator = "tcg"');
  });
});
