import net from 'net';
import { describe, expect, it } from 'vitest';
import {
  ClipboardBootstrapService,
  normalizeMacAddress
} from './ClipboardBootstrapService';

function readSingleLine(port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      buffer += chunk;
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        socket.end();
        resolve(JSON.parse(line));
      }
    });
    socket.on('error', reject);
  });
}

describe('ClipboardBootstrapService', () => {
  it('normalizes incoming MAC addresses', () => {
    expect(normalizeMacAddress('52-54-00-AB-CD-EF')).toBe('52:54:00:ab:cd:ef');
    expect(normalizeMacAddress('525400abcdef')).toBe('52:54:00:ab:cd:ef');
    expect(normalizeMacAddress('')).toBe('');
  });

  it('returns the active clipboard session for a known machine MAC', async () => {
    const port = 17935;
    const service = new ClipboardBootstrapService({
      port,
      resolveSessionByMac: (machineMac) => {
        if (machineMac === '52:54:00:ab:cd:ef') {
          return {
            machineId: 'vm-1',
            sessionId: 'session-1',
            hostAddress: '10.0.2.2',
            listenPort: 48123
          };
        }
        return null;
      }
    });

    await service.start();
    try {
      const response = await readSingleLine(port, {
        type: 'bootstrap_request',
        protocolVersion: 1,
        machineMac: '52-54-00-AB-CD-EF'
      });

      expect(response).toEqual(
        expect.objectContaining({
          type: 'bootstrap_ack',
          machineId: 'vm-1',
          machineMac: '52:54:00:ab:cd:ef',
          sessionId: 'session-1',
          host: '10.0.2.2',
          port: 48123
        })
      );
    } finally {
      await service.stop();
    }
  });
});
