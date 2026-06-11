import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AppSettings, TemplateCatalogEntry } from '../domain/schemas';
import { SectionCard } from '../components/Field';
import { MaterialSelect, MaterialSelectField } from '../components/MaterialSelect';
import { Checkbox } from '../components/Checkbox';
import { useAppStore } from '../store/AppStore';
import { useT } from '../hooks/useT';

// Settings Icons
const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const CpuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
    <rect x="9" y="9" width="6" height="6"/>
    <line x1="9" y1="1" x2="9" y2="4"/>
    <line x1="15" y1="1" x2="15" y2="4"/>
    <line x1="9" y1="20" x2="9" y2="23"/>
    <line x1="15" y1="20" x2="15" y2="23"/>
    <line x1="20" y1="9" x2="23" y2="9"/>
    <line x1="20" y1="14" x2="23" y2="14"/>
    <line x1="1" y1="9" x2="4" y2="9"/>
    <line x1="1" y1="14" x2="4" y2="14"/>
  </svg>
);

const MonitorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

const LayoutGridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
  </svg>
);

const FlaskIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <path d="M10 2v7.31"/>
    <path d="M14 2v7.31"/>
    <path d="M8.5 2h7"/>
    <path d="M14 9.3a6.5 6.5 0 1 1-4 0"/>
    <path d="M12 9.3v-2"/>
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const tabs = ['general', 'files', 'runtime', 'displayAudio', 'templates', 'experimental', 'update'] as const;
const languageOptions = [
  { value: 'zh-CN', label: 'zh-CN' },
  { value: 'en-US', label: 'en-US' }
] as ReadonlyArray<{ value: AppSettings['language']; label: string }>;
const displayFrontendOptions = [
  { value: 'sanaka', label: 'Sanaka' }
] as const;
const displayBackendOptions = [
  { value: 'vnc', label: 'VNC' }
] as ReadonlyArray<{ value: AppSettings['runtimeDefaults']['displayBackendHint']; label: string }>;

function SettingsDrawerSection({
  active,
  children,
  description,
  onOpen,
  title
}: {
  active: boolean;
  children: ReactNode;
  description?: string;
  onOpen: () => void;
  title: string;
}) {
  const id = useId();

  return (
    <section className={active ? 'settings-drawer settings-drawer--active' : 'settings-drawer'}>
      <button className="settings-drawer__trigger" type="button" aria-expanded={active} aria-controls={id} onClick={onOpen}>
        <span>
          <strong>{title}</strong>
          {description ? <small>{description}</small> : null}
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>
      <div id={id} className="settings-drawer__content">
        <div className="settings-drawer__body">{children}</div>
      </div>
    </section>
  );
}

