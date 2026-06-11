import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const { WebModeService } = await import(pathToFileURL(path.join(projectRoot, 'runtime', 'WebModeService.js')).href);

const runtimeEnvironment = {
  checkedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  available: true,
  availableSystemTargets: ['x86_64'],
  accelerators: ['tcg'],
  installHint: '',
  binaries: {
    x86_64: { name: 'qemu-system-x86_64', found: true, path: '/usr/bin/qemu-system-x86_64', version: 'test' },
    aarch64: { name: 'qemu-system-aarch64', found: false, path: null, version: null },
    i386: { name: 'qemu-system-i386', found: false, path: null, version: null },
    arm: { name: 'qemu-system-arm', found: false, path: null, version: null },
    riscv64: { name: 'qemu-system-riscv64', found: false, path: null, version: null },
    ppc: { name: 'qemu-system-ppc', found: false, path: null, version: null },
    ppc64: { name: 'qemu-system-ppc64', found: false, path: null, version: null },
    qemuImg: { name: 'qemu-img', found: true, path: '/usr/bin/qemu-img', version: 'test' }
  }
};

const appMetadata = {
  name: 'Sanaka',
  version: '0.0.3-beta',
  platform: process.platform,
  arch: process.arch,
  userDataPath: '/tmp/sanaka-web-smoke-userdata',
  documentsPath: '/tmp/sanaka-web-smoke-documents',
  defaultMachineDirectory: '/tmp/sanaka-web-smoke-documents/Sanaka'
};

const updateInfo = {
  currentVersion: '0.0.3-beta',
  currentChannel: 'beta',
  skippedVersion: ''
};

const state = {
  settings: null,
  recents: [],
  runtimeMachines: []
};

const noopOk = async () => ({ ok: true });
const notImplemented = async () => {
  throw new Error('Not implemented in web smoke service.');
};

const service = new WebModeService({
  appName: 'Sanaka',
  appVersion: '0.0.3-beta',
  distDir: path.join(projectRoot, 'dist'),
  getRuntimeSummary: async () => ({
    qemuAvailable: true,
    runningMachines: state.runtimeMachines.length
  }),
  invokeHandlers: {
    files: {
      openMachineBundle: async () => null,
      openSaka: async () => null,
      createMachineBundle: async () => ({ path: '/tmp/fake-machine', configPath: '/tmp/fake-machine/machine.svm' }),
      readSaka: async () => null,
      saveSaka: async (payload) => ({ path: payload.path || '/tmp/fake-machine', configPath: '/tmp/fake-machine/machine.svm' }),
      saveSakaAs: async () => null,
      trashMachineBundle: noopOk,
      renamePath: noopOk,
      copyPath: noopOk,
      openPath: noopOk,
      openFolder: noopOk,
      pathExists: async () => false
    },
    dialogs: {
      selectFolder: async () => null,
      pickDisk: async () => null,
      pickIso: async () => null,
      pickFirmwareCode: async () => null,
      pickFirmwareVars: async () => null
    },
    disks: {
      getInfo: notImplemented,
      create: notImplemented,
      prepareManaged: notImplemented,
      resize: notImplemented,
      convert: notImplemented,
      reclaimSpace: notImplemented,
      listLocalImages: async () => ({ images: [] })
    },
    settings: {
      load: async () => state.settings,
      save: async (next) => {
        state.settings = next;
        return next;
      }
    },
    recents: {
      list: async () => state.recents,
      push: async (entry) => {
        state.recents = [entry, ...state.recents.filter((item) => item?.path !== entry?.path)];
        return state.recents;
      },
      remove: async (targetPath) => {
        state.recents = state.recents.filter((item) => item?.path !== targetPath);
        return state.recents;
      }
    },
    runtime: {
      detectQemu: async () => runtimeEnvironment,
      getRuntimeEnvironment: async () => runtimeEnvironment,
      getSharedFolderEnvironment: async () => ({
        available: false,
        backend: 'smb',
        installHint: 'Unavailable in smoke mode.',
        reason: 'disabled'
      }),
      previewMachineCommand: notImplemented,
      startMachine: async () => ({ ok: false, error: 'Smoke mode does not start QEMU.' }),
      stopMachine: async () => ({ ok: true, state: null }),
      forceStopMachine: async () => ({ ok: true, state: null }),
      resetMachine: async () => ({ ok: true, state: null }),
      changeMedia: async () => ({ ok: true, state: null }),
      mountBundledTestNetIso: async () => ({ ok: true, state: null }),
      mountSanakaToolsIso: async () => ({ ok: true, state: null }),
      mountSanakaToolsLinuxIso: async () => ({ ok: true, state: null }),
      getMachineState: async () => null,
      listRunningMachines: async () => state.runtimeMachines
    },
    machine: {
      updateSharedFolder: async () => ({
        ok: false,
        error: 'Shared folders are unavailable in smoke mode.',
        pendingRestart: false,
        state: null
      }),
      updateClipboardBridge: async () => ({
        ok: false,
        error: 'Clipboard bridge is unavailable in smoke mode.',
        state: null
      }),
      exportMachine: async () => 'smoke-export-task',
      cancelExport: async () => true
    },
    updater: {
      getCurrentInfo: async () => updateInfo,
      checkForUpdates: async () => ({
        ...updateInfo,
        hasUpdate: false
      }),
      skipVersion: async (version) => ({
        ok: true,
        skippedVersion: String(version || '')
      }),
      openUpdatePage: noopOk
    },
    app: {
      getMetadata: async () => appMetadata,
      openWebMode: async () => service.getState(),
      getWebModeState: async () => service.getState(),
      stopWebMode: async () => {
        await service.stop();
        return { ok: true };
      },
      consumePendingSakaPaths: async () => [],
      openExternal: noopOk
    }
  }
});

const result = await service.start();
process.stdout.write(`${result.url}\n`);

const cleanup = async () => {
  await service.stop().catch(() => null);
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

setInterval(() => {}, 1 << 30);
