const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, screen, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { DiskImageService } = require('./runtime/DiskImageService');
const { RuntimeManager } = require('./runtime/RuntimeManager');
const { UpdateService } = require('./runtime/UpdateService');

const SETTINGS_FILE = 'settings.json';
const RECENTS_FILE = 'recents.json';
const MAX_RECENTS = 12;
const MACHINE_CONFIG_FILE = 'machine.svm';
const MACHINE_PREVIEW_FILE = 'preview.png';
const MACHINE_DISKS_DIRECTORY = 'Disks';
const DEFAULT_MACHINE_ROOT = 'Sanaka';
const APP_ICON_PATH = path.join(__dirname, 'assets', 'icons', 'logo.svg');

function readPositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

let mainWindow = null;
let pendingSakaPaths = [];
let runtimeManager = null;
let diskImageService = null;
let updateService = null;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

function getDistIndexPath() {
  return path.join(__dirname, 'dist', 'index.html');
}

function getAppIcon() {
  const icon = nativeImage.createFromPath(APP_ICON_PATH);
  return icon.isEmpty() ? undefined : icon;
}

function getUserDataPath(fileName) {
  return path.join(app.getPath('userData'), fileName);
}

async function readJsonFile(fileName, fallback) {
  try {
    const raw = await fs.readFile(getUserDataPath(fileName), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonFile(fileName, value) {
  const targetPath = getUserDataPath(fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(value, null, 2), 'utf8');
  return value;
}

function emitToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function emitRuntimeEvent(payload) {
  emitToRenderer('runtime:event', payload);
}

function getUpdateService() {
  if (!updateService) {
    updateService = new UpdateService({
      appVersion: app.getVersion(),
      loadSettings: () => readJsonFile(SETTINGS_FILE, null),
      saveSettings: (settings) => writeJsonFile(SETTINGS_FILE, settings),
      emitToRenderer,
      openExternal: (url) => shell.openExternal(url),
      startupDelayMs: readPositiveIntEnv('SANAKA_UPDATE_STARTUP_DELAY_MS', undefined),
      checkIntervalMs: readPositiveIntEnv('SANAKA_UPDATE_INTERVAL_MS', undefined)
    });
  }
  return updateService;
}

function normalizeSakaArg(argv) {
  if (!Array.isArray(argv)) return [];
  return argv
    .filter((item) => typeof item === 'string' && /\.(saka|svm)$/i.test(item))
    .map((item) => path.resolve(item));
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isMachineConfigPath(filePath) {
  return path.basename(filePath).toLowerCase() === MACHINE_CONFIG_FILE;
}

function isConfigLikeFile(filePath) {
  return /\.(saka|svm|toml)$/i.test(filePath);
}

function isLegacySingleFilePath(filePath) {
  return /\.(saka|toml)$/i.test(filePath) && !isMachineConfigPath(filePath);
}

function sanitizeMachineName(value, fallback = 'machine') {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');

  return (normalized || fallback).slice(0, 80);
}

function buildBundleDirectoryName(machineName, fallbackName = 'machine') {
  const baseName = sanitizeMachineName(machineName, fallbackName);
  return process.platform === 'darwin' ? `${baseName}.saka` : baseName;
}

async function resolveDefaultMachineDirectory() {
  const settings = await readJsonFile(SETTINGS_FILE, null);
  const configured = typeof settings?.defaultSaveDirectory === 'string' ? settings.defaultSaveDirectory.trim() : '';
  return configured || path.join(app.getPath('documents'), DEFAULT_MACHINE_ROOT);
}

async function ensureDefaultMachineDirectory() {
  const defaultDirectory = path.join(app.getPath('documents'), DEFAULT_MACHINE_ROOT);
  await fs.mkdir(defaultDirectory, { recursive: true });
  return defaultDirectory;
}

async function ensureUniqueBundlePath(rootDirectory, directoryName) {
  const parsed = path.parse(directoryName);
  const base = parsed.name || directoryName;
  const ext = parsed.ext || '';

  let candidate = path.join(rootDirectory, directoryName);
  let resolvedDirectoryName = directoryName;
  let index = 2;

  while (await pathExists(candidate)) {
    resolvedDirectoryName = `${base} ${index}${ext}`;
    candidate = path.join(rootDirectory, resolvedDirectoryName);
    index += 1;
  }

  return {
    bundlePath: candidate,
    directoryName: resolvedDirectoryName,
    machineName: base === parsed.name ? path.parse(resolvedDirectoryName).name : resolvedDirectoryName
  };
}

function replaceTomlTitle(content, title) {
  const escapedTitle = JSON.stringify(title);
  if (/^title\s*=/m.test(content)) {
    return content.replace(/^title\s*=.*$/m, `title = ${escapedTitle}`);
  }
  return `title = ${escapedTitle}\n${content}`;
}

function toBundlePreviewPath(bundlePath) {
  return path.join(bundlePath, MACHINE_PREVIEW_FILE);
}

function toBundleDisksPath(bundlePath) {
  return path.join(bundlePath, MACHINE_DISKS_DIRECTORY);
}

async function resolveOpenedConfig(filePath) {
  if (!filePath) return null;

  const absolutePath = path.resolve(filePath);
  const stats = await fs.stat(absolutePath);

  if (stats.isDirectory()) {
    const configPath = path.join(absolutePath, MACHINE_CONFIG_FILE);
    const content = await readTextFile(configPath);
    const previewPath = (await pathExists(toBundlePreviewPath(absolutePath))) ? toBundlePreviewPath(absolutePath) : undefined;
    return {
      path: absolutePath,
      configPath,
      previewPath,
      content,
      legacySingleFile: false
    };
  }

  if (isMachineConfigPath(absolutePath)) {
    const bundlePath = path.dirname(absolutePath);
    const content = await readTextFile(absolutePath);
    const previewPath = (await pathExists(toBundlePreviewPath(bundlePath))) ? toBundlePreviewPath(bundlePath) : undefined;
    return {
      path: bundlePath,
      configPath: absolutePath,
      previewPath,
      content,
      legacySingleFile: false
    };
  }

  const content = await readTextFile(absolutePath);
  return {
    path: absolutePath,
    configPath: absolutePath,
    previewPath: undefined,
    content,
    legacySingleFile: true
  };
}

async function openFileByDialog(options) {
  const result = await dialog.showOpenDialog(mainWindow, options);
  if (result.canceled || !Array.isArray(result.filePaths) || !result.filePaths[0]) {
    return null;
  }
  return result.filePaths[0];
}

async function openSakaByPath(filePath) {
  return resolveOpenedConfig(filePath);
}

async function resolveSaveTarget(targetPath) {
  if (!targetPath) {
    throw new Error('Missing target path.');
  }

  const absolutePath = path.resolve(targetPath);
  const exists = await pathExists(absolutePath);

  if (exists) {
    const stats = await fs.stat(absolutePath);
    if (stats.isDirectory()) {
      return {
        bundlePath: absolutePath,
        configPath: path.join(absolutePath, MACHINE_CONFIG_FILE)
      };
    }
  }

  if (isMachineConfigPath(absolutePath)) {
    return {
      bundlePath: path.dirname(absolutePath),
      configPath: absolutePath
    };
  }

  if (!exists && absolutePath.toLowerCase().endsWith('.svm') && !isMachineConfigPath(absolutePath)) {
    const bundlePath = absolutePath.slice(0, -4);
    return {
      bundlePath,
      configPath: path.join(bundlePath, MACHINE_CONFIG_FILE)
    };
  }

  if (!exists && absolutePath.toLowerCase().endsWith('.saka')) {
    return {
      bundlePath: absolutePath,
      configPath: path.join(absolutePath, MACHINE_CONFIG_FILE)
    };
  }

  if (exists && isLegacySingleFilePath(absolutePath)) {
    return {
      bundlePath: absolutePath,
      configPath: absolutePath,
      legacySingleFile: true
    };
  }

  if (isConfigLikeFile(absolutePath)) {
    return {
      bundlePath: absolutePath,
      configPath: absolutePath,
      legacySingleFile: true
    };
  }

  return {
    bundlePath: absolutePath,
    configPath: path.join(absolutePath, MACHINE_CONFIG_FILE)
  };
}

async function createMachineBundleAtDefaultLocation(payload) {
  const rootDirectory = await resolveDefaultMachineDirectory();
  const directoryName = buildBundleDirectoryName(payload.machineName, payload.fallbackName);
  const resolved = await ensureUniqueBundlePath(rootDirectory, directoryName);
  const bundlePath = resolved.bundlePath;
  const configPath = path.join(bundlePath, MACHINE_CONFIG_FILE);
  const content = resolved.machineName === payload.machineName ? payload.content : replaceTomlTitle(payload.content, resolved.machineName);

  await fs.mkdir(bundlePath, { recursive: true });
  await fs.mkdir(toBundleDisksPath(bundlePath), { recursive: true });
  await fs.writeFile(configPath, content, 'utf8');

  return {
    path: bundlePath,
    configPath,
    previewPath: undefined,
    machineName: resolved.machineName
  };
}

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const appIcon = getAppIcon();
  const minWidth = 960;
  const minHeight = 640;
  const width = Math.max(minWidth, Math.round(workAreaSize.width * 0.6));
  const height = Math.max(minHeight, Math.round(workAreaSize.height * 0.6));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f4f0fb',
    vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    icon: appIcon || APP_ICON_PATH,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(getDistIndexPath());
  }

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingSakaPaths.length > 0) {
      pendingSakaPaths.forEach((filePath) => emitToRenderer('app:open-saka', { path: filePath }));
      pendingSakaPaths = [];
    }
  });
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        {
          label: '关于 Sanaka',
          click: () => emitToRenderer('app:open-about')
        },
        {
          label: '设置',
          click: () => emitToRenderer('app:open-settings')
        },
        { type: 'separator' },
        {
          label: '打开虚拟机配置',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const opened = await ipcHandlers.openMachineBundle();
            if (opened) {
              emitToRenderer('app:open-saka', { path: opened.path });
            }
          }
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getRuntimeManager() {
  if (!runtimeManager) {
    runtimeManager = new RuntimeManager({
      app,
      emitEvent: emitRuntimeEvent
    });
  }
  return runtimeManager;
}

