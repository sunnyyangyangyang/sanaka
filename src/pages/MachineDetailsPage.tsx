import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DebugCommandPanel } from '../components/DebugCommandPanel';
import { MachineVisual } from '../components/MachineVisual';
import { SectionCard, StatusChip } from '../components/Field';
import { useT } from '../hooks/useT';
import { formatRuntimeBackend } from '../lib/console-session';
import { makeAudioHint, makeDisplayHint } from '../lib/machine';
import { consoleRoute } from '../lib/routes';
import { useAppStore } from '../store/AppStore';

const TrashIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

function statusLabel(
  status: string | undefined,
  t: ReturnType<typeof useT>
): string {
  switch (status) {
    case 'starting':
      return t('common.states.starting');
    case 'running':
      return t('common.states.running');
    case 'stopping':
      return t('common.states.stopping');
    case 'stopped':
      return t('common.states.stopped');
    default:
      return t('common.notStarted');
  }
}

function statusTone(status: string | undefined): 'success' | undefined {
  if (status === 'running') return 'success';
  if (status === 'starting' || status === 'stopping') return undefined;
  return undefined;
}

export function MachineDetailsPage() {
  const {
    draft,
    openSakaByPath,
    saveDraft,
    settings,
    runtimeEnvironment,
    getRuntimeStateForMachine,
    startMachine,
    triggerTransition,
    setDeleteTarget
  } = useAppStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const t = useT();
  const pendingConsolePathRef = useRef<string | null>(null);

  useEffect(() => {
    const pathParam = params.get('path');
    if (pathParam && draft?.filePath !== pathParam) {
      void openSakaByPath(pathParam).then((result) => {
        if (!result) {
          navigate('/', { replace: true });
        }
      });
    }
  }, [draft?.filePath, navigate, openSakaByPath, params]);

  useEffect(() => {
    if (!draft?.filePath) return;
    if (pendingConsolePathRef.current !== draft.filePath) return;
    const pendingRuntimeState = getRuntimeStateForMachine(draft.machine.id);
    if (!pendingRuntimeState || (pendingRuntimeState.status !== 'starting' && pendingRuntimeState.status !== 'running')) return;

    pendingConsolePathRef.current = null;
    navigate(consoleRoute(pendingRuntimeState.machineId, draft.filePath), { replace: true });
  }, [draft?.filePath, draft?.machine.id, getRuntimeStateForMachine, navigate]);

  if (!draft) {
    return <div className="page-loading">{t('common.loading')}</div>;
  }

  const machine = draft.machine;
  const runtimeState = getRuntimeStateForMachine(machine.id);
  const machineStatus = runtimeState?.status;
  const isMachineRunning = machineStatus === 'running' || machineStatus === 'starting';
  const qemuAvailable = runtimeEnvironment?.available ?? false;
  const audioHint = makeAudioHint(machine.display.frontend, machine.display.sanaka?.backend ?? settings.runtimeDefaults.displayBackendHint, machine.advanced.audio_backend);

  const handlePlayClick = () => {
    if (!draft.filePath || !qemuAvailable) return;
    if (isMachineRunning) {
      triggerTransition('console', () => {
        navigate(consoleRoute(machine.id, draft.filePath!));
      });
    } else {
      triggerTransition('launch', async () => {
        pendingConsolePathRef.current = draft.filePath!;
        const result = await startMachine(draft.filePath!);
        if (result.ok) {
          navigate(consoleRoute(result.machineId ?? machine.id, result.machinePath));
          return;
        }
        pendingConsolePathRef.current = null;
      });
    }
  };

  return (
    <>
      <div className="page page--details">
        <div className="workspace-header">
          <div>
            <span className="eyebrow">{t('common.machine')}</span>
            <h1>{machine.title}</h1>
            <p>{machine.template.label}</p>
            <div className="details-meta">
              <StatusChip tone={statusTone(machineStatus)}>
                {statusLabel(machineStatus, t)}
              </StatusChip>
              <StatusChip tone="accent">{machine.template.label}</StatusChip>
              <StatusChip>{`${t('details.metaDisplay')} · ${makeDisplayHint(machine)}`}</StatusChip>
              <StatusChip>{`${t('details.metaDisks')} · ${machine.disks.length}`}</StatusChip>
            </div>
          </div>
          <div className="workspace-header__actions">
            <button className="button button--secondary" type="button" onClick={() => navigate('/machines/new')}>
              {t('details.editConfig')}
            </button>
          </div>
        </div>

        <div className="details-layout details-layout--single">
          <div className="details-main">
            <section className="details-hero">
              <MachineVisual
                entry={{
                  path: draft.filePath,
                  previewImageUrl: draft.previewPath,
                  templateLabel: machine.template.label,
                  status: draft.dirty ? 'draft' : 'saved'
                }}
                className="details-hero__preview"
                imageClassName="details-hero__preview-image"
                placeholderLabel={t('home.previewEmpty')}
                isRunning={isMachineRunning}
                onPlayClick={qemuAvailable ? handlePlayClick : undefined}
              />
              <div className="details-hero__summary">
                <div className="details-hero__copy">
                  <strong>{machine.title}</strong>
                  <p>{machine.template.label}</p>
                </div>
                <div className="details-hero__chips">
                  <StatusChip tone={statusTone(machineStatus)}>
                    {statusLabel(machineStatus, t)}
                  </StatusChip>
                  <StatusChip tone="accent">{machine.template.label}</StatusChip>
                </div>
                <div className="details-hero__actions">
                  <button className="button button--secondary" type="button" onClick={() => void saveDraft('save')}>
                    {t('details.saveMachine')}
                  </button>
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={!qemuAvailable}
                    onClick={handlePlayClick}
                    title={!qemuAvailable ? t('details.qemuMissingHint') : undefined}
                  >
                    {isMachineRunning ? t('details.enterMachine') : t('details.openConsole')}
                  </button>
                </div>
              </div>
            </section>

            {!qemuAvailable && (
              <div className="warning-banner warning-banner--details" role="alert">
                <strong>{t('common.qemuMissing')}</strong>
                {runtimeEnvironment?.installHint && (
                  <span className="warning-banner__hint">
                    {runtimeEnvironment.installHint}
                  </span>
                )}
              </div>
            )}

            <SectionCard title={t('details.overview')}>
              <div className="details-fact-list">
                <div className="details-fact-row">
                  <span>{t('common.machine')}</span>
                  <strong>{machine.title}</strong>
                </div>
                <div className="details-fact-row">
                  <span>{t('common.template')}</span>
                  <strong>{machine.template.label}</strong>
                </div>
                <div className="details-fact-row">
                  <span>{t('details.status')}</span>
                  <strong>{statusLabel(machineStatus, t)}</strong>
                </div>
              </div>
            </SectionCard>

            <SectionCard title={t('details.configuration')}>
              <div className="config-grid">
                <div className="config-item">
                  <span>{t('details.display')}</span>
                  <strong>{makeDisplayHint(machine)}</strong>
                </div>
                <div className="config-item">
                  <span>{t('details.audio')}</span>
                  <strong>{audioHint}</strong>
                </div>
                <div className="config-item">
                  <span>{t('details.network')}</span>
                  <strong>{machine.network.enabled ? `${machine.network.mode} / ${machine.network.card}` : t('common.disabled')}</strong>
                </div>
                <div className="config-item">
                  <span>{t('details.media')}</span>
                  <strong>{machine.media.iso || t('details.noMedia')}</strong>
                </div>
                <div className="config-item">
                  <span>{t('details.disks')}</span>
                  <strong>{machine.disks.length}</strong>
                </div>
                <div className="config-item">
                  <span>{t('details.architecture')}</span>
                  <strong>{machine.system.arch}</strong>
                </div>
              </div>
            </SectionCard>

            <SectionCard title={t('details.runtimeInfoTitle')}>
              <div className="config-grid">
                <div className="config-item">
                  <span>{t('details.runtimeQemuStatus')}</span>
                  <strong>{qemuAvailable ? t('details.runtimeQemuAvailable') : t('details.runtimeQemuUnavailable')}</strong>
                </div>
                <div className="config-item">
                  <span>{t('details.runtimeDisplayBackend')}</span>
                  <strong>
                    {runtimeState
                      ? formatRuntimeBackend(runtimeState)
                      : t('details.runtimeNotRunning')}
                  </strong>
                </div>
                <div className="config-item">
                  <span>{t('details.runtimeDisplayPort')}</span>
                  <strong>{runtimeState ? String(runtimeState.displayPort) : '—'}</strong>
                </div>
                {runtimeState?.displayWebSocketPort != null && (
                  <div className="config-item">
                    <span>{t('details.runtimeWebsocketPort')}</span>
                    <strong>{String(runtimeState.displayWebSocketPort)}</strong>
                  </div>
                )}
                <div className="config-item">
                  <span>{t('details.runtimeLastError')}</span>
                  <strong style={runtimeState?.lastError ? { color: 'var(--danger)' } : undefined}>
                    {runtimeState?.lastError ?? t('details.runtimeNoError')}
                  </strong>
                </div>
              </div>
            </SectionCard>

            <DebugCommandPanel bundlePath={draft.filePath} />

            {draft.filePath ? (
              <section className="danger-zone" aria-label={t('details.deleteTitle')}>
                <div>
                  <strong>{t('details.deleteTitle')}</strong>
                  <p>{t('details.deleteDescription')}</p>
                </div>
                <button
                  className="icon-button icon-button--danger"
                  type="button"
                  onClick={() => setDeleteTarget({ path: draft.filePath!, title: machine.title })}
                  aria-label={t('details.deleteMachine')}
                  title={t('details.deleteMachine')}
                  style={{ display: 'grid', placeItems: 'center', flexShrink: 0 }}
                >
                  <TrashIcon style={{ width: '20px', height: '20px' }} />
                </button>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
