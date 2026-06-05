import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../components/AppHeader';
import { AppStoreProvider } from '../store/AppStore';
import { HomePage } from './HomePage';
import { SettingsPage } from './SettingsPage';

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

function mockElectronApi(recents: Array<Record<string, unknown>> = []) {
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
      list: vi.fn(async () => recents),
      push: vi.fn(async (entry) => [entry]),
      remove: vi.fn(async () => [])
    },
    runtime: {
      detectQemu: vi.fn(async () => runtimeEnvironment),
      getRuntimeEnvironment: vi.fn(async () => runtimeEnvironment),
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
      getMetadata: vi.fn(async () => ({ name: 'Sanaka', version: '1.0.0', platform: 'darwin', arch: 'x64', userDataPath: '/tmp', documentsPath: '/tmp/Documents', defaultMachineDirectory: '/tmp/Documents/Sanaka' })),
      openExternal: vi.fn(async () => ({ ok: true as const })),
      onOpenSaka: vi.fn(() => () => undefined),
      onOpenAbout: vi.fn(() => () => undefined),
      onOpenSettings: vi.fn(() => () => undefined)
    }
  };
}

function renderHome() {
  return render(
    <AppStoreProvider>
      <MemoryRouter initialEntries={['/']}>
        <div className="app-shell">
          <div className="app-shell__surface">
            <AppHeader />
            <main className="app-shell__content">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </main>
          </div>
        </div>
      </MemoryRouter>
    </AppStoreProvider>
  );
}

describe('HomePage', () => {
  beforeEach(() => {
    mockElectronApi();
  });

  it('renders a quiet workspace empty state instead of the old hero slogan', async () => {
    renderHome();

    expect(await screen.findByText('还没有虚拟机')).toBeInTheDocument();
    expect(screen.getByText('还没有虚拟机')).toBeInTheDocument();
    expect(screen.getAllByText('打开虚拟机配置').length).toBeGreaterThan(0);
    expect(screen.queryByText('Build a machine, not a checklist.')).not.toBeInTheDocument();
    expect(screen.queryByText(/\.saka/)).not.toBeInTheDocument();
  });

  it('renders recent machines as thumbnail cards and keeps settings reachable from the sidebar', async () => {
    mockElectronApi([
      {
        id: 'machine-1',
        title: 'Windows Dev Box',
        path: '/tmp/windows-dev-box.saka',
        kind: 'machine',
        templateLabel: 'Windows 10/11',
        updatedAt: '2026-06-02T12:00:00.000Z',
        status: 'saved'
      }
    ]);

    const user = userEvent.setup();
    renderHome();

    expect(await screen.findByRole('heading', { name: 'Windows Dev Box' })).toBeInTheDocument();
    expect(screen.getAllByText('已保存').length).toBeGreaterThan(0);
    expect(screen.getByText('当前虚拟机')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '设置' }));

    expect(await screen.findByText('管理应用偏好、默认配置和模板。')).toBeInTheDocument();
  });
});