function getDiskImageService() {
  if (!diskImageService) {
    diskImageService = new DiskImageService({
      getEnvironment: () => getRuntimeManager().getRuntimeEnvironment()
    });
  }
  return diskImageService;
}

const ipcHandlers = {
  async openExternal(_event, url) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Invalid external URL.');
    }
    await shell.openExternal(url);
    return { ok: true };
  },
  async openMachineBundle() {
    const selectedPath = await openFileByDialog({
      properties: process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile'],
      filters:
        process.platform === 'darwin'
          ? [
              { name: 'Sanaka Machine', extensions: ['saka', 'svm'] },
              { name: 'Machine Config', extensions: ['svm'] }
            ]
          : [{ name: 'Sanaka Machine', extensions: ['svm', 'saka'] }]
    });
    return selectedPath ? openSakaByPath(selectedPath) : null;
  },
  async openSaka() {
    const selectedPath = await openFileByDialog({
      properties: ['openFile'],
      filters: [{ name: 'Sanaka Config', extensions: ['saka', 'svm', 'toml'] }]
    });
    return selectedPath ? openSakaByPath(selectedPath) : null;
  },
  async createMachineBundle(_event, payload) {
    return createMachineBundleAtDefaultLocation(payload);
  },
  async readSaka(_event, filePath) {
    return openSakaByPath(filePath);
  },
  async saveSaka(_event, payload) {
    const resolved = await resolveSaveTarget(payload.path);
    if (resolved.legacySingleFile) {
      await fs.mkdir(path.dirname(resolved.configPath), { recursive: true });
    } else {
      await fs.mkdir(resolved.bundlePath, { recursive: true });
      await fs.mkdir(toBundleDisksPath(resolved.bundlePath), { recursive: true });
    }
    await fs.writeFile(resolved.configPath, payload.content, 'utf8');
    return { path: resolved.bundlePath, configPath: resolved.configPath };
  },
  async saveSakaAs(_event, payload) {
    const defaultName = payload.defaultName || 'machine';
    const defaultPath =
      process.platform === 'darwin'
        ? path.join(app.getPath('documents'), defaultName.toLowerCase().endsWith('.saka') ? defaultName : `${defaultName}.saka`)
        : path.join(app.getPath('documents'), defaultName);
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [{ name: 'Sanaka Config', extensions: ['svm', 'saka'] }]
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    const normalizedSelection = process.platform === 'darwin' ? result.filePath.replace(/\.svm$/i, '') : result.filePath.replace(/\.saka$/i, '');
    const targetPath = process.platform === 'darwin' && !normalizedSelection.toLowerCase().endsWith('.saka') ? `${normalizedSelection}.saka` : normalizedSelection;
    const resolved = await resolveSaveTarget(targetPath);
    if (resolved.legacySingleFile) {
      await fs.mkdir(path.dirname(resolved.configPath), { recursive: true });
    } else {
      await fs.mkdir(resolved.bundlePath, { recursive: true });
      await fs.mkdir(toBundleDisksPath(resolved.bundlePath), { recursive: true });
    }
    await fs.writeFile(resolved.configPath, payload.content, 'utf8');
    return { path: resolved.bundlePath, configPath: resolved.configPath };
  },
  async trashMachineBundle(_event, bundlePath) {
    if (!bundlePath) {
      throw new Error('Missing machine path.');
    }
    const absolutePath = path.resolve(bundlePath);
    await shell.trashItem(absolutePath);
    return { ok: true };
  },
  async renamePath(_event, { oldPath, newPath }) {
    if (!oldPath || !newPath) {
      throw new Error('Missing oldPath or newPath');
    }
    const resolvedOld = path.resolve(oldPath);
    const resolvedNew = path.resolve(newPath);
    await fs.rename(resolvedOld, resolvedNew);
    return { ok: true };
  },
  async copyPath(_event, { srcPath, destPath }) {
    if (!srcPath || !destPath) {
      throw new Error('Missing srcPath or destPath');
    }
    const resolvedSrc = path.resolve(srcPath);
    const resolvedDest = path.resolve(destPath);
    await fs.cp(resolvedSrc, resolvedDest, { recursive: true });
    return { ok: true };
  },
  async openPath(_event, filePath) {
    if (!filePath) {
      throw new Error('Missing file path');
    }
    await shell.openPath(path.resolve(filePath));
    return { ok: true };
  },
  async pickDisk() {
    const selectedPath = await openFileByDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Disk Images', extensions: ['qcow2', 'qed', 'qcow', 'vmdk', 'vhd', 'vpc', 'vdi', 'img', 'raw'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return selectedPath ? { path: selectedPath } : null;
  },
  async getDiskInfo(_event, imagePath) {
    return getDiskImageService().getInfo(imagePath);
  },
  async createDisk(_event, request) {
    return getDiskImageService().create(request || {});
  },
  async prepareManagedDisk(_event, request) {
    if (!request?.bundlePath) {
      throw new Error('Missing machine bundle path.');
    }
    const absoluteBundlePath = path.resolve(request.bundlePath);
    const disksDirectory = toBundleDisksPath(absoluteBundlePath);
    const result = await getDiskImageService().create({
      ...request,
      directory: disksDirectory
    });
    if (!result.ok || !result.path) {
      return result;
    }
    return {
      ...result,
      relativePath: path.posix.join(MACHINE_DISKS_DIRECTORY, path.basename(result.path))
    };
  },
  async resizeDisk(_event, request) {
    return getDiskImageService().resize(request || {});
  },
  async convertDisk(_event, request) {
    return getDiskImageService().convert(request || {});
  },
  async reclaimDiskSpace(_event, imagePath) {
    return getDiskImageService().reclaimSpace(imagePath);
  },
  async pickIso() {
    const selectedPath = await openFileByDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Optical Images', extensions: ['iso', 'img'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return selectedPath ? { path: selectedPath } : null;
  },
  async loadSettings() {
    return readJsonFile(SETTINGS_FILE, null);
  },
  async saveSettings(_event, settings) {
    return writeJsonFile(SETTINGS_FILE, settings);
  },
  async listRecents() {
    return readJsonFile(RECENTS_FILE, []);
  },
  async pushRecent(_event, entry) {
    const recents = await readJsonFile(RECENTS_FILE, []);
    const next = [entry, ...recents.filter((item) => item.path !== entry.path)].slice(0, MAX_RECENTS);
    await writeJsonFile(RECENTS_FILE, next);
    return next;
  },
  async removeRecent(_event, recentPath) {
    const recents = await readJsonFile(RECENTS_FILE, []);
    const next = recents.filter((item) => item.path !== recentPath);
    await writeJsonFile(RECENTS_FILE, next);
    return next;
  },
  async getAppMetadata() {
    const defaultMachineDirectory = await ensureDefaultMachineDirectory();
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      userDataPath: app.getPath('userData'),
      documentsPath: app.getPath('documents'),
      defaultMachineDirectory
    };
  },
  async detectQemu() {
    return getRuntimeManager().detectQemu();
  },
  async getUpdaterCurrentInfo() {
    return getUpdateService().getCurrentInfo();
  },
  async checkForUpdates(_event, options) {
    return getUpdateService().checkForUpdates(options || {});
  },
  async skipUpdateVersion(_event, version) {
    return getUpdateService().skipVersion(version);
  },
  async openUpdatePage(_event, url) {
    return getUpdateService().openUpdatePage(url);
  },
  async getRuntimeEnvironment() {
    return getRuntimeManager().getRuntimeEnvironment();
  },
  async startMachine(_event, bundlePath) {
    return getRuntimeManager().startMachine(bundlePath);
  },
  async stopMachine(_event, machineId) {
    return getRuntimeManager().stopMachine(machineId);
  },
  async forceStopMachine(_event, machineId) {
    return getRuntimeManager().forceStopMachine(machineId);
  },
  async resetMachine(_event, payload) {
    return getRuntimeManager().resetMachine(payload?.machineId, payload?.mode);
  },
  async changeMedia(_event, payload) {
    return getRuntimeManager().changeMedia(payload?.machineId, payload?.isoPath, payload?.drive);
  },
  async getMachineState(_event, machineId) {
    return getRuntimeManager().getMachineState(machineId);
  },
  async listRunningMachines() {
    return getRuntimeManager().listRunningMachines();
  }
};

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  pendingSakaPaths.push(filePath);
  emitToRenderer('app:open-saka', { path: filePath });
});

