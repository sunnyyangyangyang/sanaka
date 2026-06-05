const { contextBridge, ipcRenderer } = require('electron');

function on(channel, handler) {
  if (typeof handler !== 'function') {
    return () => {};
  }
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  files: {
    openMachineBundle: () => ipcRenderer.invoke('files:open-machine-bundle'),
    openSaka: () => ipcRenderer.invoke('files:open-saka'),
    createMachineBundle: (payload) => ipcRenderer.invoke('files:create-machine-bundle', payload),
    readSaka: (filePath) => ipcRenderer.invoke('files:read-saka', filePath),
    saveSaka: (path, content) => ipcRenderer.invoke('files:save-saka', { path, content }),
    saveSakaAs: (defaultName, content) => ipcRenderer.invoke('files:save-saka-as', { defaultName, content }),
    trashMachineBundle: (path) => ipcRenderer.invoke('files:trash-machine-bundle', path),
    renamePath: (oldPath, newPath) => ipcRenderer.invoke('files:rename-path', { oldPath, newPath }),
    copyPath: (srcPath, destPath) => ipcRenderer.invoke('files:copy-path', { srcPath, destPath }),
    openPath: (path) => ipcRenderer.invoke('files:open-path', path)
  },
  dialogs: {
    pickDisk: () => ipcRenderer.invoke('dialogs:pick-disk'),
    pickIso: () => ipcRenderer.invoke('dialogs:pick-iso')
  },
  disks: {
    getInfo: (imagePath) => ipcRenderer.invoke('disks:get-info', imagePath),
    create: (request) => ipcRenderer.invoke('disks:create', request),
    prepareManaged: (request) => ipcRenderer.invoke('disks:prepare-managed', request),
    resize: (request) => ipcRenderer.invoke('disks:resize', request),
    convert: (request) => ipcRenderer.invoke('disks:convert', request),
    reclaimSpace: (imagePath) => ipcRenderer.invoke('disks:reclaim-space', imagePath),
    listLocalImages: (bundlePath) => ipcRenderer.invoke('disks:list-local-images', bundlePath)
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings)
  },
  recents: {
    list: () => ipcRenderer.invoke('recents:list'),
    push: (entry) => ipcRenderer.invoke('recents:push', entry),
    remove: (path) => ipcRenderer.invoke('recents:remove', path)
  },
  runtime: {
    detectQemu: () => ipcRenderer.invoke('runtime:detect-qemu'),
    getRuntimeEnvironment: () => ipcRenderer.invoke('runtime:get-environment'),
    startMachine: (bundlePath) => ipcRenderer.invoke('runtime:start-machine', bundlePath),
    stopMachine: (machineId) => ipcRenderer.invoke('runtime:stop-machine', machineId),
    forceStopMachine: (machineId) => ipcRenderer.invoke('runtime:force-stop-machine', machineId),
    resetMachine: (payload) => ipcRenderer.invoke('runtime:reset-machine', payload),
    changeMedia: (payload) => ipcRenderer.invoke('runtime:change-media', payload),
    getMachineState: (machineId) => ipcRenderer.invoke('runtime:get-machine-state', machineId),
    listRunningMachines: () => ipcRenderer.invoke('runtime:list-running-machines'),
    onRuntimeEvent: (handler) => on('runtime:event', handler)
  },
  updater: {
    getCurrentInfo: () => ipcRenderer.invoke('updater:get-current-info'),
    checkForUpdates: (options) => ipcRenderer.invoke('updater:check-for-updates', options),
    skipVersion: (version) => ipcRenderer.invoke('updater:skip-version', version),
    openUpdatePage: (url) => ipcRenderer.invoke('updater:open-update-page', url),
    onUpdateAvailable: (handler) => on('app:update-available', handler)
  },
  app: {
    getMetadata: () => ipcRenderer.invoke('app:get-metadata'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    onOpenSaka: (handler) => on('app:open-saka', handler),
    onOpenAbout: (handler) => on('app:open-about', handler),
    onOpenSettings: (handler) => on('app:open-settings', handler)
  }
});
