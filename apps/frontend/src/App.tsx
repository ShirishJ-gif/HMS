import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { api, getApiErrorMessage, logoutSession } from './api/client';
import { fetchAllPages } from './api/pagination';
import {
  clearStoredSession,
  getStoredActivePage,
  getStoredAuthUser,
  setStoredActivePage,
  storeAuthSession,
  subscribeToSessionUpdates,
} from './api/session';
import { AuthResponse, AuthUser, Property } from './api/types';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { BookingsPage } from './pages/BookingsPage';
import { AvailabilityPage } from './pages/AvailabilityPage';
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
import { NotificationsPage } from './pages/NotificationsPage';
import { clearChannelWorkspaceCache, useChannelWorkspace } from './pages/channel/useChannelWorkspace';
import { WebhookSyncLogsPage } from './pages/WebhookSyncLogsPage';
import { readPreviewDataEnabled, writePreviewDataEnabled } from './pages/previewData';

type Page =
  | 'dashboard' | 'operations' | 'reports' | 'setup'
  | 'availability' | 'mapping' | 'rooms' | 'bookings'
  | 'guests' | 'housekeeping' | 'payments' | 'channels'
  | 'webhooks' | 'support' | 'audit' | 'notifications';

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
      { id: 'housekeeping' as Page, label: 'Housekeeping', icon: 'sparkles' },
    ],
  },
  {
    section: 'Commercial',
    pages: [
      { id: 'availability' as Page, label: 'Availability & Rates', icon: 'calendar' },
      { id: 'mapping' as Page, label: 'OTA Mapping', icon: 'puzzle' },
    ],
  },
  {
    section: 'Finance',
    pages: [
      { id: 'payments' as Page, label: 'Payments & Folios', icon: 'wallet' },
    ],
  },
  {
    section: 'Admin',
    pages: [
      { id: 'webhooks' as Page, label: 'Webhooks & Sync Logs', icon: 'activity' },
      { id: 'support' as Page, label: 'Support Console', icon: 'activity' },
      { id: 'audit' as Page, label: 'Audit Logs', icon: 'shield' },
    ],
  },
];

