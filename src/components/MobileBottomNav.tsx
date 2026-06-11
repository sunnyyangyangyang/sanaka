import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/AppStore';
import { useT } from '../hooks/useT';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <button
      className={`mobile-bottom-nav__item ${active ? 'mobile-bottom-nav__item--active' : ''}`}
      type="button"
      onClick={onClick}
      aria-label={label}
    >
      <span className="mobile-bottom-nav__icon">{icon}</span>
      <span className="mobile-bottom-nav__label">{label}</span>
    </button>
  );
}

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const MachineIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 12l10 5 10-5" opacity="0.75" />
    <path d="M2 17l10 5 10-5" opacity="0.5" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const AboutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { openAboutDialog } = useAppStore();
  const t = useT();

  const isHome = location.pathname === '/';
  const isMachines = location.pathname.startsWith('/machines') && !location.pathname.includes('/new');
  const isCreate = location.pathname === '/machines/new';
  const isSettings = location.pathname === '/settings';

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <NavItem
        icon={<HomeIcon />}
        label={t('home.sidebarHome')}
        active={isHome}
        onClick={() => navigate('/')}
      />
      <NavItem
        icon={<MachineIcon />}
        label={t('home.recentMachines')}
        active={isMachines}
        onClick={() => navigate('/')}
      />
      <NavItem
        icon={<PlusIcon />}
        label={t('home.sidebarCreate')}
        active={isCreate}
        onClick={() => navigate(`/machines/new?template=win11&fresh=${Date.now()}`)}
      />
      <NavItem
        icon={<SettingsIcon />}
        label={t('home.sidebarSettings')}
        active={isSettings}
        onClick={() => navigate('/settings')}
      />
      <NavItem
        icon={<AboutIcon />}
        label={t('home.sidebarAbout')}
        active={false}
        onClick={openAboutDialog}
      />
    </nav>
  );
}
