import { useEffect, useRef, useState } from 'react';
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
  | 'dashboard' | 'operations' | 'reports' | 'setup'
  | 'availability' | 'mapping' | 'rooms' | 'bookings'
  | 'guests' | 'housekeeping' | 'payments' | 'channels'
  | 'webhooks' | 'support' | 'audit';

const navGroups = [
  {
    section: 'Overview',
    pages: [
      { id: 'dashboard' as Page, label: 'Dashboard', icon: 'dashboard' },
      { id: 'reports' as Page, label: 'Reports & Analytics', icon: 'clipboard' },
    ],
  },
  {
    section: 'Operations',
    pages: [
      { id: 'operations' as Page, label: 'Operations Board', icon: 'pulse' },
      { id: 'bookings' as Page, label: 'Reservations', icon: 'calendar' },
      { id: 'guests' as Page, label: 'Guests', icon: 'guest' },
      { id: 'rooms' as Page, label: 'Rooms & Inventory', icon: 'bed' },
      { id: 'housekeeping' as Page, label: 'Housekeeping', icon: 'sparkles' },
    ],
  },
  {
    section: 'Commercial',
    pages: [
      { id: 'availability' as Page, label: 'Availability & Rates', icon: 'chart' },
      { id: 'mapping' as Page, label: 'OTA Mapping', icon: 'puzzle' },
      { id: 'setup' as Page, label: 'Property Setup', icon: 'settings' },
    ],
  },
  {
    section: 'Finance',
    pages: [
      { id: 'payments' as Page, label: 'Payments & Folios', icon: 'wallet' },
    ],
  },
  {
    section: 'Integrations',
    pages: [
      { id: 'channels' as Page, label: 'Channel Manager', icon: 'puzzle' },
      { id: 'webhooks' as Page, label: 'Webhooks & Sync Logs', icon: 'activity' },
    ],
  },
  {
    section: 'Admin',
    pages: [
      { id: 'support' as Page, label: 'Support Console', icon: 'activity' },
      { id: 'audit' as Page, label: 'Audit Logs', icon: 'shield' },
    ],
  },
];