app.on('second-instance', (_event, argv) => {
  const startupSakaPaths = normalizeSakaArg(argv.slice(1));
  if (startupSakaPaths.length > 0) {
    pendingSakaPaths.push(...startupSakaPaths);
    startupSakaPaths.forEach((filePath) => emitToRenderer('app:open-saka', { path: filePath }));
  }
  revealMainWindow();
});

app.whenReady().then(() => {
  const appIcon = getAppIcon();
  if (process.platform === 'darwin' && appIcon) {
    app.dock.setIcon(appIcon);
  }

  buildMenu();
  createWindow();

  const startupSakaPaths = normalizeSakaArg(process.argv.slice(1));
  if (startupSakaPaths.length > 0) {
    pendingSakaPaths.push(...startupSakaPaths);
  }

  void getRuntimeManager().initialize();
  getUpdateService().initialize();

  ipcMain.handle('files:open-machine-bundle', ipcHandlers.openMachineBundle);
  ipcMain.handle('files:open-saka', ipcHandlers.openSaka);
  ipcMain.handle('files:create-machine-bundle', ipcHandlers.createMachineBundle);
  ipcMain.handle('files:read-saka', ipcHandlers.readSaka);
  ipcMain.handle('files:save-saka', ipcHandlers.saveSaka);
  ipcMain.handle('files:save-saka-as', ipcHandlers.saveSakaAs);
  ipcMain.handle('files:trash-machine-bundle', ipcHandlers.trashMachineBundle);
  ipcMain.handle('files:rename-path', ipcHandlers.renamePath);
  ipcMain.handle('files:copy-path', ipcHandlers.copyPath);
  ipcMain.handle('files:open-path', ipcHandlers.openPath);
  ipcMain.handle('dialogs:pick-disk', ipcHandlers.pickDisk);
  ipcMain.handle('dialogs:pick-iso', ipcHandlers.pickIso);
  ipcMain.handle('disks:get-info', ipcHandlers.getDiskInfo);
  ipcMain.handle('disks:create', ipcHandlers.createDisk);
  ipcMain.handle('disks:prepare-managed', ipcHandlers.prepareManagedDisk);
  ipcMain.handle('disks:resize', ipcHandlers.resizeDisk);
  ipcMain.handle('disks:convert', ipcHandlers.convertDisk);
  ipcMain.handle('disks:reclaim-space', ipcHandlers.reclaimDiskSpace);
  ipcMain.handle('settings:load', ipcHandlers.loadSettings);
  ipcMain.handle('settings:save', ipcHandlers.saveSettings);
  ipcMain.handle('recents:list', ipcHandlers.listRecents);
  ipcMain.handle('recents:push', ipcHandlers.pushRecent);
  ipcMain.handle('recents:remove', ipcHandlers.removeRecent);
  ipcMain.handle('app:get-metadata', ipcHandlers.getAppMetadata);
  ipcMain.handle('app:open-external', ipcHandlers.openExternal);
  ipcMain.handle('updater:get-current-info', ipcHandlers.getUpdaterCurrentInfo);
  ipcMain.handle('updater:check-for-updates', ipcHandlers.checkForUpdates);
  ipcMain.handle('updater:skip-version', ipcHandlers.skipUpdateVersion);
  ipcMain.handle('updater:open-update-page', ipcHandlers.openUpdatePage);
  ipcMain.handle('runtime:detect-qemu', ipcHandlers.detectQemu);
  ipcMain.handle('runtime:get-environment', ipcHandlers.getRuntimeEnvironment);
  ipcMain.handle('runtime:start-machine', ipcHandlers.startMachine);
  ipcMain.handle('runtime:stop-machine', ipcHandlers.stopMachine);
  ipcMain.handle('runtime:force-stop-machine', ipcHandlers.forceStopMachine);
  ipcMain.handle('runtime:reset-machine', ipcHandlers.resetMachine);
  ipcMain.handle('runtime:change-media', ipcHandlers.changeMedia);
  ipcMain.handle('runtime:get-machine-state', ipcHandlers.getMachineState);
  ipcMain.handle('runtime:list-running-machines', ipcHandlers.listRunningMachines);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    revealMainWindow();
  }
});

app.on('before-quit', async () => {
  if (updateService) {
    updateService.dispose();
  }
  if (runtimeManager) {
    await runtimeManager.dispose().catch(() => null);
  }
});
