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
    <div className="grid h-dvh min-h-0 w-full grid-cols-1 overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200/90 min-[901px]:grid-cols-[17rem_1fr]">
      <aside
        className={[
          'relative z-40 flex h-dvh min-h-0 w-full flex-col gap-5 overflow-x-hidden overflow-y-auto border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-5 text-slate-100 shadow-[4px_0_40px_-12px_rgba(0,0,0,0.35)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          'max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:w-[min(22rem,86vw)] max-[900px]:border-r max-[900px]:px-4 max-[900px]:py-5 max-[900px]:shadow-2xl max-[900px]:transition-transform max-[900px]:duration-200 max-[900px]:ease-out',
          mobileNavOpen ? 'max-[900px]:translate-x-0' : 'max-[900px]:-translate-x-full',
        ].join(' ')}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_0%,rgba(45,212,191,0.12),transparent_55%),radial-gradient(ellipse_80%_60%_at_0%_100%,rgba(99,102,241,0.14),transparent_50%)] opacity-90"
        />
        <div className="relative flex shrink-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-teal-500/25 text-white shadow-inner ring-1 ring-white/15">
              <SidebarIcon className="h-5 w-5" name="brand" />
            </span>
            <div className="min-w-0">
              <h1 className="m-0 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-lg font-bold tracking-tight text-transparent sm:text-xl">
                HMS Admin
              </h1>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-teal-300/90">Hotel operations</p>
            </div>
          </div>
          <button
            aria-label="Close navigation"
            className="hidden max-[900px]:inline-flex max-[900px]:h-10 max-[900px]:w-10 max-[900px]:shrink-0 max-[900px]:items-center max-[900px]:justify-center max-[900px]:rounded-xl max-[900px]:border max-[900px]:border-white/15 max-[900px]:bg-white/10 max-[900px]:text-white max-[900px]:shadow-sm max-[900px]:backdrop-blur-sm max-[900px]:transition hover:bg-white/15"
            onClick={() => setMobileNavOpen(false)}
            type="button"
          >
            <SidebarIcon className="h-5 w-5" name="close" />
          </button>
        </div>

        <nav aria-label="Admin pages" className="relative flex min-h-0 flex-1 flex-col gap-5">
          {Array.from(new Set(pages.map((page) => page.section))).map((section) => (
            <div className="flex flex-col gap-2" key={section}>
              <p className="m-0 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-500">{section}</p>
              <div className="flex flex-col gap-1">
                {pages
                  .filter((page) => page.section === section)
                  .map((page) => {
                    const active = activePage === page.id;
                    return (
                      <button
                        className={[
                          'group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-[0.92rem] font-semibold transition',
                          active
                            ? 'border-teal-400/35 bg-gradient-to-r from-teal-500/20 via-emerald-500/10 to-indigo-500/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                            : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white',
                        ].join(' ')}
                        key={page.id}
                        onClick={() => handlePageSelect(page.id)}
                        type="button"
                      >
                        <span
                          className={[
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 transition',
                            active
                              ? 'bg-white/15 text-white ring-white/20'
                              : 'bg-white/5 text-slate-400 ring-white/5 group-hover:bg-white/10 group-hover:text-white',
                          ].join(' ')}
                        >
                          <SidebarIcon className="h-[1.05rem] w-[1.05rem]" name={page.icon} />
                        </span>
                        <span className="min-w-0 flex-1 leading-snug">{page.label}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative mt-auto flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-inner backdrop-blur-sm">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/40 to-teal-600/35 text-sm font-bold text-white ring-2 ring-white/10">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-sm font-semibold text-white">{user.name}</strong>
            <span className="block truncate text-xs font-medium capitalize text-slate-400">
              {user.role.replace('_', ' ')}
            </span>
          </div>
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-rose-400/30 hover:bg-rose-500/15 hover:text-rose-100"
            onClick={() => {
              clearChannelWorkspaceCache(user.id);
              clearStoredSession();
              setMobileNavOpen(false);
              setUser(null);
            }}
            title="Sign out"
            type="button"
          >
            <SidebarIcon className="h-[1.05rem] w-[1.05rem]" name="logout" />
          </button>
        </div>
      </aside>
      <button
        aria-hidden={!mobileNavOpen}
        className={[
          'fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-[2px] transition-opacity min-[901px]:hidden',
          mobileNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        onClick={() => setMobileNavOpen(false)}
        tabIndex={mobileNavOpen ? 0 : -1}
        type="button"
      />

      <main className="h-dvh min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-10 pt-4 [scrollbar-width:none] sm:px-6 md:px-6 md:pb-12 md:pt-5 max-[900px]:pt-3 [&::-webkit-scrollbar]:hidden max-sm:h-auto max-sm:min-h-0 max-sm:overflow-y-visible max-sm:px-4 max-sm:pb-8 max-sm:pt-3">
        <div className="mb-4 hidden max-[900px]:flex max-[900px]:items-center max-[900px]:gap-3">
          <button
            aria-expanded={mobileNavOpen}
            aria-label="Open navigation"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-800 shadow-md shadow-slate-900/10 ring-1 ring-white/80 transition hover:border-indigo-200 hover:bg-slate-50"
            onClick={() => setMobileNavOpen(true)}
            type="button"
          >
            <SidebarIcon className="h-5 w-5" name="menu" />
          </button>
          <div className="min-w-0">
            <p className="m-0 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-500">{activePageMeta.section}</p>
            <strong className="block truncate text-base font-bold text-slate-900">{activePageMeta.label}</strong>
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

function SidebarIcon({ className, name }: { className?: string; name: SidebarIconName }) {
  const sharedProps = {
    className: className ?? 'h-5 w-5',
    fill: 'none' as const,
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