export function App() {
  const [activePage, setActivePage] = useState<Page>(() => {
    const stored = getStoredActivePage();
    return isPage(stored) ? stored : 'dashboard';
  });
  const [user, setUser] = useState<AuthUser | null>(() => getStoredAuthUser());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sidebarNavRef = useRef<HTMLElement | null>(null);
  const activePageMeta = navGroups.flatMap((g) => g.pages).find((p) => p.id === activePage) ?? navGroups[0].pages[0];
  const channelWorkspaceActive = isChannelWorkspacePage(activePage);
  const channelWorkspace = useChannelWorkspace({
    enabled: Boolean(user) && channelWorkspaceActive,
    diagnosticsEnabled: activePage === 'webhooks',
    sessionKey: user?.id ?? 'anonymous',
  });

  useEffect(() => subscribeToSessionUpdates(setUser), []);

  useEffect(() => {
    if (!user) return;

    const scrollArea = sidebarNavRef.current;
    if (!scrollArea) return;
    const scroller = scrollArea;

    let touchStartY = 0;

    function shouldBlockBoundaryScroll(deltaY: number) {
      if (Math.abs(deltaY) < 0.5) return false;
      if (scroller.scrollHeight <= scroller.clientHeight) return true;

      const atTop = scroller.scrollTop <= 0;
      const atBottom = Math.ceil(scroller.scrollTop + scroller.clientHeight) >= scroller.scrollHeight;

      return (deltaY < 0 && atTop) || (deltaY > 0 && atBottom);
    }

    function handleWheel(event: WheelEvent) {
      if (shouldBlockBoundaryScroll(event.deltaY)) {
        event.preventDefault();
      }
    }

    function handleTouchStart(event: TouchEvent) {
      touchStartY = event.touches[0]?.clientY ?? 0;
    }

    function handleTouchMove(event: TouchEvent) {
      const touchY = event.touches[0]?.clientY;
      if (touchY == null) return;

      if (shouldBlockBoundaryScroll(touchStartY - touchY)) {
        event.preventDefault();
      }

      touchStartY = touchY;
    }

    scroller.addEventListener('wheel', handleWheel, { passive: false });
    scroller.addEventListener('touchstart', handleTouchStart, { passive: true });
    scroller.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      scroller.removeEventListener('wheel', handleWheel);
      scroller.removeEventListener('touchstart', handleTouchStart);
      scroller.removeEventListener('touchmove', handleTouchMove);
    };
  }, [user]);

  if (!user) return <LoginPage onLogin={setUser} />;

  function handlePageSelect(pageId: Page) {
    setActivePage(pageId);
    setStoredActivePage(pageId);
    setMobileNavOpen(false);
  }

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden overscroll-none bg-slate-50">
      {/* Sidebar */}
      <aside
        className={[
          'flex flex-col flex-shrink-0 w-64 bg-[#0c1829] h-dvh min-h-dvh overflow-hidden transition-transform duration-200 z-30',
          'fixed top-0 bottom-0 left-0 lg:sticky lg:top-0 lg:bottom-auto',
          mobileNavOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.06] flex-shrink-0">
          <span className="w-9 h-9 rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-300 flex items-center justify-center flex-shrink-0 shadow-sm shadow-black/10">
            <NavIcon name="brand" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[15px] font-extrabold text-slate-50 tracking-tight leading-none">HMS Admin</h1>
            <p className="text-[11px] text-slate-400/80 font-semibold mt-1 leading-none">Hotel operations</p>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto lg:hidden w-7 h-7 rounded-lg text-slate-400 hover:text-slate-200 flex items-center justify-center"
          >
            <NavIcon name="close" />
          </button>
        </div>

        {/* Nav */}
        <nav ref={sidebarNavRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-none px-3 py-3 space-y-4" aria-label="Admin pages">
          {navGroups.map((group) => (
            <div key={group.section}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500/70 px-2 pb-1.5">{group.section}</p>
              <div className="space-y-0.5">
                {group.pages.map((page) => {
                  const isActive = activePage === page.id;
                  return (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => handlePageSelect(page.id)}
                      className={[
                        'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-left transition-all duration-150',
                        isActive
                          ? 'bg-indigo-500/20 border border-indigo-400/20 text-slate-100'
                          : 'text-slate-300/75 border border-transparent hover:bg-white/[0.06] hover:text-slate-100',
                      ].join(' ')}
                    >
                      <span className={`flex-shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400/60'}`}>
                        <NavIcon name={page.icon} />
                      </span>
                      {page.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User card */}
        <div className="flex items-center gap-3 px-4 py-4 border-t border-white/[0.06] flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate leading-tight">{user.name}</p>
            <p className="text-[11px] text-slate-400/70 capitalize leading-tight mt-0.5">{user.role.replace('_', ' ')}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              clearChannelWorkspaceCache(user.id);
              clearStoredSession();
              setMobileNavOpen(false);
              setUser(null);
            }}
            className="w-8 h-8 rounded-lg border border-white/[0.07] bg-white/[0.04] text-slate-400/70 hover:bg-rose-500/15 hover:text-rose-300 hover:border-rose-500/20 transition-all flex items-center justify-center flex-shrink-0"
          >
            <NavIcon name="logout" />
          </button>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileNavOpen && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
        />
      )}

      {/* Main panel */}
      <main className="flex-1 min-w-0 overflow-y-auto overscroll-contain scrollbar-none h-dvh min-h-dvh">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-2 lg:hidden">
          <button
            type="button"
            aria-expanded={mobileNavOpen}
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
            className="w-9 h-9 border border-slate-200 rounded-lg bg-white shadow-sm text-slate-600 flex items-center justify-center flex-shrink-0"
          >
            <NavIcon name="menu" />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{navGroups.find((g) => g.pages.some((p) => p.id === activePage))?.section}</p>
            <p className="text-[15px] font-bold text-slate-900 leading-tight">{activePageMeta.label}</p>
          </div>
        </div>

        <div className="px-6 lg:px-8 py-6">
          {activePage === 'dashboard'    && <DashboardPage />}
          {activePage === 'reports'      && <ReportsPage />}
          {activePage === 'operations'   && <OperationsBoardPage />}
          {activePage === 'setup'        && <PropertySetupPage />}
          {activePage === 'availability' && <AvailabilityPage />}
          {activePage === 'mapping'      && <OtaMappingPage workspace={channelWorkspace} />}
          {activePage === 'rooms'        && <RoomsPage />}
          {activePage === 'bookings'     && <BookingsPage />}
          {activePage === 'guests'       && <GuestsPage />}
          {activePage === 'housekeeping' && <HousekeepingPage />}
          {activePage === 'payments'     && <PaymentsPage />}
          {activePage === 'channels'     && <ChannelManagerPage workspace={channelWorkspace} />}
          {activePage === 'webhooks'     && <WebhookSyncLogsPage workspace={channelWorkspace} />}
          {activePage === 'support'      && <SupportConsolePage />}
          {activePage === 'audit'        && <AuditLogsPage />}
        </div>
      </main>
    </div>
  );
}

function isPage(value: string | null): value is Page {
  return value != null && navGroups.flatMap((g) => g.pages).some((p) => p.id === value);
}

function isChannelWorkspacePage(page: Page) {
  return page === 'mapping' || page === 'channels' || page === 'webhooks';
}

function NavIcon({ name }: { name: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.8, viewBox: '0 0 24 24', className: 'w-4 h-4' };
  switch (name) {
    case 'brand':    return <svg {...p} className="w-[18px] h-[18px]"><path d="M5 20h14"/><path d="M7 20V8.5L12 5l5 3.5V20"/><path d="M10 20v-5h4v5"/><path d="M9.5 11h.01M14.5 11h.01"/></svg>;
    case 'dashboard':return <svg {...p}><path d="M3 11.5 12 4l9 7.5"/><path d="M6 10.5V20h12v-9.5"/></svg>;
    case 'pulse':    return <svg {...p}><path d="M3 12h4l2.2-4 4.1 8 2.3-4H21"/><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>;
    case 'clipboard':return <svg {...p}><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4.5h6v3H9zM9 10h6M9 14h6"/></svg>;
    case 'calendar': return <svg {...p}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></svg>;
    case 'guest':    return <svg {...p}><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>;
    case 'bed':      return <svg {...p}><path d="M3 18V8M3 14h18M7 11h4a2 2 0 0 1 2 2v1M13 10h5a3 3 0 0 1 3 3v5"/></svg>;
    case 'sparkles': return <svg {...p}><path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3L7.5 7.5l3.3-1.2Z"/><path d="m5 14 .7 1.8L7.5 17l-1.8.7L5 19.5l-.7-1.8L2.5 17l1.8-.7ZM18.5 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/></svg>;
    case 'chart':    return <svg {...p}><path d="M5 19V9M12 19V5M19 19v-8"/></svg>;
    case 'settings': return <svg {...p}><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1-6-2-.6-.8-1.8 1-1.9-4.3-2.5-1.5 1.4h-2l-1.5-1.4L4.1 4.7l1 1.9-.8 1.8-2 .6-.1 6 2 .6.8 1.8-1 1.9 4.3 2.5 1.5-1.4h2l1.5 1.4 4.3-2.5-1-1.9.8-1.8Z"/></svg>;
    case 'wallet':   return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M15 12h6M17 10v4"/></svg>;
    case 'puzzle':   return <svg {...p}><path d="M9 4h4a2 2 0 0 1 4 0h3v5a2 2 0 0 0 0 4v5h-5a2 2 0 0 1-4 0H6v-5a2 2 0 0 0 0-4V4Z"/></svg>;
    case 'activity': return <svg {...p}><path d="M3 12h4l2.2-4 3.6 8 2.2-4H21"/><path d="M4 5h16"/><path d="M4 19h16"/></svg>;
    case 'shield':   return <svg {...p}><path d="m12 3 7 3v5c0 4.3-2.7 8.2-7 10-4.3-1.8-7-5.7-7-10V6Z"/></svg>;
    case 'menu':     return <svg {...p}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'close':    return <svg {...p}><path d="M6 6 18 18M18 6 6 18"/></svg>;
    case 'logout':   return <svg {...p}><path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M10 12h10M17 8l4 4-4 4"/></svg>;
    default: return null;
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
    <main className="min-h-screen bg-gradient-to-br from-[#0c1829] via-slate-800 to-[#0f172a] flex items-center justify-center p-4">
      <form onSubmit={submitLogin} className="bg-white rounded-2xl shadow-2xl w-full max-w-[26rem] p-8 flex flex-col gap-5">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-2">Secure access</p>
          <h1 className="text-[1.75rem] font-extrabold text-slate-900 tracking-tight leading-tight">HMS Admin</h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">Sign in to manage properties, inventory, reservations, and operations.</p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-600">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@hms.local"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-600">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
          />
        </label>
        {error && <p className="text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-xl transition shadow-sm shadow-emerald-600/20 text-sm"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-xs text-slate-400">Seed login: admin@hms.local / Admin@12345</p>
      </form>
    </main>
  );
}
