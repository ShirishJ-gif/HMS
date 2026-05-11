import { useEffect, useState } from 'react';
import { api, getApiErrorMessage } from './api/client';
import {
  clearStoredSession,
  getStoredActivePage,
  getStoredAuthUser,
  setStoredActivePage,
  storeAuthSession,
  subscribeToSessionUpdates,
} from './api/session';
import { AuthResponse, AuthUser } from './api/types';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { BookingsPage } from './pages/BookingsPage';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { ChannelManagerPage } from './pages/ChannelManagerPage';
import { DashboardPage } from './pages/DashboardPage';
import { GuestsPage } from './pages/GuestsPage';
import { HousekeepingPage } from './pages/HousekeepingPage';
import { OtaMappingPage } from './pages/OtaMappingPage';
import { OperationsBoardPage } from './pages/OperationsBoardPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { PropertySetupPage } from './pages/PropertySetupPage';
import { ReportsPage } from './pages/ReportsPage';
import { RoomsPage } from './pages/RoomsPage';
import { SupportConsolePage } from './pages/SupportConsolePage';
import { clearChannelWorkspaceCache, useChannelWorkspace } from './pages/channel/useChannelWorkspace';
import { WebhookSyncLogsPage } from './pages/WebhookSyncLogsPage';

type Page =
  | 'dashboard'
  | 'operations'
  | 'reports'
  | 'setup'
  | 'availability'
  | 'mapping'
  | 'rooms'
  | 'bookings'
  | 'guests'
  | 'housekeeping'
  | 'payments'
  | 'channels'
  | 'webhooks'
  | 'support'
  | 'audit';

const pages: Array<{ id: Page; label: string; section: string; icon: SidebarIconName }> = [
  { id: 'dashboard', label: 'Dashboard', section: 'Overview', icon: 'dashboard' },
  { id: 'reports', label: 'Reports & Analytics', section: 'Overview', icon: 'clipboard' },
  { id: 'operations', label: 'Operations Board', section: 'Operations', icon: 'pulse' },
  { id: 'bookings', label: 'Reservations', section: 'Operations', icon: 'calendar' },
  { id: 'guests', label: 'Guests', section: 'Operations', icon: 'guest' },
  { id: 'rooms', label: 'Rooms & Inventory', section: 'Operations', icon: 'bed' },
  { id: 'housekeeping', label: 'Housekeeping', section: 'Operations', icon: 'sparkles' },
  { id: 'availability', label: 'Availability & Rates', section: 'Commercial', icon: 'chart' },
  { id: 'mapping', label: 'OTA Mapping', section: 'Commercial', icon: 'puzzle' },
  { id: 'setup', label: 'Property Setup', section: 'Commercial', icon: 'settings' },
  { id: 'payments', label: 'Payments & Folios', section: 'Finance', icon: 'wallet' },
  { id: 'channels', label: 'Channel Manager', section: 'Integrations', icon: 'puzzle' },
  { id: 'webhooks', label: 'Webhooks & Sync Logs', section: 'Integrations', icon: 'activity' },
  { id: 'support', label: 'Support Console', section: 'Admin', icon: 'activity' },
  { id: 'audit', label: 'Audit Logs', section: 'Admin', icon: 'shield' },
];

type SidebarIconName =
  | 'brand'
  | 'dashboard'
  | 'clipboard'
  | 'pulse'
  | 'calendar'
  | 'guest'
  | 'bed'
  | 'sparkles'
  | 'chart'
  | 'settings'
  | 'wallet'
  | 'puzzle'
  | 'activity'
  | 'shield'
  | 'menu'
  | 'close'
  | 'logout';

