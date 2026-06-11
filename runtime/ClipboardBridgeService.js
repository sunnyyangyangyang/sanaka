const fsPromises = require('fs/promises');
const net = require('net');
const path = require('path');

const LOOP_INTERVAL_MS = 500;
const HEARTBEAT_INTERVAL_MS = 5000;
const MAX_CLIPBOARD_BYTES = 1024 * 1024;
const PROTOCOL_VERSION = 1;

function normalizeLineEndingsForTransport(text) {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function normalizeLineEndingsForHost(text, platform = process.platform) {
  const normalized = normalizeLineEndingsForTransport(text);
  if (platform === 'win32') {
    return normalized.replace(/\n/g, '\r\n');
  }
  return normalized;
}

function hashText(text) {
  const value = normalizeLineEndingsForTransport(text);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

class ClipboardBridgeService {
  constructor(options) {
    this.machineId = options.machineId;
    this.machineMac = options.machineMac;
    this.sessionId = options.sessionId;
    this.listenPort = options.listenPort;
    this.bootstrapPort = options.bootstrapPort;
    this.runtimeDir = options.runtimeDir;
    this.readClipboardText = options.readClipboardText || (() => '');
    this.writeClipboardText = options.writeClipboardText || (() => undefined);
    this.onStateChange = options.onStateChange || (() => undefined);
    this.onLog = options.onLog || (() => undefined);
    this.server = null;
    this.socket = null;
    this.socketBuffer = '';
    this.connected = false;
    this.guestToolInstalledKnown = false;
    this.lastError = null;
    this.lastLocalHash = '';
    this.lastRemoteAppliedHash = '';
    this.pollTimer = null;
    this.heartbeatTimer = null;
  }

  async start() {
    await this.#writeGuestConfig();
    await new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        this.#attachSocket(socket);
      });
      this.server = server;
      server.on('error', (error) => {
        this.lastError = error instanceof Error ? error.message : 'Clipboard bridge server error.';
        this.#emitState();
      });
      server.listen(this.listenPort, '127.0.0.1', () => resolve());
      server.once('error', reject);
    });

    this.pollTimer = setInterval(() => {
      this.#pollClipboard();
    }, LOOP_INTERVAL_MS);
    this.pollTimer.unref?.();

    this.heartbeatTimer = setInterval(() => {
      this.#send({
        type: 'heartbeat',
        timestamp: Date.now()
      });
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();

    this.#emitState();
  }

  async stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.#detachSocket();
    await new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      const server = this.server;
      this.server = null;
      server.close(() => resolve());
    });
  }

  getState() {
    const status = !this.server
      ? 'idle'
      : this.lastError
        ? 'error'
        : this.connected
          ? 'connected'
          : 'waiting';
    return {
      enabled: true,
      active: Boolean(this.server),
      connected: this.connected,
      status,
      textOnly: true,
      listenPort: this.listenPort,
      bootstrapPort: this.bootstrapPort,
      sessionId: this.sessionId,
      machineMac: this.machineMac,
      pendingGuestConnection: !this.connected,
      guestToolInstalledKnown: this.guestToolInstalledKnown,
      hostAddress: '10.0.2.2',
      lastError: this.lastError,
      configPath: path.join(this.runtimeDir, 'sanaka-clipboard.ini')
    };
  }

  async #writeGuestConfig() {
    const filePath = path.join(this.runtimeDir, 'sanaka-clipboard.ini');
    const content = [
      'host=10.0.2.2',
      `bootstrap_port=${this.bootstrapPort || 0}`,
      `port=${this.listenPort}`,
      `session_id=${this.sessionId}`,
      `machine_mac=${this.machineMac || ''}`,
      `protocol_version=${PROTOCOL_VERSION}`,
      ''
    ].join('\n');
    await fsPromises.mkdir(this.runtimeDir, { recursive: true });
    await fsPromises.writeFile(filePath, content, 'utf8');
  }

  #attachSocket(socket) {
    this.#detachSocket();
    this.socket = socket;
    this.socketBuffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      this.socketBuffer += chunk;
      this.#drainSocketBuffer();
    });
    socket.on('error', (error) => {
      this.lastError = error instanceof Error ? error.message : 'Clipboard bridge connection failed.';
      this.connected = false;
      this.#emitState();
    });
    socket.on('close', () => {
      this.connected = false;
      this.#emitState();
      if (this.socket === socket) {
        this.socket = null;
      }
    });
  }

  #detachSocket() {
    if (!this.socket) {
      this.connected = false;
      return;
    }
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    try {
      socket.destroy();
    } catch {
      // ignore
    }
  }

  #drainSocketBuffer() {
    while (true) {
      const newlineIndex = this.socketBuffer.indexOf('\n');
      if (newlineIndex < 0) {
        return;
      }
      const line = this.socketBuffer.slice(0, newlineIndex).trim();
      this.socketBuffer = this.socketBuffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }
      let payload = null;
      try {
        payload = JSON.parse(line);
      } catch {
        this.lastError = 'Clipboard bridge received invalid JSON.';
        this.#emitState();
        continue;
      }
      this.#handleMessage(payload);
    }
  }

  #handleMessage(payload) {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (payload.type === 'hello') {
      if (payload.sessionId !== this.sessionId || Number(payload.protocolVersion) !== PROTOCOL_VERSION) {
        this.onLog(`clipboard hello mismatch machineId=${this.machineId} session=${payload.sessionId || '<empty>'}`);
        this.lastError = 'Clipboard bridge session mismatch.';
        this.#send({ type: 'error', code: 'session_mismatch', timestamp: Date.now() });
        this.#detachSocket();
        this.#emitState();
        return;
      }
      this.connected = true;
      this.guestToolInstalledKnown = true;
      this.lastError = null;
      this.onLog(`clipboard hello ok machineId=${this.machineId}`);
      this.#send({
        type: 'hello_ack',
        protocolVersion: PROTOCOL_VERSION,
        sessionId: this.sessionId,
        textOnly: true,
        timestamp: Date.now()
      });
      this.#emitState();
      return;
    }

    if (payload.type === 'clipboard_push') {
      const text = normalizeLineEndingsForTransport(typeof payload.text === 'string' ? payload.text : '');
      this.onLog(`clipboard push from guest machineId=${this.machineId} bytes=${Buffer.byteLength(text, 'utf8')}`);
      if (Buffer.byteLength(text, 'utf8') > MAX_CLIPBOARD_BYTES) {
        this.lastError = 'Clipboard payload exceeds size limit.';
        this.#send({ type: 'error', code: 'clipboard_too_large', timestamp: Date.now() });
        this.#emitState();
        return;
      }
      const hash = typeof payload.hash === 'string' && payload.hash ? payload.hash : hashText(text);
      if (hash === this.lastRemoteAppliedHash) {
        return;
      }
      try {
        this.writeClipboardText(normalizeLineEndingsForHost(text));
        this.lastRemoteAppliedHash = hash;
        this.lastLocalHash = hash;
        this.lastError = null;
        this.onLog(`clipboard applied to host machineId=${this.machineId} hash=${hash}`);
        this.#send({
          type: 'clipboard_ack',
          hash,
          timestamp: Date.now()
        });
        this.#emitState();
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : 'Failed to write host clipboard.';
        this.onLog(`clipboard write host failed machineId=${this.machineId} error=${this.lastError}`);
        this.#emitState();
      }
    }
  }

  #pollClipboard() {
    let text = '';
    try {
      text = normalizeLineEndingsForTransport(this.readClipboardText() || '');
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Failed to read host clipboard.';
      this.#emitState();
      return;
    }

    const hash = hashText(text);
    if (hash === this.lastLocalHash) {
      return;
    }
    this.lastLocalHash = hash;
    if (hash === this.lastRemoteAppliedHash) {
      return;
    }
    if (Buffer.byteLength(text, 'utf8') > MAX_CLIPBOARD_BYTES) {
      this.lastError = 'Host clipboard text exceeds size limit.';
      this.onLog(`clipboard host text too large machineId=${this.machineId}`);
      this.#emitState();
      return;
    }
    this.onLog(`clipboard push to guest machineId=${this.machineId} bytes=${Buffer.byteLength(text, 'utf8')} hash=${hash}`);
    this.#send({
      type: 'clipboard_push',
      source: 'host',
      text,
      hash,
      timestamp: Date.now()
    });
  }

  #send(payload) {
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    try {
      this.socket.write(`${JSON.stringify(payload)}\n`);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Failed to send clipboard payload.';
      this.#emitState();
    }
  }

  #emitState() {
    this.onStateChange(this.getState());
  }
}

module.exports = {
  ClipboardBridgeService,
  hashText,
  normalizeLineEndingsForHost,
  normalizeLineEndingsForTransport,
  MAX_CLIPBOARD_BYTES,
  PROTOCOL_VERSION
};
