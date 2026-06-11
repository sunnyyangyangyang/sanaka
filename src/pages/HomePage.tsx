import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MachineVisual } from '../components/MachineVisual';
import { StatusChip } from '../components/Field';
import { useT } from '../hooks/useT';
import { formatRuntimeBackend } from '../lib/console-session';
import { checkMachinePaths, makeWorkspaceMachineItems, resolveWorkspaceSelection } from '../lib/machine';
import { consoleRoute, machineRoute } from '../lib/routes';
import { useAppStore } from '../store/AppStore';
import type { WorkspaceMachineItem } from '../domain/schemas';

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

// 虚拟机卡片组件
interface MachineCardProps {
  item: WorkspaceMachineItem;
  onClick: () => void;
  status?: string;
  isRunning?: boolean;
}

function MachineCard({ item, onClick, status, isRunning }: MachineCardProps) {
  const t = useT();
  const { getRuntimeStateForMachine } = useAppStore();
  const runtimeState = getRuntimeStateForMachine(item.id);
  const machineStatus = runtimeState?.status;
  const running = machineStatus === 'running' || machineStatus === 'starting';

  return (
    <button
      className={`machine-list-card ${item.missing ? 'machine-list-card--missing' : ''}`}
      type="button"
      onClick={onClick}
      disabled={item.missing}
    >
      <div className="machine-list-card__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 12l10 5 10-5" opacity="0.75" />
          <path d="M2 17l10 5 10-5" opacity="0.5" />
        </svg>
      </div>
      <div className="machine-list-card__content">
        <div className="machine-list-card__title">{item.title}</div>
        <div className="machine-list-card__subtitle">
          {item.templateLabel ?? t('common.machine')}
          {item.author && <span className="machine-list-card__author"> · {item.author}</span>}
        </div>
      </div>
      <div className="machine-list-card__status">
        <StatusChip tone={statusTone(machineStatus)}>
          {statusLabel(machineStatus, t)}
        </StatusChip>
      </div>
      {running && <div className="machine-list-card__indicator" />}
    </button>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    draft,
    recents,
    openSakaDialog,
    openSakaByPath,
    createDraftFromDisk,
    runtimeEnvironment,
    getRuntimeStateForMachine,
    startMachine,
    triggerTransition,
    deleteMachine
  } = useAppStore();
  const t = useT();
  const pendingConsolePathRef = useRef<string | null>(null);
  const baseItems = useMemo(
    () => makeWorkspaceMachineItems(recents, draft),
    [draft, recents]
  );
  const [checkedItems, setCheckedItems] = useState<WorkspaceMachineItem[]>(baseItems);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await checkMachinePaths(baseItems);
      if (!cancelled) setCheckedItems(result);
    })();
    return () => { cancelled = true; };
  }, [baseItems]);

  const workspace = useMemo(
    () => resolveWorkspaceSelection(checkedItems, location.pathname, location.search, draft),
    [checkedItems, location.pathname, location.search, draft]
  );

  const primaryMachine = workspace.primary;
  const runtimeState = primaryMachine ? getRuntimeStateForMachine(primaryMachine.id) : undefined;
  const machineStatus = runtimeState?.status;
  const isMachineRunning = machineStatus === 'running' || machineStatus === 'starting';
  const qemuAvailable = runtimeEnvironment?.available ?? false;

  useEffect(() => {
    if (!primaryMachine?.path) return;
    if (pendingConsolePathRef.current !== primaryMachine.path) return;
    if (!runtimeState || (runtimeState.status !== 'starting' && runtimeState.status !== 'running')) return;

    pendingConsolePathRef.current = null;
    navigate(consoleRoute(runtimeState.machineId, primaryMachine.path), { replace: true });
  }, [navigate, primaryMachine?.path, runtimeState]);

  const handleOpenConfig = async () => {
    const result = await openSakaDialog();
    if (!result) return;
    navigate(result.kind === 'machine' ? machineRoute(result.machineId, result.path) : '/machines/new');
  };

  const handleImportDisk = async () => {
    const result = await createDraftFromDisk();
    if (!result) return;
    navigate('/machines/new');
  };

  const handleMachineClick = (item: WorkspaceMachineItem) => {
    if (item.missing) return;
    navigate(item.path ? machineRoute(item.id, item.path) : '/');
  };

  const handlePlayClick = () => {
    const path = primaryMachine?.path;
    const id = primaryMachine?.id;
    if (!qemuAvailable || !path || !id) return;
    if (isMachineRunning) {
      triggerTransition('console', () => {
        navigate(path ? consoleRoute(id, path) : '/machines/new');
      });
    } else {
      triggerTransition('launch', async () => {
        if (!path) {
          navigate('/machines/new');
          return;
        }
        pendingConsolePathRef.current = path;
        const result = await startMachine(path);
        if (result.ok) {
          const opened = await openSakaByPath(result.machinePath);
          navigate(consoleRoute(result.machineId ?? opened?.machineId ?? id, result.machinePath));
          return;
        }
        pendingConsolePathRef.current = null;
      });
    }
  };

  const handleDeleteMissing = async () => {
    if (!primaryMachine?.path) return;
    await deleteMachine(primaryMachine.path);
    navigate('/');
  };

  // 小屏幕：显示虚拟机列表
  const renderMachineList = () => (
    <div className="machine-list">
      <div className="machine-list__header">
        <h1 className="machine-list__title">{t('home.recentMachines')}</h1>
        <span className="machine-list__count">{workspace.items.length}</span>
      </div>
      {workspace.items.length === 0 ? (
        <div className="machine-list__empty">
          <div className="home-empty-state__content">
            <strong>{t('home.emptyTitle')}</strong>
            <p>{t('home.emptyDescription')}</p>
            <div className="home-empty-state__actions">
              <button className="button button--primary" type="button" onClick={() => navigate('/machines/new')}>
                {t('app.create')}
              </button>
              <button className="button button--secondary" type="button" onClick={handleOpenConfig}>
                {t('app.openTemplate')}
              </button>
            </div>
            <button className="button button--ghost button--inline" type="button" onClick={handleImportDisk}>
              {t('app.importDisk')}
            </button>
          </div>
        </div>
      ) : (
        <div className="machine-list__grid">
          {workspace.items.map((item) => (
            <MachineCard
              key={`${item.id}:${item.path ?? item.source}`}
              item={item}
              onClick={() => handleMachineClick(item)}
            />
          ))}
        </div>
      )}
    </div>
  );

  // 桌面端：显示原有布局
  const renderDesktopLayout = () => {
    if (!primaryMachine) {
      return (
        <div className="page page--home">
          <section className="home-empty-state" aria-label={t('home.emptyTitle')}>
            <div className="home-empty-state__content">
              <strong>{t('home.emptyTitle')}</strong>
              <p>{t('home.emptyDescription')}</p>
              <div className="home-empty-state__actions">
                <button className="button button--primary" type="button" onClick={() => navigate('/machines/new')}>
                  {t('app.create')}
                </button>
                <button className="button button--secondary" type="button" onClick={handleOpenConfig}>
                  {t('app.openTemplate')}
                </button>
              </div>
              <button className="button button--ghost button--inline" type="button" onClick={handleImportDisk}>
                {t('app.importDisk')}
              </button>
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="page page--home">
        <div className="workspace-focus">
          <section className="workspace-focus__hero">
            <MachineVisual
              entry={primaryMachine}
              className="workspace-focus__preview"
              imageClassName="workspace-focus__preview-image"
              placeholderLabel={t('home.previewEmpty')}
              isRunning={isMachineRunning}
              onPlayClick={qemuAvailable ? handlePlayClick : undefined}
            />
            <div className="workspace-focus__summary">
              <div className="workspace-focus__title">
                <div>
                  <span className="eyebrow">{t('home.focusEyebrow')}</span>
                  <h1>{primaryMachine.title}</h1>
                  <p>{primaryMachine.templateLabel ?? t('common.machine')}</p>
                </div>
                <div className="workspace-focus__chips">
                  <StatusChip tone={statusTone(machineStatus)}>
                    {statusLabel(machineStatus, t)}
                  </StatusChip>
                  {runtimeState && (
                    <StatusChip>
                      {formatRuntimeBackend(runtimeState)}
                    </StatusChip>
                  )}
                </div>
              </div>

              {primaryMachine.missing ? (
                <div className="machine-missing-state">
                  <div className="machine-missing-state__icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                  <p className="machine-missing-state__text">{t('home.machineMissing')}</p>
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={handleDeleteMissing}
                  >
                    {t('home.machineMissingDelete')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="workspace-focus__facts">
                    <div className="workspace-focus__fact">
                      <span>{t('common.template')}</span>
                      <strong>{primaryMachine.templateLabel ?? t('common.machine')}</strong>
                    </div>
                    <div className="workspace-focus__fact">
                      <span>{t('home.focusUpdated')}</span>
                      <strong>{new Date(primaryMachine.updatedAt).toLocaleString()}</strong>
                    </div>
                    <div className="workspace-focus__fact">
                      <span>{t('common.status')}</span>
                      <strong>{statusLabel(machineStatus, t)}</strong>
                    </div>
                  </div>

                  {!qemuAvailable && (
                    <div className="warning-banner" role="alert">
                      {t('common.qemuMissing')}
                      {runtimeEnvironment?.installHint && (
                        <span className="warning-banner__hint" style={{ fontSize: '0.78rem' }}>
                          {runtimeEnvironment.installHint}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="workspace-focus__actions">
                    <button
                      className="button button--primary"
                      type="button"
                      disabled={!qemuAvailable}
                      onClick={handlePlayClick}
                      title={!qemuAvailable ? t('details.qemuMissingHint') : undefined}
                    >
                      {isMachineRunning ? t('home.cardEnterMachine') : t('home.cardOpenConsole')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 小屏幕：显示虚拟机列表 */}
      <div className="mobile-machine-list">
        {renderMachineList()}
      </div>
      {/* 桌面端：显示原有布局 */}
      <div className="desktop-layout">
        {renderDesktopLayout()}
      </div>
    </>
  );
}
