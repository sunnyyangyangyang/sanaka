export type DisplayFrontend = 'sanaka' | 'spice' | 'vnc';
export type DisplayBackendHint = 'spice' | 'vnc';

export interface OpenedSakaFile {
  path: string;
  configPath: string;
  previewPath?: string;
  content: string;
  legacySingleFile?: boolean;
}

export interface PickedPath {
  path: string;
}

export type DiskImageFormat = 'qcow2' | 'qed' | 'qcow' | 'vmdk' | 'vpc' | 'vdi' | 'raw';
export type DiskSizeUnit = 'MB' | 'GB';
export type DiskStorageMode = 'managed' | 'external';

export interface DiskImageInfo {
  path: string;
  format: DiskImageFormat;
  virtualSize: number;
  actualSize: number;
  backingFile?: string;
}

export interface CreateDiskImageRequest {
  path?: string;
  name?: string;
  directory?: string;
  size: number;
  unit: DiskSizeUnit;
  format: DiskImageFormat;
  options?: {
    preallocate?: boolean;
    backingFile?: string;
    backingFormat?: DiskImageFormat;
  };
}

export interface PrepareManagedDiskRequest {
  bundlePath: string;
  diskId: string;
  name: string;
  size: number;
  unit: DiskSizeUnit;
  format: DiskImageFormat;
  options?: {
    preallocate?: boolean;
  };
}

export interface PrepareManagedDiskResult extends DiskImageMutationResult {
  relativePath?: string;
}

export interface ResizeDiskImageRequest {
  path: string;
  newSize: number;
  unit: DiskSizeUnit;
  shrink?: boolean;
}

export interface ConvertDiskImageRequest {
  sourcePath: string;
  sourceFormat?: DiskImageFormat;
  targetFormat: DiskImageFormat;
  targetPath?: string;
  options?: {
    compression?: boolean;
    sparse?: boolean;
    preallocate?: boolean;
    backingFile?: string;
    backingFormat?: DiskImageFormat;
  };
}

export interface DiskImageMutationResult {
  ok: boolean;
  path?: string;
  info?: DiskImageInfo;
  error?: string;
}

export interface ReclaimDiskSpaceResult extends DiskImageMutationResult {
  reclaimedBytes?: number;
}

export interface AppMetadata {
  name: string;
  version: string;
  platform: string;
  arch: string;
  userDataPath: string;
  documentsPath: string;
  defaultMachineDirectory: string;
}

export interface QemuBinaryAvailability {
  name: string;
  found: boolean;
  path: string | null;
  version: string | null;
}

export interface QemuEnvironment {
  checkedAt: string;
  platform: string;
  arch: string;
  available: boolean;
  availableSystemTargets: string[];
  accelerators: string[];
  installHint: string;
  binaries: {
    x86_64: QemuBinaryAvailability;
    aarch64: QemuBinaryAvailability;
    i386: QemuBinaryAvailability;
    arm: QemuBinaryAvailability;
    riscv64: QemuBinaryAvailability;
    ppc: QemuBinaryAvailability;
    ppc64: QemuBinaryAvailability;
    qemuImg: QemuBinaryAvailability;
    [key: string]: QemuBinaryAvailability;
  };
}

export interface RuntimeMachineState {
  machineId: string;
  bundlePath: string;
  configPath: string;
  pid: number;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'resetting' | 'paused';
  startedAt: string;
  arch: string;
  displayFrontend: DisplayFrontend;
  displayBackend: 'vnc' | 'spice';
  displayPort: number;
  displayWebSocketPort?: number;
  qmpSocketPath: string | null;
  qmpTcpPort?: number | null;
  logPath: string;
  exitCode: number | null;
  lastError: string | null;
}

export interface RuntimeEvent {
  type:
    | 'machine-starting'
    | 'machine-running'
    | 'machine-resetting'
    | 'machine-stopping'
    | 'machine-stopped'
    | 'machine-error'
    | 'environment-updated';
  at: string;
  machineId?: string;
  state?: RuntimeMachineState | null;
  error?: string | null;
  environment?: QemuEnvironment;
}

export interface StartMachineResult {
  ok: boolean;
  alreadyRunning?: boolean;
  error?: string;
  state?: RuntimeMachineState | null;
}

export interface StopMachineResult {
  ok: boolean;
  error?: string;
  state?: RuntimeMachineState | null;
}

export interface ChangeMediaRequest {
  machineId: string;
  isoPath: string;
  drive?: 'cdrom' | 'floppy';
}

export interface ResetMachineRequest {
  machineId: string;
  mode?: 'hard' | 'soft';
}

