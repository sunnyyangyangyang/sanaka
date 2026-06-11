const fs = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');
const { fileURLToPath } = require('url');
const WebSocket = require('ws');
const { webModeApiSpec, transformWebModeArgs } = require('./webModeApi');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon'
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeError(error) {
  if (!error) {
    return { message: 'Unknown error.' };
  }

  if (error instanceof Error) {
    return {
      message: error.message || 'Unknown error.',
      code: error.code
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return {
    message: String(error)
  };
}

class WebModeService {
  constructor(options = {}) {
    this.appName = options.appName || 'Sanaka';
    this.appVersion = options.appVersion || '0.0.0';
    this.host = options.host || '0.0.0.0';
    this.port = options.port || 0;
    this.distDir = options.distDir;
    this.getRuntimeSummary = options.getRuntimeSummary || (async () => ({}));
    this.invokeHandlers = options.invokeHandlers || {};
    this.server = null;
    this.wsServer = null;
    this.startedAt = null;
    this.boundPort = null;
    this.clients = new Set();
    this.socketPairs = new Set();
    this.channelHandlers = this.#buildChannelHandlers();
    this.browserApiScript = this.#buildBrowserApiScript();
  }

  async start() {
    if (this.server && this.boundPort) {
      return this.getState();
    }

    await new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => {
        void this.#handleRequest(request, response);
      });
      const wsServer = new WebSocket.Server({ noServer: true });

      server.on('upgrade', (request, socket, head) => {
        void this.#handleUpgrade(request, socket, head, wsServer);
      });

      const onError = (error) => {
        server.removeListener('listening', onListening);
        reject(error);
      };

      const onListening = () => {
        server.removeListener('error', onError);
        this.server = server;
        this.wsServer = wsServer;
        this.startedAt = new Date().toISOString();
        this.boundPort = server.address()?.port || this.port;
        resolve();
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this.port, this.host);
    });

    return this.getState();
  }

  getState() {
    const active = Boolean(this.server && this.boundPort);
    const localUrl = active ? `http://127.0.0.1:${this.boundPort}/` : null;
    const networkHost = this.#resolvePrimaryNetworkHost();
    const networkUrl = active && networkHost ? `http://${networkHost}:${this.boundPort}/` : null;
    const url = networkUrl || localUrl;
    return {
      active,
      url,
      localUrl,
      networkUrl,
      host: this.host,
      port: this.boundPort,
      startedAt: this.startedAt,
      localOnly: this.host === '127.0.0.1' || this.host === 'localhost'
    };
  }

  async stop() {
    if (!this.server) {
      this.boundPort = null;
      this.startedAt = null;
      return;
    }

    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
    this.#closeSocketPairs();
    if (this.wsServer) {
      try {
        this.wsServer.close();
      } catch {
        // ignore
      }
      this.wsServer = null;
    }

    const server = this.server;
    this.server = null;
    this.boundPort = null;
    this.startedAt = null;

    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  emit(channel, payload) {
    if (this.clients.size === 0) {
      return;
    }

    const data = `event: ${channel}\ndata: ${JSON.stringify(payload ?? null)}\n\n`;
    for (const client of this.clients) {
      client.write(data);
    }
  }

  async #handleRequest(request, response) {
    const url = new URL(request.url || '/', `http://${this.host}:${this.boundPort || this.port || 80}`);

    if (url.pathname === '/api/status') {
      const payload = await this.#buildStatusPayload();
      this.#writeJson(response, 200, payload);
      return;
    }

    if (url.pathname === '/api/events') {
      this.#handleEvents(response);
      return;
    }

    if (url.pathname === '/api/rpc' && request.method === 'POST') {
      await this.#handleRpc(request, response);
      return;
    }

    if (url.pathname === '/api/healthz') {
      response.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      response.end('ok');
      return;
    }

    if (url.pathname === '/api/file') {
      await this.#serveLocalFile(url, response);
      return;
    }

    if (url.pathname === '/web-bridge.js') {
      response.writeHead(200, {
        'Content-Type': MIME_TYPES['.js'],
        'Cache-Control': 'no-store'
      });
      response.end(this.browserApiScript);
      return;
    }

    await this.#serveDist(url.pathname, response);
  }

  async #handleUpgrade(request, socket, head, wsServer) {
    const url = new URL(request.url || '/', `http://${this.host}:${this.boundPort || this.port || 80}`);
    if (url.pathname !== '/api/novnc') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const port = Number.parseInt(url.searchParams.get('port') || '', 10);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (clientSocket) => {
      const targetSocket = new WebSocket(`ws://127.0.0.1:${port}`);
      const pair = { clientSocket, targetSocket };
      this.socketPairs.add(pair);

      const dispose = () => {
        this.socketPairs.delete(pair);
        if (clientSocket.readyState === WebSocket.OPEN || clientSocket.readyState === WebSocket.CONNECTING) {
          try {
            clientSocket.close();
          } catch {
            // ignore
          }
        }
        if (targetSocket.readyState === WebSocket.OPEN || targetSocket.readyState === WebSocket.CONNECTING) {
          try {
            targetSocket.close();
          } catch {
            // ignore
          }
        }
      };

      targetSocket.on('open', () => {
        clientSocket.on('message', (data, isBinary) => {
          if (targetSocket.readyState === WebSocket.OPEN) {
            targetSocket.send(data, { binary: isBinary });
          }
        });

        targetSocket.on('message', (data, isBinary) => {
          if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(data, { binary: isBinary });
          }
        });
      });

      clientSocket.on('close', dispose);
      targetSocket.on('close', dispose);
      clientSocket.on('error', dispose);
      targetSocket.on('error', dispose);
    });
  }

  #handleEvents(response) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive'
    });
    response.write('\n');
    this.clients.add(response);
    response.on('close', () => {
      this.clients.delete(response);
    });
  }

  async #handleRpc(request, response) {
    try {
      const rawBody = await this.#readRequestBody(request);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const channel = body?.channel;
      const args = Array.isArray(body?.args) ? body.args : [];

      const handler = this.channelHandlers[channel];
      if (typeof handler !== 'function') {
        this.#writeJson(response, 404, {
          ok: false,
          error: {
            message: `Unknown RPC channel: ${channel}`
          }
        });
        return;
      }

      const result = await handler(...args);
      this.#writeJson(response, 200, { ok: true, result });
    } catch (error) {
      this.#writeJson(response, 500, {
        ok: false,
        error: normalizeError(error)
      });
    }
  }

  async #serveDist(pathname, response) {
    if (!this.distDir) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Missing dist directory.');
      return;
    }

    const requestedPath = pathname === '/' ? '/web.html' : pathname;
    const safePath = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.join(this.distDir, safePath);

    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isDirectory()) {
        await this.#serveDist(path.join(requestedPath, 'index.html'), response);
        return;
      }

      let content = await fs.readFile(absolutePath);
      const ext = path.extname(absolutePath).toLowerCase();
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

      if (path.basename(absolutePath) === 'index.html' || path.basename(absolutePath) === 'web.html') {
        content = Buffer.from(this.#injectBridgeIntoHtml(content.toString('utf8')), 'utf8');
      }

      response.writeHead(200, {
        'Content-Type': mimeType,
        'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable'
      });
      response.end(content);
    } catch (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  }

  async #serveLocalFile(url, response) {
    const fileUrl = url.searchParams.get('url');
    const rawPath = url.searchParams.get('path');
    const filePath = this.#resolveLocalFilePath(fileUrl, rawPath);
    if (!filePath) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Missing file path.');
      return;
    }

    try {
      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      response.end(content);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  }

  #resolveLocalFilePath(fileUrl, rawPath) {
    if (fileUrl) {
      try {
        return fileURLToPath(fileUrl);
      } catch {
        return null;
      }
    }

    if (!rawPath) {
      return null;
    }

    if (/^\/[A-Za-z]:\//.test(rawPath)) {
      return rawPath.slice(1);
    }

    return rawPath;
  }

  async #buildStatusPayload() {
    const runtimeSummary = await this.getRuntimeSummary().catch(() => ({}));
    return {
      appName: this.appName,
      appVersion: this.appVersion,
      startedAt: this.startedAt,
      runtimeSummary,
      url: this.getState().url
    };
  }

  #injectBridgeIntoHtml(html) {
    const marker = '</head>';
    const scriptTag = '<script src="./web-bridge.js"></script>';
    if (html.includes(scriptTag)) {
      return html;
    }
    if (html.includes(marker)) {
      return html.replace(marker, `  ${scriptTag}\n${marker}`);
    }
    return `${scriptTag}\n${html}`;
  }

  #buildBrowserApiScript() {
    const contractJson = JSON.stringify(webModeApiSpec);
    const webSocketLoopbackPattern = '^ws://127\\\\.0\\\\.0\\\\.1:(\\\\d+)/?$';

    return `
(() => {
  const contract = ${contractJson};
  const originalUrlCtor = window.URL;
  let sharedEventSource = null;
  const eventListeners = new Map();

  function rewriteFileUrl(input) {
    if (typeof input !== 'string') {
      return input;
    }

    if (input.startsWith('file://')) {
      return window.location.origin + '/api/file?url=' + encodeURIComponent(input);
    }

    return input;
  }

  function rewriteWebSocketUrl(input) {
    if (typeof input !== 'string') {
      return input;
    }

    const match = input.match(new RegExp('${webSocketLoopbackPattern}', 'i'));
    if (match) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return protocol + '//' + window.location.host + '/api/novnc?port=' + encodeURIComponent(match[1]);
    }

    return input;
  }

  class BrowserURL extends originalUrlCtor {
    constructor(input, base) {
      super(rewriteFileUrl(input), base);
    }

    static createObjectURL(object) {
      return originalUrlCtor.createObjectURL(object);
    }

    static revokeObjectURL(url) {
      return originalUrlCtor.revokeObjectURL(url);
    }
  }

  window.URL = BrowserURL;
  const OriginalWebSocket = window.WebSocket;
  function BrowserWebSocket(url, protocols) {
    return new OriginalWebSocket(rewriteWebSocketUrl(url), protocols);
  }
  BrowserWebSocket.prototype = OriginalWebSocket.prototype;
  Object.setPrototypeOf(BrowserWebSocket, OriginalWebSocket);
  window.WebSocket = BrowserWebSocket;

  const imageSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (imageSrcDescriptor?.set && imageSrcDescriptor?.get) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      enumerable: imageSrcDescriptor.enumerable,
      get() {
        return imageSrcDescriptor.get.call(this);
      },
      set(value) {
        return imageSrcDescriptor.set.call(this, rewriteFileUrl(value));
      }
    });
  }

  function on(channel, handler) {
    if (typeof handler !== 'function') {
      return () => {};
    }

    if (!sharedEventSource) {
      sharedEventSource = new EventSource('./api/events');
    }

    const listener = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handler(payload);
      } catch {
        handler(undefined);
      }
    };

    sharedEventSource.addEventListener(channel, listener);
    if (!eventListeners.has(channel)) {
      eventListeners.set(channel, new Set());
    }
    eventListeners.get(channel).add(listener);
    return () => {
      if (!sharedEventSource) {
        return;
      }
      sharedEventSource.removeEventListener(channel, listener);
      const listeners = eventListeners.get(channel);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          eventListeners.delete(channel);
        }
      }
      if (eventListeners.size === 0) {
        sharedEventSource.close();
        sharedEventSource = null;
      }
    };
  }

  async function invoke(channel, ...args) {
    const [namespace, method] = channel.split(':');
    const payload = {
      namespace,
      method: method.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
      channel,
      args
    };

    const response = await fetch('./api/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({ ok: false, error: { message: 'Invalid RPC response.' } }));
    if (!response.ok || !data.ok) {
      throw new Error(data?.error?.message || 'RPC request failed.');
    }
    return data.result;
  }

  function bindNode(node) {
    if (!node || typeof node !== 'object') {
      return node;
    }

    if (node.type === 'invoke') {
      return (...args) => invoke(node.channel, ...args);
    }

    if (node.type === 'event') {
      return (handler) => on(node.channel, handler);
    }

    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, bindNode(value)]));
  }

  window.electronAPI = bindNode(contract);
  window.addEventListener('error', (event) => {
    console.error('[web-mode error]', event.error || event.message || event);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[web-mode unhandledrejection]', event.reason);
  });
})();
`;
  }

  #buildChannelHandlers() {
    const handlers = {};
    const walk = (node, stack = []) => {
      if (!node || typeof node !== 'object') {
        return;
      }

      if (node.type === 'invoke') {
        const namespace = stack[0];
        const method = stack[1];
        const namespaceHandlers = this.invokeHandlers?.[namespace];
        if (typeof namespaceHandlers?.[method] === 'function') {
          handlers[node.channel] = (...args) => namespaceHandlers[method](...transformWebModeArgs(node.argStyle, args));
        }
        return;
      }

      Object.entries(node).forEach(([key, value]) => walk(value, [...stack, key]));
    };

    walk(webModeApiSpec);
    return handlers;
  }

  async #readRequestBody(request) {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  #writeJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify(payload));
  }

  #closeSocketPairs() {
    for (const pair of this.socketPairs) {
      try {
        pair.clientSocket.close();
      } catch {
        // ignore
      }
      try {
        pair.targetSocket.close();
      } catch {
        // ignore
      }
    }
    this.socketPairs.clear();
  }

  #resolvePrimaryNetworkHost() {
    if (!this.server || !this.boundPort) {
      return null;
    }

    if (this.host && this.host !== '0.0.0.0' && this.host !== '::') {
      return this.host;
    }

    const interfaces = os.networkInterfaces();
    for (const records of Object.values(interfaces)) {
      if (!Array.isArray(records)) {
        continue;
      }

      for (const record of records) {
        if (!record || record.internal) {
          continue;
        }

        if (record.family === 'IPv4' && record.address) {
          return record.address;
        }
      }
    }

    return null;
  }
}

module.exports = {
  WebModeService
};
