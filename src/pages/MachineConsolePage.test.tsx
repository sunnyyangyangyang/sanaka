import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createMachineFromTemplate } from '../domain/templates';
import { serializeSakaMachine } from '../lib/saka';
import { AppStoreProvider } from '../store/AppStore';
import { RoutedShell } from '../App';
import type { RuntimeMachineState } from '../types/electron';

vi.mock('../components/NoVncViewport', () => ({
  NoVncViewport: () => <div data-testid="novnc-viewport" />
}));

const machinePath = '/tmp/windows-dev-box.saka';

function createRuntimeEnvironment() {
  return {
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
}

describe('MachineConsolePage', () => {
  it('does not repeatedly reopen the same machine bundle while on the console route', async () => {
    const machine = createMachineFromTemplate('win11');
    machine.id = 'machine-1';
    machine.title = 'Windows Dev Box';

    const readSaka = vi.fn(async () => ({
      path: machinePath,
      configPath: `${machinePath}/machine.svm`,
      content: serializeSakaMachine(machine),
      legacySingleFile: false
    }));

    window.electronAPI = {
      files: {
        openMachineBundle: vi.fn(async () => null),
        openSaka: vi.fn(async () => null),
        createMachineBundle: vi.fn(async () => ({ path: machinePath, configPath: `${machinePath}/machine.svm` })),
        readSaka,
        saveSaka: vi.fn(async () => ({ path: machinePath, configPath: `${machinePath}/machine.svm` })),
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
        detectQemu: vi.fn(async () => createRuntimeEnvironment()),
        getRuntimeEnvironment: vi.fn(async () => createRuntimeEnvironment()),
        startMachine: vi.fn(async () => ({ ok: true })),
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
        getMetadata: vi.fn(async () => ({
          name: 'Sanaka',
          version: '1.0.0',
          platform: 'darwin',
          arch: 'x64',
          userDataPath: '/tmp',
          documentsPath: '/tmp/Documents',
          defaultMachineDirectory: '/tmp/Documents/Sanaka'
        })),
        openExternal: vi.fn(async () => ({ ok: true as const })),
        onOpenSaka: vi.fn(() => () => undefined),
        onOpenAbout: vi.fn(() => () => undefined),
        onOpenSettings: vi.fn(() => () => undefined)
      }
    };

    render(
      <AppStoreProvider>
        <MemoryRouter initialEntries={[`/machines/machine-1/console?path=${encodeURIComponent(machinePath)}`]}>
          <RoutedShell />
        </MemoryRouter>
      </AppStoreProvider>
    );

    await screen.findByRole('toolbar', { name: 'Sanaka 控制台' }, { timeout: 3000 });

    await waitFor(() => {
      expect(readSaka).toHaveBeenCalledTimes(1);
    });
  });

  it('uses runtime state matched by bundle path when the route machine id is stale', async () => {
    const machine = createMachineFromTemplate('win11');
    machine.id = 'machine-actual';
    machine.title = 'Windows Dev Box';
    const runtimeState: RuntimeMachineState = {
      machineId: 'machine-runtime',
      bundlePath: machinePath,
      configPath: `${machinePath}/machine.svm`,
      pid: 1234,
      status: 'running',
      startedAt: new Date().toISOString(),
      arch: 'x86_64',
      displayFrontend: 'sanaka',
      displayBackend: 'vnc',
      displayPort: 5901,
      displayWebSocketPort: 6080,
      qmpSocketPath: '/tmp/qmp.sock',
      logPath: '/tmp/qemu.log',
      exitCode: null,
      lastError: null
    };

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
        saveSaka: vi.fn(async () => ({ path: machinePath, configPath: `${machinePath}/machine.svm` })),
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
        detectQemu: vi.fn(async () => createRuntimeEnvironment()),
        getRuntimeEnvironment: vi.fn(async () => createRuntimeEnvironment()),
        startMachine: vi.fn(async () => ({ ok: true })),
        stopMachine: vi.fn(async () => ({ ok: true })),
        forceStopMachine: vi.fn(async () => ({ ok: true })),
        resetMachine: vi.fn(async () => ({ ok: true })),
        changeMedia: vi.fn(async () => ({ ok: true })),
        getMachineState: vi.fn(async () => null),
        listRunningMachines: vi.fn(async () => [runtimeState]),
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
        getMetadata: vi.fn(async () => ({
          name: 'Sanaka',
          version: '1.0.0',
          platform: 'darwin',
          arch: 'x64',
          userDataPath: '/tmp',
          documentsPath: '/tmp/Documents',
          defaultMachineDirectory: '/tmp/Documents/Sanaka'
        })),
        openExternal: vi.fn(async () => ({ ok: true as const })),
        onOpenSaka: vi.fn(() => () => undefined),
        onOpenAbout: vi.fn(() => () => undefined),
        onOpenSettings: vi.fn(() => () => undefined)
      }
    };

    render(
      <AppStoreProvider>
        <MemoryRouter initialEntries={[`/machines/machine-stale/console?path=${encodeURIComponent(machinePath)}`]}>
          <RoutedShell />
        </MemoryRouter>
      </AppStoreProvider>
    );

    await screen.findByRole('toolbar', { name: 'Sanaka 控制台' }, { timeout: 3000 });

    await waitFor(() => {
      expect(screen.getByText('运行中')).toBeInTheDocument();
    });
    expect(screen.getByTestId('novnc-viewport')).toBeInTheDocument();
  });
});