export interface CreateMachineBundlePayload {
  machineName: string;
  fallbackName: string;
  content: string;
}

export interface SavedMachineBundle {
  path: string;
  configPath: string;
  machineName?: string;
}

export interface TrashMachineBundleResult {
  ok: true;
}

export interface ElectronApi {
  files: {
    openMachineBundle: () => Promise<OpenedSakaFile | null>;
    openSaka: () => Promise<OpenedSakaFile | null>;
    createMachineBundle: (payload: CreateMachineBundlePayload) => Promise<SavedMachineBundle>;
    readSaka: (filePath: string) => Promise<OpenedSakaFile | null>;
    saveSaka: (path: string, content: string) => Promise<SavedMachineBundle>;
    saveSakaAs: (defaultName: string, content: string) => Promise<SavedMachineBundle | null>;
    trashMachineBundle: (path: string) => Promise<TrashMachineBundleResult>;
    renamePath: (oldPath: string, newPath: string) => Promise<{ ok: true }>;
    copyPath: (srcPath: string, destPath: string) => Promise<{ ok: true }>;
    openPath: (path: string) => Promise<{ ok: true }>;
    pathExists: (path: string) => Promise<boolean>;
  };
  dialogs: {
    pickDisk: () => Promise<PickedPath | null>;
    pickIso: () => Promise<PickedPath | null>;
  };
  disks: {
    getInfo: (imagePath: string) => Promise<DiskImageInfo>;
    create: (request: CreateDiskImageRequest) => Promise<DiskImageMutationResult>;
    prepareManaged: (request: PrepareManagedDiskRequest) => Promise<PrepareManagedDiskResult>;
    resize: (request: ResizeDiskImageRequest) => Promise<DiskImageMutationResult>;
    convert: (request: ConvertDiskImageRequest) => Promise<DiskImageMutationResult>;
    reclaimSpace: (imagePath: string) => Promise<ReclaimDiskSpaceResult>;
    listLocalImages: (bundlePath: string) => Promise<{
      images: Array<{
        path: string;
        name: string;
        format: string;
        size: number;
        unit: string;
      }>;
    }>;
  };
  settings: {
    load: () => Promise<unknown>;
    save: (settings: unknown) => Promise<unknown>;
  };
  recents: {
    list: () => Promise<unknown>;
    push: (entry: unknown) => Promise<unknown>;
    remove: (path: string) => Promise<unknown>;
  };
  runtime: {
    detectQemu: () => Promise<QemuEnvironment>;
    getRuntimeEnvironment: () => Promise<QemuEnvironment>;
    startMachine: (bundlePath: string) => Promise<StartMachineResult>;
    stopMachine: (machineId: string) => Promise<StopMachineResult>;
    forceStopMachine: (machineId: string) => Promise<StopMachineResult>;
    resetMachine: (payload: ResetMachineRequest) => Promise<StopMachineResult>;
    changeMedia: (payload: ChangeMediaRequest) => Promise<StopMachineResult>;
    getMachineState: (machineId: string) => Promise<RuntimeMachineState | null>;
    listRunningMachines: () => Promise<RuntimeMachineState[]>;
    onRuntimeEvent: (handler: (payload: RuntimeEvent) => void) => () => void;
  };
  updater: {
    getCurrentInfo: () => Promise<UpdateCurrentInfo>;
    checkForUpdates: (options?: { silent?: boolean }) => Promise<UpdateCheckResult>;
    skipVersion: (version: string) => Promise<{ ok: true; skippedVersion: string }>;
    openUpdatePage: (url: string) => Promise<{ ok: true }>;
    onUpdateAvailable: (handler: (payload: UpdateAvailableEvent) => void) => () => void;
  };
  app: {
    getMetadata: () => Promise<AppMetadata>;
    openExternal: (url: string) => Promise<{ ok: true }>;
    onOpenSaka: (handler: (payload: { path: string }) => void) => () => void;
    onOpenAbout: (handler: () => void) => () => void;
    onOpenSettings: (handler: () => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronApi;
  }
}

export interface UpdateCurrentInfo {
  currentVersion: string;
  currentChannel: 'release' | 'beta';
  skippedVersion?: string;
}

export interface UpdateManifest {
  version: string;
  channel: 'release' | 'beta';
  mandatory: boolean;
  pubDate?: string;
  url: string;
  title?: string;
  notes: string;
}

export interface UpdateCheckResult extends UpdateCurrentInfo {
  latest?: UpdateManifest;
  hasUpdate: boolean;
  error?: string;
}

export interface UpdateAvailableEvent extends UpdateCurrentInfo {
  source: 'automatic' | 'manual';
  manifest: UpdateManifest;
}
