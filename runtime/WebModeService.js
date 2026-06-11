const http = require('http');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class WebModeService {
  constructor(options = {}) {
    this.appName = options.appName || 'Sanaka';
    this.appVersion = options.appVersion || '0.0.0';
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 0;
    this.getRuntimeSummary = options.getRuntimeSummary || (async () => ({}));
    this.server = null;
    this.startedAt = null;
    this.boundPort = null;
  }

  async start() {
    if (this.server && this.boundPort) {
      return this.getState();
    }

    await new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => {
        void this.#handleRequest(request, response);
      });

      const onError = (error) => {
        server.removeListener('listening', onListening);
        reject(error);
      };

      const onListening = () => {
        server.removeListener('error', onError);
        this.server = server;
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
    const url = active ? `http://${this.host}:${this.boundPort}/` : null;
    return {
      active,
      url,
      host: this.host,
      port: this.boundPort,
      startedAt: this.startedAt,
      localOnly: true
    };
  }

  async stop() {
    if (!this.server) {
      this.boundPort = null;
      this.startedAt = null;
      return;
    }

    const server = this.server;
    this.server = null;
    this.boundPort = null;
    this.startedAt = null;

    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  async #handleRequest(request, response) {
    const url = new URL(request.url || '/', `http://${this.host}:${this.boundPort || this.port || 80}`);

    if (url.pathname === '/api/status') {
      const payload = await this.#buildStatusPayload();
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      response.end(JSON.stringify(payload));
      return;
    }

    if (url.pathname === '/healthz') {
      response.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      response.end('ok');
      return;
    }

    const payload = await this.#buildStatusPayload();
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(this.#renderHtml(payload));
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

  #renderHtml(payload) {
    const appName = escapeHtml(payload.appName);
    const version = escapeHtml(payload.appVersion);
    const startedAt = payload.startedAt
      ? escapeHtml(new Date(payload.startedAt).toLocaleString('zh-CN', { hour12: false }))
      : 'unknown';
    const url = escapeHtml(payload.url || '');
    const runningMachines = Number(payload.runtimeSummary?.runningMachines || 0);
    const qemuAvailable = payload.runtimeSummary?.qemuAvailable ? '可用' : '不可用';

    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${appName} Web Mode</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f1fa;
        --panel: rgba(255,255,255,0.92);
        --line: rgba(146,121,200,0.22);
        --text: #2d2439;
        --muted: #6f6480;
        --accent: #a28ad5;
        --accent-strong: #7d64b8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(162,138,213,0.18), transparent 32%),
          linear-gradient(180deg, #fbf8ff 0%, var(--bg) 100%);
        color: var(--text);
        min-height: 100vh;
      }
      .shell {
        width: min(920px, calc(100% - 32px));
        margin: 32px auto;
        padding: 28px;
        border-radius: 24px;
        background: var(--panel);
        border: 1px solid var(--line);
        box-shadow: 0 18px 48px rgba(88, 68, 118, 0.08);
      }
      .eyebrow {
        display: inline-flex;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(162,138,213,0.12);
        color: var(--accent-strong);
        font-size: 12px;
        font-weight: 600;
      }
      h1 {
        margin: 16px 0 8px;
        font-size: 38px;
        line-height: 1.06;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 28px;
      }
      .card {
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.86);
        padding: 18px;
      }
      .label {
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .value {
        margin-top: 10px;
        font-size: 26px;
        font-weight: 700;
        color: var(--text);
      }
      code {
        display: block;
        margin-top: 10px;
        border-radius: 12px;
        background: rgba(45,36,57,0.05);
        padding: 12px 14px;
        color: var(--text);
        overflow-wrap: anywhere;
      }
      .note {
        margin-top: 24px;
        padding: 16px 18px;
        border-radius: 16px;
        background: rgba(162,138,213,0.08);
        border: 1px solid rgba(162,138,213,0.16);
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <span class="eyebrow">${appName} Web Mode Preview</span>
      <h1>${appName} 已打开网页模式</h1>
      <p>这是网页模式后端的本地入口页。桌面版仍然保持开启；未来这里会承载更完整的远程访问与控制能力。</p>

      <section class="grid">
        <article class="card">
          <div class="label">Version</div>
          <div class="value">${version}</div>
        </article>
        <article class="card">
          <div class="label">Running Machines</div>
          <div class="value">${runningMachines}</div>
        </article>
        <article class="card">
          <div class="label">QEMU</div>
          <div class="value">${qemuAvailable}</div>
        </article>
      </section>

      <section class="card" style="margin-top: 18px;">
        <div class="label">Local Address</div>
        <code>${url}</code>
      </section>

      <section class="note">
        <strong>说明</strong>
        <p style="margin-top: 8px;">这版默认不会自动关闭桌面窗口。想回到桌面版时，直接重新激活或重新打开 Sanaka.app 即可。</p>
        <p style="margin-top: 8px;">服务启动时间：${startedAt}</p>
      </section>
    </main>
  </body>
</html>`;
  }
}

module.exports = {
  WebModeService
};