export function SettingsPage() {
  const { appMeta, settings, persistSettings, setTheme, importTemplateFromDialog, templates, updateTemplateCatalog, updateCurrentInfo, checkForUpdates, runtimeEnvironment } = useAppStore();
  const t = useT();
  const isWebMode = typeof window !== 'undefined' && window.location.protocol !== 'file:';
  const [params, setParams] = useSearchParams();
  const initialTab = params.get('tab');
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>(tabs.includes(initialTab as (typeof tabs)[number]) ? (initialTab as (typeof tabs)[number]) : 'general');
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [templateImportMessage, setTemplateImportMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextTab = params.get('tab');
    const resolvedTab = tabs.includes(nextTab as (typeof tabs)[number]) ? (nextTab as (typeof tabs)[number]) : 'general';
    if (resolvedTab !== activeTab) {
      setActiveTab(resolvedTab);
    }
  }, [activeTab, params]);

  const orderedTemplates = useMemo(() => [...templates].sort((a, b) => a.order - b.order), [templates]);
  const defaultMachineDirectory = settings.defaultSaveDirectory || appMeta?.defaultMachineDirectory || '';

  const patchSettings = async (patch: Partial<AppSettings>) => {
    await persistSettings({ ...settings, ...patch });
  };

  const reorder = async (key: string, offset: number) => {
    await updateTemplateCatalog((catalog) => {
      const index = catalog.findIndex((entry) => entry.key === key);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= catalog.length) return catalog;
      const next = [...catalog];
      const [entry] = next.splice(index, 1);
      next.splice(target, 0, entry);
      return next;
    });
  };

  const handleCheckUpdates = async () => {
    setChecking(true);
    setCheckMessage(null);
    try {
      const result = await checkForUpdates({ silent: false });
      if (result.error) {
        setCheckMessage(t('settings.checkFailed'));
      } else if (!result.hasUpdate) {
        setCheckMessage(t('settings.alreadyLatest'));
      }
    } catch {
      setCheckMessage(t('settings.checkFailed'));
    } finally {
      setChecking(false);
      setTimeout(() => setCheckMessage(null), 3000);
    }
  };

  const handleImportTemplate = async () => {
    const result = await importTemplateFromDialog();
    setTemplateImportMessage(result.message ?? null);
    if (result.message) {
      setTimeout(() => setTemplateImportMessage(null), 4000);
    }
  };

  const renderTemplateRow = (entry: TemplateCatalogEntry) => (
    <div key={entry.key} className="template-row">
      <div className="template-row__info">
        <div className="template-row__icon">
          {entry.key.includes('windows') ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
            </svg>
          ) : entry.key.includes('linux') ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.41v.019c.002.089.008.179.026.266.03.134.06.2.116.333l.003.003c.054.13.155.198.26.202.066.004.13-.036.2-.124a.52.52 0 01-.146.042c-.113 0-.193-.04-.26-.092-.065-.054-.113-.132-.165-.2-.053-.2-.082-.4-.086-.6v-.02c0-.133.027-.266.07-.4.04-.134.1-.2.166-.333.066-.134.133-.2.233-.266.1-.066.2-.066.3-.066zm-1.8 3.768c.04 0 .074.006.1.02.128.066.243.2.343.4.1.2.166.465.2.732.033.266.033.533.033.8 0 .266-.033.533-.1.732-.066.2-.166.4-.266.533-.1.133-.233.2-.366.2-.133 0-.233-.067-.333-.2-.1-.133-.2-.333-.266-.533-.066-.2-.1-.466-.1-.732 0-.267.033-.534.1-.8.066-.267.166-.532.266-.732.1-.2.233-.334.366-.4.066-.033.133-.02.2-.02zm3.134 0c.067 0 .134.006.2.02.133.066.266.2.366.4.1.2.2.465.266.732.066.266.1.533.1.8 0 .266-.034.532-.1.732-.066.2-.166.4-.266.533-.1.133-.233.2-.366.2-.133 0-.266-.067-.366-.2-.1-.133-.2-.333-.266-.533-.067-.2-.1-.466-.1-.732 0-.267.033-.534.1-.8.066-.267.166-.532.266-.732.1-.2.233-.334.366-.4.066-.033.133-.02.2-.02z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M14.658 0a8.01 8.01 0 00-5.613 2.309l.034.034-.029.029a7.933 7.933 0 00-2.336 5.659v.007c0 .247.012.49.034.73a6.66 6.66 0 01-.715-.122c-1.67-.36-3.39-.144-4.896.605A6.23 6.23 0 00.608 13.74a6.235 6.235 0 00.605 4.896 6.23 6.23 0 003.15 2.738c1.506.749 3.226.965 4.896.605.244-.053.483-.12.715-.199-.022.24-.034.483-.034.73a7.933 7.933 0 002.336 5.659l.029.029-.034.034a8.01 8.01 0 005.613 2.309 8.01 8.01 0 005.613-2.309l-.034-.034.029-.029a7.933 7.933 0 002.336-5.659v-.007c0-.247-.012-.49-.034-.73.232.079.471.146.715.199 1.67.36 3.39.144 4.896-.605a6.23 6.23 0 002.738-3.15 6.235 6.235 0 00-.605-4.896 6.23 6.23 0 00-3.15-2.738c-1.506-.749-3.226-.965-4.896-.605-.244.053-.483.12-.715.199.022-.24.034-.483.034-.73a7.933 7.933 0 00-2.336-5.659l-.029-.029.034-.034A8.01 8.01 0 0014.658 0z"/>
            </svg>
          )}
        </div>
        <div className="template-row__text">
          <strong>{entry.label}</strong>
          <span className="template-row__source">{entry.source === 'builtin' ? t('settings.templateBuiltIn') : t('settings.templateImported')}</span>
        </div>
      </div>
      <div className="template-row__actions">
        <div className="template-row__control">
          <span className="template-row__label">{t('settings.frontend')}</span>
          <div className="info-panel" style={{ padding: '10px 12px' }}>
            <strong>Sanaka</strong>
            <p style={{ margin: 0 }}>VNC</p>
          </div>
        </div>
        <div className="template-row__reorder">
          <button className="button button--ghost button--icon" type="button" onClick={() => void reorder(entry.key, -1)} title={t('common.moveUp')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="M18 15l-6-6-6 6"/>
            </svg>
          </button>
          <button className="button button--ghost button--icon" type="button" onClick={() => void reorder(entry.key, 1)} title={t('common.moveDown')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>
        <label className="ios-toggle ios-toggle--small" aria-label={t('common.enabled')}>
          <input
            checked={entry.enabled}
            type="checkbox"
            onChange={(event) =>
              void updateTemplateCatalog((catalog) =>
                catalog.map((item) => (item.key === entry.key ? { ...item, enabled: event.target.checked } : item))
              )
            }
          />
          <span className="ios-toggle__track">
            <span className="ios-toggle__thumb" />
          </span>
        </label>
      </div>
    </div>
  );

  return (
    <div className="page page--settings">
      <div className="workspace-header">
        <div>
          <span className="eyebrow">{t('app.settings')}</span>
          <h1>{t('settings.title')}</h1>
          <p>{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="settings-drawer-list">
        {tabs.map((tab) => {
          const active = activeTab === tab;
          const openSection = () => {
            setActiveTab(tab);
            setParams({ tab });
          };

          return (
            <SettingsDrawerSection key={tab} active={active} title={t(`settings.tabs.${tab}`)} description={t(`settings.${tab === 'displayAudio' ? 'displayAudio' : tab}Description`)} onOpen={openSection}>
              {tab === 'general' ? (
                <SectionCard title={t('settings.tabs.general')} description={t('settings.generalDescription')} icon={<GlobeIcon />}>
              <MaterialSelectField label={t('settings.language')} value={settings.language} options={languageOptions} onChange={(nextValue) => void patchSettings({ language: nextValue })} />
              <div className="field">
                <span className="field__label">{t('settings.theme')}</span>
                <div className="theme-toggle">
                  <button
                    className={settings.theme === 'light' ? 'theme-toggle__btn theme-toggle__btn--active' : 'theme-toggle__btn'}
                    type="button"
                    onClick={() => void setTheme('light')}
                  >
                    <SunIcon />
                    <span>{t('settings.light')}</span>
                  </button>
                  <button
                    className={settings.theme === 'dark' ? 'theme-toggle__btn theme-toggle__btn--active' : 'theme-toggle__btn'}
                    type="button"
                    onClick={() => void setTheme('dark')}
                  >
                    <MoonIcon />
                    <span>{t('settings.dark')}</span>
                  </button>
                </div>
              </div>
                </SectionCard>
              ) : null}

              {tab === 'files' ? (
                <SectionCard title={t('settings.tabs.files')} description={t('settings.filesDescription')} icon={<FolderIcon />}>
              <label className="field">
                <span className="field__label">{t('settings.savePath')}</span>
                <input value={defaultMachineDirectory} onChange={(event) => void patchSettings({ defaultSaveDirectory: event.target.value })} placeholder={appMeta?.defaultMachineDirectory ?? ''} />
              </label>
              <div className="info-panel">
                <strong>{t('settings.fileAssociation')}</strong>
                <p>{t('settings.fileAssociationHint')}</p>
              </div>
                </SectionCard>
              ) : null}

              {tab === 'runtime' ? (
                <SectionCard title={t('settings.tabs.runtime')} description={t('settings.runtimeDescription')} icon={<CpuIcon />}>
              <div className="field-grid field-grid--two">
                <div className="field">
                  <span className="field__label">{t('settings.frontend')}</span>
                  <div className="info-panel">
                    <strong>Sanaka</strong>
                    <p>{t('settings.displaySanaka')}</p>
                  </div>
                </div>
                <div className="field">
                  <span className="field__label">{t('settings.backend')}</span>
                  <div className="info-panel">
                    <strong>VNC</strong>
                    <p>{t('settings.displayVnc')}</p>
                  </div>
                </div>
              </div>
              <label className="field">
                <span className="field__label">{t('settings.webModePort')}</span>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={settings.webMode.port}
                  disabled={isWebMode}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value, 10);
                    if (!Number.isInteger(next)) {
                      return;
                    }
                    void patchSettings({
                      webMode: {
                        ...settings.webMode,
                        port: Math.max(1, Math.min(65535, next))
                      }
                    });
                  }}
                />
                <small className="field__hint">
                  {isWebMode ? t('settings.webModePortWebLocked') : t('settings.webModePortHint')}
                </small>
              </label>
              <div className="info-panel">
                <strong>QEMU Runtime</strong>
                <p style={{ marginBottom: '8px' }}>
                  {runtimeEnvironment
                    ? `${runtimeEnvironment.platform} / ${runtimeEnvironment.arch} · accelerators: ${runtimeEnvironment.accelerators.join(', ')}`
                    : 'Loading runtime environment...'}
                </p>
                {runtimeEnvironment ? (
                  <div className="settings-runtime-list">
                    {Object.entries(runtimeEnvironment.binaries).map(([key, binary]) => (
                      <div key={key} className="settings-runtime-entry">
                        <strong>{binary.name}</strong>
                        <p className="settings-runtime-copy">{binary.version || 'Version unavailable'}</p>
                        <p className="settings-runtime-copy settings-runtime-copy--path">{binary.path || 'Not found'}</p>
                      </div>
                    ))}
                    {runtimeEnvironment.searchRoots?.length ? (
                      <div className="settings-runtime-entry">
                        <strong>Search Roots</strong>
                        {runtimeEnvironment.searchRoots.map((root) => (
                          <p key={root} className="settings-runtime-copy settings-runtime-copy--path">
                            {root}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
                </SectionCard>
              ) : null}

              {tab === 'displayAudio' ? (
                <SectionCard title={t('settings.tabs.displayAudio')} description={t('settings.displayAudioDescription')} icon={<MonitorIcon />}>
                  <div className="display-grid">
                    <div className="display-card display-card--active">
                      <strong>Sanaka</strong>
                      <span>{t('settings.displaySanaka')}</span>
                      <span className="display-card__checkbox">✓</span>
                    </div>
                    <div className="display-card display-card--active">
                      <strong>VNC</strong>
                      <span>{t('settings.displayVnc')}</span>
                      <span className="display-card__checkbox">✓</span>
                    </div>
                  </div>
                </SectionCard>
              ) : null}

              {tab === 'templates' ? (
                <SectionCard title={t('settings.tabs.templates')} description={t('settings.templatesDescription')} icon={<LayoutGridIcon />}>
              <div className="action-row">
                <button className="button button--primary" type="button" onClick={() => void handleImportTemplate()}>
                  {t('settings.importTemplate')}
                </button>
              </div>
              {templateImportMessage ? (
                <div className="info-panel" style={{ marginBottom: '12px' }}>
                  <p style={{ margin: 0 }}>{templateImportMessage}</p>
                </div>
              ) : null}
              <div className="template-library">{orderedTemplates.map(renderTemplateRow)}</div>
                </SectionCard>
              ) : null}

              {tab === 'experimental' ? (
                <SectionCard title={t('settings.tabs.experimental')} description={t('settings.experimentalDescription')} icon={<FlaskIcon />}>
              <Checkbox
                checked={settings.experimental.brandedHero}
                onChange={(checked) => void patchSettings({ experimental: { ...settings.experimental, brandedHero: checked } })}
                label={t('settings.experimentalHero')}
              />
              <Checkbox
                checked={settings.experimental.advancedConsole}
                onChange={(checked) => void patchSettings({ experimental: { ...settings.experimental, advancedConsole: checked } })}
                label={t('settings.experimentalConsole')}
              />
              <Checkbox
                checked={settings.experimental.protocolInspector}
                onChange={(checked) => void patchSettings({ experimental: { ...settings.experimental, protocolInspector: checked } })}
                label={t('settings.experimentalInspector')}
              />
                </SectionCard>
              ) : null}

              {tab === 'update' ? (
                <SectionCard title={t('settings.tabs.update')} description={t('settings.updateDescription')} icon={<DownloadIcon />}>
                  <div className="field">
                    <span className="field__label">{t('settings.currentVersion')}</span>
                    <div className="info-panel">
                      <strong>{updateCurrentInfo?.currentVersion || '0.0.1'}</strong>
                    </div>
                  </div>
                  <div className="field">
                    <span className="field__label">{t('settings.currentChannel')}</span>
                    <div className="info-panel">
                      <strong>{updateCurrentInfo?.currentChannel || 'Beta'}</strong>
                    </div>
                  </div>
                  <div className="field">
                    <span className="field__label">{t('settings.skippedVersion')}</span>
                    <div className="info-panel">
                      <strong>{updateCurrentInfo?.skippedVersion || t('settings.noSkippedVersion')}</strong>
                    </div>
                  </div>
                  <div className="action-row">
                    <button
                      className="button button--primary"
                      type="button"
                      onClick={() => void handleCheckUpdates()}
                      disabled={checking}
                    >
                      {checking ? t('settings.checkingUpdates') : t('settings.checkUpdates')}
                    </button>
                  </div>
                  {checkMessage ? (
                    <div className="info-panel" style={{ marginTop: '8px' }}>
                      <p style={{ margin: 0 }}>{checkMessage}</p>
                    </div>
                  ) : null}
                </SectionCard>
              ) : null}
            </SettingsDrawerSection>
          );
        })}
      </div>
    </div>
  );
}