export function App() {
  const [activePage, setActivePage] = useState<Page>(() => {
    const storedPage = getStoredActivePage();
    return isPage(storedPage) ? storedPage : 'dashboard';
  });
  const [user, setUser] = useState<AuthUser | null>(() => getStoredAuthUser());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const activePageMeta = pages.find((page) => page.id === activePage) ?? pages[0];
  const channelWorkspaceActive = isChannelWorkspacePage(activePage);
  const channelWorkspace = useChannelWorkspace({
    enabled: Boolean(user) && channelWorkspaceActive,
    diagnosticsEnabled: activePage === 'webhooks',
    sessionKey: user?.id ?? 'anonymous',
  });

  useEffect(() => subscribeToSessionUpdates(setUser), []);

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  function handlePageSelect(pageId: Page) {
    setActivePage(pageId);
    setStoredActivePage(pageId);
    setMobileNavOpen(false);
  }

  return (
    <div className="app-shell">
      <aside className={mobileNavOpen ? 'sidebar mobile-open' : 'sidebar'}>
        <div className="sidebar-brand sidebar-brand-row">
          <span className="sidebar-brand-badge">
            <SidebarIcon name="brand" />
          </span>
          <div>
            <h1>HMS Admin</h1>
            <p className="sidebar-copy">Hotel operations</p>
          </div>
          <button
            aria-label="Close navigation"
            className="mobile-nav-close"
            onClick={() => setMobileNavOpen(false)}
            type="button"
          >
            <SidebarIcon name="close" />
          </button>
        </div>

        <nav aria-label="Admin pages">
          {Array.from(new Set(pages.map((page) => page.section))).map((section) => (
            <div className="nav-group" key={section}>
              <p className="nav-group-label">{section}</p>
              <div className="nav-list">
                {pages
                  .filter((page) => page.section === section)
                  .map((page) => (
                    <button
                      className={activePage === page.id ? 'nav-item active' : 'nav-item'}
                      key={page.id}
                      onClick={() => handlePageSelect(page.id)}
                      type="button"
                    >
                      <span className="nav-item-icon">
                        <SidebarIcon name={page.icon} />
                      </span>
                      {page.label}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div className="sidebar-user-copy">
            <strong>{user.name}</strong>
            <span>{user.role.replace('_', ' ')}</span>
          </div>
          <button
            className="sidebar-user-action"
            onClick={() => {
              clearChannelWorkspaceCache(user.id);
              clearStoredSession();
              setMobileNavOpen(false);
              setUser(null);
            }}
            type="button"
          >
            <SidebarIcon name="logout" />
          </button>
        </div>
      </aside>
      <button
        aria-hidden={!mobileNavOpen}
        className={mobileNavOpen ? 'mobile-nav-backdrop visible' : 'mobile-nav-backdrop'}
        onClick={() => setMobileNavOpen(false)}
        tabIndex={mobileNavOpen ? 0 : -1}
        type="button"
      />

      <main className="main-panel">
        <div className="mobile-topbar">
          <button
            aria-expanded={mobileNavOpen}
            aria-label="Open navigation"
            className="mobile-topbar-action"
            onClick={() => setMobileNavOpen(true)}
            type="button"
          >
            <SidebarIcon name="menu" />
          </button>
          <div className="mobile-topbar-copy">
            <p>{activePageMeta.section}</p>
            <strong>{activePageMeta.label}</strong>
          </div>
        </div>
        {activePage === 'dashboard' && <DashboardPage />}
        {activePage === 'reports' && <ReportsPage />}
        {activePage === 'operations' && <OperationsBoardPage />}
        {activePage === 'setup' && <PropertySetupPage />}
        {activePage === 'availability' && <AvailabilityPage />}
        {activePage === 'mapping' && <OtaMappingPage workspace={channelWorkspace} />}
        {activePage === 'rooms' && <RoomsPage />}
        {activePage === 'bookings' && <BookingsPage />}
        {activePage === 'guests' && <GuestsPage />}
        {activePage === 'housekeeping' && <HousekeepingPage />}
        {activePage === 'payments' && <PaymentsPage />}
        {activePage === 'channels' && <ChannelManagerPage workspace={channelWorkspace} />}
        {activePage === 'webhooks' && <WebhookSyncLogsPage workspace={channelWorkspace} />}
        {activePage === 'support' && <SupportConsolePage />}
        {activePage === 'audit' && <AuditLogsPage />}
      </main>
    </div>
  );
}

function isPage(value: string | null): value is Page {
  return value != null && pages.some((page) => page.id === value);
}

function isChannelWorkspacePage(page: Page) {
  return page === 'mapping' || page === 'channels' || page === 'webhooks';
}

function SidebarIcon({ name }: { name: SidebarIconName }) {
  const sharedProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
  };

  switch (name) {
    case 'brand':
      return (
        <svg {...sharedProps}>
          <path d="M4 20h16" />
          <path d="M7 20V8l5-3 5 3v12" />
          <path d="M10 20v-5h4v5" />
          <path d="M9 10h.01M15 10h.01M9 13h.01M15 13h.01" />
        </svg>
      );
    case 'dashboard':
      return (
        <svg {...sharedProps}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M6 10.5V20h12v-9.5" />
        </svg>
      );
    case 'pulse':
      return (
        <svg {...sharedProps}>
          <path d="M3 12h4l2.2-4 4.1 8 2.3-4H21" />
          <path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case 'clipboard':
      return (
        <svg {...sharedProps}>
          <rect x="6" y="4" width="12" height="16" rx="2" />
          <path d="M9 4.5h6v3H9zM9 10h6M9 14h6" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...sharedProps}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 9h16" />
        </svg>
      );
    case 'guest':
      return (
        <svg {...sharedProps}>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case 'bed':
      return (
        <svg {...sharedProps}>
          <path d="M3 18V8M3 14h18M7 11h4a2 2 0 0 1 2 2v1M13 10h5a3 3 0 0 1 3 3v5" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg {...sharedProps}>
          <path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3L7.5 7.5l3.3-1.2Z" />
          <path d="m5 14 .7 1.8L7.5 17l-1.8.7L5 19.5l-.7-1.8L2.5 17l1.8-.7ZM18.5 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...sharedProps}>
          <path d="M5 19V9M12 19V5M19 19v-8" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...sharedProps}>
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
          <path d="m19.4 15 .1-6-2-.6-.8-1.8 1-1.9-4.3-2.5-1.5 1.4h-2l-1.5-1.4L4.1 4.7l1 1.9-.8 1.8-2 .6-.1 6 2 .6.8 1.8-1 1.9 4.3 2.5 1.5-1.4h2l1.5 1.4 4.3-2.5-1-1.9.8-1.8Z" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...sharedProps}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M15 12h6M17 10v4" />
        </svg>
      );
    case 'puzzle':
      return (
        <svg {...sharedProps}>
          <path d="M9 4h4a2 2 0 0 1 4 0h3v5a2 2 0 0 0 0 4v5h-5a2 2 0 0 1-4 0H6v-5a2 2 0 0 0 0-4V4Z" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...sharedProps}>
          <path d="M3 12h4l2.2-4 3.6 8 2.2-4H21" />
          <path d="M4 5h16" />
          <path d="M4 19h16" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...sharedProps}>
          <path d="m12 3 7 3v5c0 4.3-2.7 8.2-7 10-4.3-1.8-7-5.7-7-10V6Z" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...sharedProps}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'close':
      return (
        <svg {...sharedProps}>
          <path d="M6 6 18 18M18 6 6 18" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...sharedProps}>
          <path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
          <path d="M10 12h10M17 8l4 4-4 4" />
        </svg>
      );
    default:
      return null;
  }
}

function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [email, setEmail] = useState('admin@hms.local');
  const [password, setPassword] = useState('Admin@12345');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await api.post<AuthResponse>('/auth/login', { email, password });
      storeAuthSession(response.data);
      onLogin(response.data.user);
    } catch (loginError) {
      setError(getApiErrorMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submitLogin}>
        <p className="eyebrow">Secure access</p>
        <h1>HMS Admin</h1>
        <p className="page-subtitle">Sign in to manage properties, inventory, reservations, and operations.</p>
        <label>
          Email
          <input
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@hms.local"
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          Password
          <input
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
            type="password"
            value={password}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
        <p className="muted">Seed login: admin@hms.local / Admin@12345</p>
      </form>
    </main>
  );
}
