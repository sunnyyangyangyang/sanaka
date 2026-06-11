import { describe, expect, it } from 'vitest';
import {
  hashText,
  normalizeLineEndingsForHost,
  normalizeLineEndingsForTransport
} from './ClipboardBridgeService';

describe('ClipboardBridgeService newline normalization', () => {
  it('normalizes CRLF and CR to LF for transport', () => {
    expect(normalizeLineEndingsForTransport('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('restores CRLF for Windows hosts', () => {
    expect(normalizeLineEndingsForHost('a\r\nb\rc\nd', 'win32')).toBe('a\r\nb\r\nc\r\nd');
  });

  it('keeps LF on non-Windows hosts', () => {
    expect(normalizeLineEndingsForHost('a\r\nb\rc\nd', 'darwin')).toBe('a\nb\nc\nd');
  });

  it('hashes equivalent newline variants identically', () => {
    expect(hashText('a\r\nb')).toBe(hashText('a\nb'));
    expect(hashText('a\rb')).toBe(hashText('a\nb'));
  });
});
