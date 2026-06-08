const net = require('net');

const DEFAULT_BOOTSTRAP_PORT = 7935;
const PROTOCOL_VERSION = 1;

class ClipboardBootstrapService {
  constructor(options = {}) {
    this.port = Number(options.port || DEFAULT_BOOTSTRAP_PORT);
    this.resolveSessionByMac = options.resolveSessionByMac || (() => null);
    this.onError = options.onError || (() => undefined);
    this.server = null;
  }

  async start() {
    if (this.server) {
      return;
    }

    await new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        this.#handleSocket(socket);
      });
      this.server = server;
      server.once('error', reject);
      server.on('error', (error) => {
        this.onError(error);
      });
      server.listen(this.port, '0.0.0.0', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  }

  async stop() {
    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  #handleSocket(socket) {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      buffer += chunk;
      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex < 0) {
          break;
        }
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) {
          continue;
        }
        this.#handleMessage(socket, line);
      }
    });
  }

  #handleMessage(socket, line) {
    let payload = null;
    try {
      payload = JSON.parse(line);
    } catch {
      this.#send(socket, {
        type: 'bootstrap_error',
        code: 'invalid_json',
        message: 'Invalid bootstrap JSON payload.',
        timestamp: Date.now()
      });
      socket.end();
      return;
    }

    const requestedMac = normalizeMacAddress(payload?.machineMac || payload?.mac);
    const protocolVersion = Number(payload?.protocolVersion || PROTOCOL_VERSION);

    if (!requestedMac) {
      this.#send(socket, {
        type: 'bootstrap_error',
        code: 'missing_mac',
        message: 'A machine MAC address is required.',
        timestamp: Date.now()
      });
      socket.end();
      return;
    }

    if (protocolVersion !== PROTOCOL_VERSION) {
      this.#send(socket, {
        type: 'bootstrap_error',
        code: 'protocol_mismatch',
        message: 'Unsupported bootstrap protocol version.',
        timestamp: Date.now()
      });
      socket.end();
      return;
    }

    const session = this.resolveSessionByMac(requestedMac);
    if (!session) {
      this.#send(socket, {
        type: 'bootstrap_error',
        code: 'machine_not_running',
        message: 'No running machine matches this MAC address.',
        timestamp: Date.now()
      });
      socket.end();
      return;
    }

    this.#send(socket, {
      type: 'bootstrap_ack',
      protocolVersion: PROTOCOL_VERSION,
      machineId: session.machineId,
      machineMac: requestedMac,
      sessionId: session.sessionId,
      host: session.hostAddress || '10.0.2.2',
      port: session.listenPort,
      textOnly: true,
      timestamp: Date.now()
    });
    socket.end();
  }

  #send(socket, payload) {
    try {
      socket.write(`${JSON.stringify(payload)}\n`);
    } catch (error) {
      this.onError(error);
    }
  }
}

function normalizeMacAddress(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    return '';
  }
  const hex = raw.replace(/[^0-9a-f]/g, '');
  if (hex.length !== 12) {
    return '';
  }
  return hex.match(/.{1,2}/g).join(':');
}

module.exports = {
  ClipboardBootstrapService,
  DEFAULT_BOOTSTRAP_PORT,
  PROTOCOL_VERSION,
  normalizeMacAddress
};
