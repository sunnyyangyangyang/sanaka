import { useCallback, useState } from 'react';
import { useT } from '../hooks/useT';
import type { RuntimeCommandPreview } from '../types/electron';

interface DebugCommandPanelProps {
  bundlePath: string | undefined;
}

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      width: '16px',
      height: '16px',
      transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
      transition: 'transform 200ms ease'
    }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const TerminalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export function DebugCommandPanel({ bundlePath }: DebugCommandPanelProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<RuntimeCommandPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (!bundlePath) {
      setError(t('details.debugCommandNoPath'));
      setExpanded(true);
      return;
    }
    setExpanded(true);
    if (preview) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.runtime.previewMachineCommand(bundlePath);
      setPreview(result);
    } catch (e) {
      setError(t('details.debugCommandError'));
    } finally {
      setLoading(false);
    }
  }, [bundlePath, expanded, preview, t]);

  const handleCopy = useCallback(async () => {
    if (!preview?.commandLine) return;
    try {
      await navigator.clipboard.writeText(preview.commandLine);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [preview]);

  if (!bundlePath) {
    return (
      <div className="debug-command-panel debug-command-panel--muted">
        <div className="debug-command-panel__header">
          <TerminalIcon />
          <span>{t('details.debugCommandTitle')}</span>
        </div>
        <p className="debug-command-panel__hint">{t('details.debugCommandNoPath')}</p>
      </div>
    );
  }

  return (
    <div className={`debug-command-panel${expanded ? ' debug-command-panel--expanded' : ''}`}>
      <button
        className="debug-command-panel__header"
        type="button"
        onClick={handleToggle}
        aria-expanded={expanded ? 'true' : 'false'}
      >
        <span className="debug-command-panel__title">
          <TerminalIcon />
          <span>{t('details.debugCommandTitle')}</span>
        </span>
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <div className="debug-command-panel__body">
          {loading && <p className="debug-command-panel__hint">{t('common.loading')}</p>}
          {error && <p className="debug-command-panel__error">{error}</p>}
          {preview && (
            <div className="debug-command-panel__content">
              <div className="debug-command-panel__field">
                <span>{t('details.debugCommandBinary')}</span>
                <code>{preview.binaryPath}</code>
              </div>
              <div className="debug-command-panel__field">
                <span>{t('details.debugCommandAccelerator')}</span>
                <code>{preview.accelerator}</code>
              </div>
              <div className="debug-command-panel__field">
                <span>{t('details.debugCommandDisplay')}</span>
                <code>
                  {preview.display.frontend} / {preview.display.backend} / {preview.display.port}
                  {preview.display.websocketPort ? ` / ws:${preview.display.websocketPort}` : ''}
                </code>
              </div>
              <div className="debug-command-panel__field">
                <span>{t('details.debugCommandQmp')}</span>
                <code>
                  {preview.qmp.transport === 'unix' ? preview.qmp.path : `tcp:${preview.qmp.host}:${preview.qmp.port}`}
                </code>
              </div>
              <div className="debug-command-panel__field debug-command-panel__field--block">
                <span>{t('details.debugCommandArgs')}</span>
                <pre className="debug-command-panel__args">
                  {preview.args.map((arg, i) => (
                    <span key={i} className="debug-command-panel__arg">{arg}</span>
                  ))}
                </pre>
              </div>
              <div className="debug-command-panel__field debug-command-panel__field--block">
                <div className="debug-command-panel__field-header">
                  <span>{t('details.debugCommandLine')}</span>
                  <button
                    className="debug-command-panel__copy-btn"
                    type="button"
                    onClick={handleCopy}
                    title={copied ? t('common.copied') : t('common.copy')}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    <span>{copied ? t('common.copied') : t('common.copy')}</span>
                  </button>
                </div>
                <pre className="debug-command-panel__command-line">{preview.commandLine}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
