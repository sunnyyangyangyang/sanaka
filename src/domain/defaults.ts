import type { AppSettings, ConsoleSessionState } from './schemas';
import { defaultTemplateCatalog } from './templates';

export const defaultSettings: AppSettings = {
  language: 'zh-CN',
  theme: 'light',
  defaultSaveDirectory: '',
  webMode: {
    port: 25895
  },
  runtimeDefaults: {
    displayFrontend: 'sanaka',
    displayBackendHint: 'vnc'
  },
  templateCatalog: defaultTemplateCatalog,
  updates: {
    skippedVersion: ''
  },
  experimental: {
    brandedHero: true,
    advancedConsole: true,
    protocolInspector: false
  }
};

export function createInitialConsoleState(displayHint: string, audioHint: string): ConsoleSessionState {
  return {
    status: 'booting',
    connected: true,
    muted: false,
    fullscreen: false,
    inputCaptured: false,
    zoom: 'fit',
    startedAt: new Date().toISOString(),
    displayHint,
    audioHint,
    events: [
      {
        id: `evt-${Date.now()}`,
        level: 'info',
        message: 'console.eventMessages.attached',
        time: new Date().toISOString()
      }
    ]
  };
}