export function App() {
  const [activePage, setActivePage] = useState<Page>(() => {
    if (isReservationsFullRoute()) return 'bookings';
    const stored = getStoredActivePage();
    if (stored === 'channels') return 'mapping';
    return isPage(stored) ? stored : 'dashboard';
  });
  const [user, setUser] = useState<AuthUser | null>(() => getStoredAuthUser());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pageKey, setPageKey] = useState(0);
  const [, setOtaMappingFullWorkspace] = useState(false);
  const [previewDataEnabled, setPreviewDataEnabled] = useState(() => readPreviewDataEnabled());

  // Property selector state
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(
    () => localStorage.getItem('hms_active_property_id') ?? '',
  );
  const [propertyDropdownOpen, setPropertyDropdownOpen] = useState(false);
  const propertyDropdownRef = useRef<HTMLDivElement>(null);

  // User dropdown state
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchValue, setSearchValue] = useState('');
  const headerSearchRef = useRef<HTMLInputElement>(null);

  const sidebarNavRef = useRef<HTMLElement | null>(null);
  const activeGroup = navGroups.find((g) => g.pages.some((p) => p.id === activePage));
  const activePageMeta = activePage === 'notifications'
    ? { id: 'notifications' as Page, label: 'Notifications', icon: 'bell' }
    : navGroups.flatMap((g) => g.pages).find((p) => p.id === activePage) ?? navGroups[0].pages[0];
  const searchResults = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    const pages = navGroups.flatMap((group) => group.pages.map((page) => ({ ...page, section: group.section })));
    if (!query) return [];
    return pages.filter((page) => `${page.label} ${page.section}`.toLowerCase().includes(query)).slice(0, 6);
  }, [searchValue]);
  const channelWorkspaceActive = isChannelWorkspacePage(activePage);
  const channelWorkspace = useChannelWorkspace({
    enabled: Boolean(user) && channelWorkspaceActive,
    diagnosticsEnabled: activePage === 'webhooks',
    sessionKey: user?.id ?? 'anonymous',
  });

  useEffect(() => subscribeToSessionUpdates(setUser), []);

  // Fetch properties for property selector
  useEffect(() => {
    if (!user) return;
    fetchAllPages<Property>('/properties')
      .then((props) => {
        setProperties(props);
        const storedId = localStorage.getItem('hms_active_property_id');
        if (storedId && props.some((p) => p.id === storedId)) {
          setSelectedPropertyId(storedId);
        } else if (!storedId && props.length === 1) {
          setSelectedPropertyId(props[0].id);
          localStorage.setItem('hms_active_property_id', props[0].id);
        }
      })
      .catch(() => {});
  }, [user]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (propertyDropdownRef.current && !propertyDropdownRef.current.contains(e.target as Node)) {
        setPropertyDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Sidebar scroll boundary
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
    function handleWheel(e: WheelEvent) { if (shouldBlockBoundaryScroll(e.deltaY)) e.preventDefault(); }
    function handleTouchStart(e: TouchEvent) { touchStartY = e.touches[0]?.clientY ?? 0; }
    function handleTouchMove(e: TouchEvent) {
      const touchY = e.touches[0]?.clientY;
      if (touchY == null) return;
      if (shouldBlockBoundaryScroll(touchStartY - touchY)) e.preventDefault();
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        headerSearchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handlePageSelect(pageId: Page) {
    if (pageId === activePage) {
      setMobileNavOpen(false);
      return;
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('reservations');
    window.history.pushState({}, '', nextUrl);
    setActivePage(pageId);
    setStoredActivePage(pageId);
    setPageKey((k) => k + 1);
    setOtaMappingFullWorkspace(false);
    setMobileNavOpen(false);
  }

  function handleSearchSelect(pageId: Page) {
    handlePageSelect(pageId);
    setSearchValue('');
  }

  function handleSearchSubmit() {
    if (!searchValue.trim()) return;
    if (searchResults[0]) handleSearchSelect(searchResults[0].id);
  }

  function handlePropertySelect(id: string) {
    setSelectedPropertyId(id);
    if (id) localStorage.setItem('hms_active_property_id', id);
    else localStorage.removeItem('hms_active_property_id');
    setPropertyDropdownOpen(false);
  }

  function handleSignOut() {
    clearChannelWorkspaceCache(user!.id);
    void logoutSession();
    setMobileNavOpen(false);
    setUserDropdownOpen(false);
    setUser(null);
  }

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const collapseSidebar = activePage === 'setup';

  if (!user) return <LoginPage onLogin={setUser} />;

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden overscroll-none bg-[#f9f9f8]">

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside
        className={[
          'flex flex-col flex-shrink-0 w-[232px] bg-[#eeede9] border-r border-black/[0.06] h-dvh min-h-dvh overflow-hidden z-30 transition-[width] duration-200 ease-out will-change-[width] motion-reduce:transition-none',
          collapseSidebar ? 'lg:w-[64px]' : 'lg:w-[232px]',
          'fixed top-0 bottom-0 left-0 lg:sticky lg:top-0 lg:bottom-auto',
          mobileNavOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Brand */}
        <div className={`flex items-center gap-2.5 h-12 border-b border-black/[0.05] flex-shrink-0 ${collapseSidebar ? 'px-3.5 lg:justify-center lg:px-0' : 'px-3.5'}`}>
          <span className="w-6 h-6 rounded-md bg-slate-700 text-white flex items-center justify-center flex-shrink-0">
            <NavIcon name="brand" />
          </span>
          <div className={`min-w-0 flex-1 ${collapseSidebar ? 'lg:hidden' : ''}`}>
            <h1 className="text-[13px] font-bold text-slate-800 tracking-tight leading-none">HMS Admin</h1>
            <p className="text-[10px] text-slate-400 font-medium mt-[3px] leading-none">Hotel operations</p>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden w-6 h-6 rounded-md text-slate-500 hover:text-slate-800 hover:bg-black/[0.06] flex items-center justify-center flex-shrink-0"
          >
            <NavIcon name="close" />
          </button>
        </div>

        {/* Nav */}
        <nav
          ref={sidebarNavRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-none px-2 py-1 space-y-3"
          aria-label="Admin pages"
        >
          {navGroups.map((group) => (
            <div key={group.section}>
              <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 px-2.5 py-0.5 ${collapseSidebar ? 'lg:sr-only' : ''}`}>
                {group.section}
              </p>
              <div className="space-y-px">
                {group.pages.map((page) => {
                  const isActive = activePage === page.id;
                  return (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => handlePageSelect(page.id)}
                      title={collapseSidebar ? page.label : undefined}
                      aria-label={page.label}
                      className={[
                        'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12.5px] w-full text-left transition-colors duration-100',
                        collapseSidebar ? 'lg:justify-center lg:px-0' : '',
                        isActive
                          ? 'bg-[#dddbd5] text-slate-900 font-semibold'
                          : 'text-slate-600 hover:bg-[#e4e3de] hover:text-slate-900 font-medium',
                      ].join(' ')}
                    >
                      <span className="flex-shrink-0 text-slate-500">
                        <NavIcon name={page.icon} />
                      </span>
                      <span className={collapseSidebar ? 'lg:hidden' : ''}>{page.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar bottom — user mini */}
        <div className="border-t border-black/[0.05] p-2 flex-shrink-0">
          <div className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-[#e4e3de] transition-colors cursor-default ${collapseSidebar ? 'lg:justify-center' : ''}`}>
            <div className="w-6 h-6 rounded-full bg-slate-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 select-none">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className={`flex-1 min-w-0 ${collapseSidebar ? 'lg:hidden' : ''}`}>
              <p className="text-[11.5px] font-semibold text-slate-700 truncate leading-tight">{user.name}</p>
              <p className="text-[10px] text-slate-400 capitalize leading-tight mt-0.5">{user.role.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
          </div>
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

      {/* ── Main area ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col h-dvh min-h-dvh overflow-hidden">

        {/* Top header */}
        <header className="flex-shrink-0 flex items-center gap-2 px-4 lg:px-6 h-12 bg-white border-b border-black/[0.05] z-10">

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-expanded={mobileNavOpen}
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
            className="w-8 h-8 border border-slate-200 rounded-lg text-slate-600 flex items-center justify-center flex-shrink-0 hover:bg-slate-50 transition lg:hidden"
          >
            <NavIcon name="menu" />
          </button>

          {/* Breadcrumb — desktop */}
          <div className="hidden lg:flex items-center gap-1.5 min-w-0">
            {activeGroup && (
              <span className="text-[12px] text-slate-400 font-medium flex-shrink-0">{activeGroup.section}</span>
            )}
            {activeGroup && <span className="text-slate-300 text-[12px]">/</span>}
            <span className="text-[13px] font-semibold text-slate-800 truncate">{activePageMeta.label}</span>
          </div>

          {/* Mobile: page title */}
          <div className="lg:hidden flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-slate-800 truncate">{activePageMeta.label}</p>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search — desktop */}
          <GlobalSearch
            value={searchValue}
            onChange={setSearchValue}
            onSubmit={handleSearchSubmit}
            onSelect={handleSearchSelect}
            results={searchResults}
            inputRef={headerSearchRef}
          />

          <button
            type="button"
            aria-pressed={previewDataEnabled}
            onClick={() => {
              const next = !previewDataEnabled;
              setPreviewDataEnabled(next);
              writePreviewDataEnabled(next);
              setPageKey((key) => key + 1);
            }}
            className={`hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-bold transition ${
              previewDataEnabled
                ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
            title="Show frontend-only sample records on operational pages"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${previewDataEnabled ? 'bg-amber-500' : 'bg-slate-300'}`} />
            Sample data
          </button>

          {/* Property selector — desktop */}
          {properties.length > 0 && (
            <div className="relative hidden md:block" ref={propertyDropdownRef}>
              <button
                type="button"
                onClick={() => setPropertyDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition max-w-[180px]"
              >
                <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M3 9.5 12 4l9 5.5V21H3V9.5Z"/><path d="M9 21V12h6v9"/>
                </svg>
                <span className="truncate">
                  {selectedProperty ? selectedProperty.name : 'All Properties'}
                </span>
                <svg className={`w-3 h-3 text-slate-400 flex-shrink-0 transition-transform ${propertyDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>

              {propertyDropdownOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 min-w-[200px] max-h-64 overflow-y-auto z-50 animate-fade-in">
                  <button
                    type="button"
                    onClick={() => handlePropertySelect('')}
                    className={[
                      'w-full text-left px-3.5 py-2 text-[12.5px] transition flex items-center gap-2',
                      !selectedPropertyId ? 'text-indigo-700 bg-indigo-50 font-semibold' : 'text-slate-600 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${!selectedPropertyId ? 'bg-indigo-500' : 'bg-transparent'}`} />
                    All Properties
                  </button>
                  <div className="h-px bg-slate-100 mx-3 my-1" />
                  {properties.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePropertySelect(p.id)}
                      className={[
                        'w-full text-left px-3.5 py-2 text-[12.5px] transition flex items-center gap-2',
                        selectedPropertyId === p.id ? 'text-indigo-700 bg-indigo-50 font-semibold' : 'text-slate-600 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedPropertyId === p.id ? 'bg-indigo-500' : 'bg-transparent'}`} />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-slate-400 text-[10px] font-mono flex-shrink-0">{p.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notifications bell */}
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => handlePageSelect('notifications')}
            className="relative w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-slate-100 flex-shrink-0 hidden sm:block" />

          {/* User profile dropdown */}
          <div className="relative flex-shrink-0" ref={userDropdownRef}>
            <button
              type="button"
              onClick={() => setUserDropdownOpen((v) => !v)}
              className="flex items-center gap-2 hover:bg-slate-50 rounded-lg px-1.5 py-1 transition"
            >
              <div className="w-7 h-7 rounded-full bg-slate-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 select-none">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-[12px] font-semibold text-slate-800 leading-tight max-w-[120px] truncate">{user.name}</p>
                <p className="text-[10px] text-slate-400 leading-tight capitalize">{user.role.replace(/_/g, ' ').toLowerCase()}</p>
              </div>
              <svg className="hidden sm:block w-3 h-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 min-w-[200px] z-50 animate-fade-in">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-[13px] font-semibold text-slate-900 leading-tight">{user.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{user.email}</p>
                  <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold capitalize">
                    {user.role.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>

                {/* Property selector — mobile fallback inside user menu */}
                {properties.length > 0 && (
                  <div className="md:hidden border-b border-slate-100 py-1">
                    <p className="px-4 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Property</p>
                    <button
                      type="button"
                      onClick={() => { handlePropertySelect(''); setUserDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-1.5 text-[12.5px] transition ${!selectedPropertyId ? 'text-indigo-700 font-semibold bg-indigo-50' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      All Properties
                    </button>
                    {properties.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { handlePropertySelect(p.id); setUserDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-1.5 text-[12.5px] transition ${selectedPropertyId === p.id ? 'text-indigo-700 font-semibold bg-indigo-50' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-[13px] text-rose-600 hover:bg-rose-50 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M10 12h10M17 8l4 4-4 4"/>
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page scroll area */}
        <main className={`flex-1 min-h-0 overscroll-contain scrollbar-none ${activePage === 'setup' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div key={pageKey} className="px-5 lg:px-8 py-6 lg:py-8 animate-page-in">
            {activePage === 'dashboard'    && <DashboardPage />}
            {activePage === 'notifications' && <NotificationsPage />}
            {activePage === 'reports'      && <ReportsPage />}
            {activePage === 'operations'   && <OperationsBoardPage previewDataEnabled={previewDataEnabled} />}
            {activePage === 'setup'        && <PropertySetupPage onAddRooms={() => handlePageSelect('rooms')} onConfigureOta={() => handlePageSelect('mapping')} />}
            {activePage === 'availability' && <AvailabilityPage previewDataEnabled={previewDataEnabled} />}
            {activePage === 'mapping'      && <OtaMappingPage onFullWorkspaceChange={setOtaMappingFullWorkspace} workspace={channelWorkspace} />}
            {activePage === 'rooms'        && <RoomsPage />}
            {activePage === 'bookings'     && <BookingsPage previewDataEnabled={previewDataEnabled} />}
            {activePage === 'guests'       && <GuestsPage />}
            {activePage === 'housekeeping' && <HousekeepingPage previewDataEnabled={previewDataEnabled} />}
            {activePage === 'payments'     && <PaymentsPage previewDataEnabled={previewDataEnabled} />}
            {activePage === 'webhooks'     && <WebhookSyncLogsPage workspace={channelWorkspace} />}
            {activePage === 'support'      && <SupportConsolePage />}
            {activePage === 'audit'        && <AuditLogsPage />}
          </div>
        </main>
      </div>
    </div>
  );
}

function GlobalSearch({
  value,
  onChange,
  onSubmit,
  onSelect,
  results,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSelect: (pageId: Page) => void;
  results: Array<{ id: Page; label: string; icon: string; section: string }>;
  inputRef?: RefObject<HTMLInputElement>;
}) {
  const [focused, setFocused] = useState(false);
  const showResults = focused && value.trim().length > 0;

  return (
    <div className="relative hidden md:flex items-center">
      <svg
        aria-hidden="true"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none z-10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        aria-label="Search pages"
        placeholder="Search pages..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit();
          }
        }}
        className={[
          'h-8 text-[12.5px] rounded-lg border border-slate-200 bg-white pl-8 pr-3 outline-none transition placeholder:text-slate-400',
          focused ? 'border-indigo-300 ring-2 ring-indigo-500/15 text-slate-800' : 'text-slate-500 hover:border-slate-300',
          'w-44',
        ].join(' ')}
      />

      {showResults && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg animate-fade-in">
          {results.length > 0 ? (
            results.map((result) => (
              <button
                key={result.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(result.id)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              >
                <span className="flex-shrink-0 text-slate-400">
                  <NavIcon name={result.icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{result.label}</span>
                  <span className="block truncate text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">{result.section}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-[12px] text-slate-400">No matching pages</div>
          )}
        </div>
      )}
    </div>
  );
}

function isPage(value: string | null): value is Page {
  return value != null && navGroups.flatMap((g) => g.pages).some((p) => p.id === value);
}

function isChannelWorkspacePage(page: Page) {
  return page === 'mapping' || page === 'webhooks';
}

function isReservationsFullRoute() {
  return new URLSearchParams(window.location.search).get('reservations') === 'all';
}

function NavIcon({ name }: { name: string }) {
  const p = {
    fill: 'none', stroke: 'currentColor',
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    strokeWidth: 1.75, viewBox: '0 0 24 24', className: 'w-4 h-4',
  };
  switch (name) {
    case 'brand':     return <svg {...p} className="w-[17px] h-[17px]"><path d="M5 20h14"/><path d="M7 20V8.5L12 5l5 3.5V20"/><path d="M10 20v-5h4v5"/><path d="M9.5 11h.01M14.5 11h.01"/></svg>;
    case 'dashboard': return <svg {...p}><path d="M3 11.5 12 4l9 7.5"/><path d="M6 10.5V20h12v-9.5"/></svg>;
    case 'pulse':     return <svg {...p}><path d="M3 12h4l2.2-4 4.1 8 2.3-4H21"/><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>;
    case 'clipboard': return <svg {...p}><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4.5h6v3H9zM9 10h6M9 14h6"/></svg>;
    case 'calendar':  return <svg {...p}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></svg>;
    case 'guest':     return <svg {...p}><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>;
    case 'bed':       return <svg {...p}><path d="M3 18V8M3 14h18M7 11h4a2 2 0 0 1 2 2v1M13 10h5a3 3 0 0 1 3 3v5"/></svg>;
    case 'sparkles':  return <svg {...p}><path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3L7.5 7.5l3.3-1.2Z"/><path d="m5 14 .7 1.8L7.5 17l-1.8.7L5 19.5l-.7-1.8L2.5 17l1.8-.7ZM18.5 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/></svg>;
    case 'chart':     return <svg {...p}><path d="M5 19V9M12 19V5M19 19v-8"/></svg>;
    case 'settings':  return <svg {...p}><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1-6-2-.6-.8-1.8 1-1.9-4.3-2.5-1.5 1.4h-2l-1.5-1.4L4.1 4.7l1 1.9-.8 1.8-2 .6-.1 6 2 .6.8 1.8-1 1.9 4.3 2.5 1.5-1.4h2l1.5 1.4 4.3-2.5-1-1.9.8-1.8Z"/></svg>;
    case 'wallet':    return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M15 12h6M17 10v4"/></svg>;
    case 'puzzle':    return <svg {...p}><path d="M9 4h4a2 2 0 0 1 4 0h3v5a2 2 0 0 0 0 4v5h-5a2 2 0 0 1-4 0H6v-5a2 2 0 0 0 0-4V4Z"/></svg>;
    case 'activity':  return <svg {...p}><path d="M3 12h4l2.2-4 3.6 8 2.2-4H21"/><path d="M4 5h16"/><path d="M4 19h16"/></svg>;
    case 'bell':      return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
    case 'shield':    return <svg {...p}><path d="m12 3 7 3v5c0 4.3-2.7 8.2-7 10-4.3-1.8-7-5.7-7-10V6Z"/></svg>;
    case 'menu':      return <svg {...p}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'close':     return <svg {...p}><path d="M6 6 18 18M18 6 6 18"/></svg>;
    case 'logout':    return <svg {...p}><path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M10 12h10M17 8l4 4-4 4"/></svg>;
    default: return null;
  }
}

function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [email, setEmail] = useState('admin@hms.local');
  const [password, setPassword] = useState('Admin@12345');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

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
    <main className="min-h-screen overflow-y-auto bg-[#f6f4ef] px-4 py-6 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[25rem] items-center justify-center">
        <section className="w-full animate-page-in">
          <div className="mb-8 flex items-center justify-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <NavIcon name="brand" />
            </span>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-none tracking-tight text-slate-900">HMS Admin</h1>
              <p className="mt-1 text-xs leading-none text-slate-500">Hotel operations</p>
            </div>
          </div>

          <form onSubmit={submitLogin} className="rounded-xl border border-black/[0.08] bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.10)] sm:p-8">
            <div className="mb-7">
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Secure access</p>
              <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-slate-950">Sign in</h2>
              <p className="mt-2 text-center text-sm leading-6 text-slate-500">Continue to your hotel workspace.</p>
            </div>

            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-600">Email</span>
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@hms.local"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-600">Password</span>
                <span className="relative block">
                  <input
                    type={passwordVisible ? 'text' : 'password'} required autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 pr-16 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordVisible((visible) => !visible)}
                    className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {passwordVisible ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
            </div>

            {error && (
              <p className="mt-5 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[13px] leading-5 text-rose-700">
                {error}
              </p>
            )}

            <button
              type="submit" disabled={submitting}
              className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 active:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {submitting ? 'Signing in...' : 'Continue'}
            </button>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Demo credentials</p>
              <p className="mt-2 break-all font-mono text-[12px] leading-5 text-slate-700">
                admin@hms.local / Admin@12345
              </p>
            </div>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">Protected workspace for authorized staff.</p>
        </section>
      </div>
    </main>
  );
}
