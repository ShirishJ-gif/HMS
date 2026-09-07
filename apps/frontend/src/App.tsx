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
import { ApiTestingPage } from './pages/ApiTestingPage';
import { BookingsPage } from './pages/BookingsPage';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { DashboardPage } from './pages/DashboardPage';
// import { GraphInsightsPage } from './pages/GraphInsightsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { GuestsPage } from './pages/GuestsPage';
import { HousekeepingPage } from './pages/HousekeepingPage';
import { ICalCalendarPage } from './pages/ICalCalendarPage';
import { OtaEmailIngestionPage } from './pages/OtaEmailIngestionPage';
import { OtaMappingPage } from './pages/OtaMappingPage';
import { OperationsBoardPage } from './pages/OperationsBoardPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { PlatformOwnerPage } from './pages/PlatformOwnerPage';
import { PropertySetupPage } from './pages/PropertySetupPage';
import { OrganizationUsersPage } from './pages/OrganizationUsersPage';
import { ReportsPage } from './pages/ReportsPage';
import { RoomsPage } from './pages/RoomsPage';
import { SupportConsolePage } from './pages/SupportConsolePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { WhatsAppPage } from './features/whatsapp/components/WhatsAppPage';
import { clearChannelWorkspaceCache, useChannelWorkspace } from './pages/channel/useChannelWorkspace';
import { WebhookSyncLogsPage } from './pages/WebhookSyncLogsPage';
import { readPreviewDataEnabled, writePreviewDataEnabled } from './pages/previewData';

type Page =
  | 'dashboard' | 'operations' | 'reports' | 'graphs' | 'setup'
  | 'availability' | 'ical-calendar' | 'ota-email-ingestion' | 'mapping' | 'rooms' | 'bookings'
  | 'guests' | 'housekeeping' | 'payments' | 'expenses' | 'channels'
  | 'webhooks' | 'api-testing' | 'support' | 'audit' | 'notifications' | 'whatsapp'
  | 'org-users'
  | 'platform-overview' | 'platform-api-sample' | 'platform-api-monitor' | 'platform-properties' | 'platform-integrations' | 'platform-integration-sample' | 'platform-logs';

const navGroups = [
  {
    section: 'Platform',
    ownerOnly: true,
    pages: [
      { id: 'platform-overview' as Page, label: 'API Health', icon: 'pulse' },
      { id: 'platform-api-sample' as Page, label: 'API Sample', icon: 'activity' },
      { id: 'platform-api-monitor' as Page, label: 'API Monitor', icon: 'pulse' },
      { id: 'platform-properties' as Page, label: 'Properties', icon: 'bed' },
      { id: 'platform-integrations' as Page, label: 'Integrations', icon: 'puzzle' },
      { id: 'platform-integration-sample' as Page, label: 'Sample Map', icon: 'activity' },
      { id: 'platform-logs' as Page, label: 'System Logs', icon: 'activity' },
    ],
  },
  {
    section: 'Organization',
    orgOwnerOnly: true,
    pages: [
      { id: 'org-users' as Page, label: 'Users', icon: 'guest' },
    ],
  },
  {
    section: 'Overview',
    pages: [
      { id: 'dashboard' as Page, label: 'Dashboard', icon: 'dashboard' },
      { id: 'reports' as Page, label: 'Reports & Analytics', icon: 'clipboard' },
      // { id: 'graphs' as Page, label: 'Graph Insights', icon: 'chart' },
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
      { id: 'ical-calendar' as Page, label: 'iCal Calendar', icon: 'calendar' },
      { id: 'ota-email-ingestion' as Page, label: 'OTA Email Ingestion', icon: 'activity' },
      { id: 'mapping' as Page, label: 'OTA Mapping', icon: 'puzzle' },
    ],
  },
  {
    section: 'Finance',
    pages: [
      { id: 'payments' as Page, label: 'Payments & Folios', icon: 'wallet' },
      { id: 'expenses' as Page, label: 'Expenses', icon: 'clipboard' },
    ],
  },
  {
    section: 'Admin',
    pages: [
      { id: 'webhooks' as Page, label: 'Webhooks & Sync Logs', icon: 'activity' },
      { id: 'api-testing' as Page, label: 'API Testing Trace', icon: 'activity' },
      { id: 'support' as Page, label: 'Support Console', icon: 'activity' },
      { id: 'audit' as Page, label: 'Audit Logs', icon: 'shield' },
      { id: 'whatsapp' as Page, label: 'WhatsApp', icon: 'whatsapp' },
    ],
  },
];

function visibleNavGroups(user: AuthUser | null) {
  if (user?.role === 'PLATFORM_OWNER') {
    return navGroups.filter((group) => 'ownerOnly' in group && group.ownerOnly);
  }

  return navGroups.filter((group) => {
    if ('ownerOnly' in group && group.ownerOnly) return false;
    if ('orgOwnerOnly' in group && group.orgOwnerOnly) return user?.role === 'ORG_OWNER';
    return true;
  });
}

function isPlatformPage(page: Page): page is Extract<Page, `platform-${string}`> {
  return page.startsWith('platform-');
}

function requiresSelectedProperty(page: Page) {
  return [
    'availability',
    'ical-calendar',
    'ota-email-ingestion',
    'mapping',
    'guests',
    'webhooks',
    'whatsapp',
  ].includes(page);
}

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
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);
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
  const pageScrollRef = useRef<HTMLElement | null>(null);
  const activeGroup = navGroups.find((g) => g.pages.some((p) => p.id === activePage));
  const activePageMeta = activePage === 'notifications'
    ? { id: 'notifications' as Page, label: 'Notifications', icon: 'bell' }
    : navGroups.flatMap((g) => g.pages).find((p) => p.id === activePage) ?? navGroups[0].pages[0];
  const searchResults = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    const pages = visibleNavGroups(user).flatMap((group) => group.pages.map((page) => ({ ...page, section: group.section })));
    if (!query) return [];
    return pages.filter((page) => `${page.label} ${page.section}`.toLowerCase().includes(query)).slice(0, 6);
  }, [searchValue, user]);
  const channelWorkspaceActive = isChannelWorkspacePage(activePage);
  const channelWorkspace = useChannelWorkspace({
    activePropertyId: selectedPropertyId,
    enabled: Boolean(user) && channelWorkspaceActive,
    diagnosticsEnabled: activePage === 'webhooks',
    onPropertyChange: handlePropertySelect,
    sessionKey: user?.id ?? 'anonymous',
  });

  useEffect(() => subscribeToSessionUpdates(setUser), []);

  useEffect(() => {
    if (user?.role === 'PLATFORM_OWNER' && !isPlatformPage(activePage)) {
      setActivePage('platform-overview');
      setStoredActivePage('platform-overview');
      setPageKey((key) => key + 1);
    }

    if (user && user.role !== 'PLATFORM_OWNER' && isPlatformPage(activePage)) {
      setActivePage('dashboard');
      setStoredActivePage('dashboard');
      setPageKey((key) => key + 1);
    }

    if (user && user.role !== 'ORG_OWNER' && activePage === 'org-users') {
      setActivePage('dashboard');
      setStoredActivePage('dashboard');
      setPageKey((key) => key + 1);
    }
  }, [activePage, user]);

  useEffect(() => {
    if (!user || user.role === 'PLATFORM_OWNER' || !propertiesLoaded || properties.length === 0) {
      return;
    }

    const storedId = localStorage.getItem('hms_active_property_id');
    const storedProperty = storedId && properties.some((property) => property.id === storedId) ? storedId : null;
    const currentPropertyIsValid = selectedPropertyId && properties.some((property) => property.id === selectedPropertyId);

    if (requiresSelectedProperty(activePage) && !currentPropertyIsValid) {
      const nextPropertyId = storedProperty ?? properties[0].id;
      setSelectedPropertyId(nextPropertyId);
      localStorage.setItem('hms_active_property_id', nextPropertyId);
    }
  }, [activePage, properties, propertiesLoaded, selectedPropertyId, user]);

  // Fetch properties for property selector
  useEffect(() => {
    if (!user) {
      setProperties([]);
      setPropertiesLoaded(false);
      return;
    }
    setPropertiesLoaded(false);
    fetchAllPages<Property>('/properties')
      .then((props) => {
        setProperties(props);
        const storedId = localStorage.getItem('hms_active_property_id');
        if (storedId && props.some((p) => p.id === storedId)) {
          setSelectedPropertyId(storedId);
        } else if (storedId) {
          localStorage.removeItem('hms_active_property_id');
          if (requiresSelectedProperty(activePage) && props.length > 0) {
            setSelectedPropertyId(props[0].id);
            localStorage.setItem('hms_active_property_id', props[0].id);
          } else {
            setSelectedPropertyId('');
          }
        } else if (requiresSelectedProperty(activePage) && props.length > 0) {
          setSelectedPropertyId(props[0].id);
          localStorage.setItem('hms_active_property_id', props[0].id);
        } else if (props.length === 1) {
          setSelectedPropertyId(props[0].id);
          localStorage.setItem('hms_active_property_id', props[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setPropertiesLoaded(true));
  }, [activePage, user]);

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

  useEffect(() => {
    const scroller = pageScrollRef.current;
    setStoredActivePage(activePage);
    if (scroller) scroller.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activePage]);

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
    let nextPropertyId = id;

    if (!nextPropertyId && requiresSelectedProperty(activePage)) {
      const storedId = localStorage.getItem('hms_active_property_id');
      const storedPropertyIsValid = storedId && properties.some((property) => property.id === storedId);
      nextPropertyId = storedPropertyIsValid ? storedId : (selectedPropertyId || properties[0]?.id || '');
    }

    setSelectedPropertyId(nextPropertyId);
    if (nextPropertyId) localStorage.setItem('hms_active_property_id', nextPropertyId);
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

  const isPlatformOwner = user.role === 'PLATFORM_OWNER';
  const propertyRequired = requiresSelectedProperty(activePage);

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
            <p className="text-[10px] text-slate-400 font-medium mt-[3px] leading-none">
              {isPlatformOwner ? 'Platform console' : 'Hotel operations'}
            </p>
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
          {visibleNavGroups(user).map((group) => (
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

          {!isPlatformOwner && (
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
          )}

          {/* Property selector — desktop */}
          {!isPlatformOwner && properties.length > 0 && (
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
                  {selectedProperty ? selectedProperty.name : (propertyRequired ? 'Select Property' : 'All Properties')}
                </span>
                <svg className={`w-3 h-3 text-slate-400 flex-shrink-0 transition-transform ${propertyDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>

              {propertyDropdownOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 min-w-[200px] max-h-64 overflow-y-auto z-50 animate-fade-in">
                  {!propertyRequired && (
                    <>
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
                    </>
                  )}
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
          {!isPlatformOwner && (
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
          )}

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
                {!isPlatformOwner && properties.length > 0 && (
                  <div className="md:hidden border-b border-slate-100 py-1">
                    <p className="px-4 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Property</p>
                    {!propertyRequired && (
                      <button
                        type="button"
                        onClick={() => { handlePropertySelect(''); setUserDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-1.5 text-[12.5px] transition ${!selectedPropertyId ? 'text-indigo-700 font-semibold bg-indigo-50' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        All Properties
                      </button>
                    )}
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
        <main
          ref={pageScrollRef}
          data-scroll-lock-root="true"
          className={`flex-1 min-h-0 overscroll-contain scrollbar-none ${activePage === 'setup' ? 'overflow-hidden' : 'overflow-y-auto'}`}
        >
          <div key={pageKey} className="px-5 lg:px-8 py-6 lg:py-8 animate-page-in">
            {activePage === 'dashboard'    && <DashboardPage previewDataEnabled={previewDataEnabled} />}
            {isPlatformPage(activePage)     && <PlatformOwnerPage section={activePage} />}
            {activePage === 'org-users'    && <OrganizationUsersPage />}
            {activePage === 'notifications' && <NotificationsPage />}
            {activePage === 'reports'      && <ReportsPage />}
            {/* {activePage === 'graphs'       && <GraphInsightsPage />} */}
            {activePage === 'operations'   && <OperationsBoardPage previewDataEnabled={previewDataEnabled} />}
            {activePage === 'setup'        && <PropertySetupPage onAddRooms={() => handlePageSelect('rooms')} onConfigureOta={() => handlePageSelect('mapping')} />}
            {activePage === 'availability' && (
              <AvailabilityPage
                activePropertyId={selectedPropertyId}
                onPropertyChange={handlePropertySelect}
                previewDataEnabled={previewDataEnabled}
                properties={properties}
                propertiesLoaded={propertiesLoaded}
              />
            )}
            {activePage === 'ical-calendar' && (
              <ICalCalendarPage
                activePropertyId={selectedPropertyId}
                onPropertyChange={handlePropertySelect}
                properties={properties}
                propertiesLoaded={propertiesLoaded}
              />
            )}
            {activePage === 'ota-email-ingestion' && <OtaEmailIngestionPage activePropertyId={selectedPropertyId} />}
            {activePage === 'mapping'      && <OtaMappingPage onFullWorkspaceChange={setOtaMappingFullWorkspace} workspace={channelWorkspace} />}
            {activePage === 'rooms'        && <RoomsPage />}
            {activePage === 'bookings'     && <BookingsPage previewDataEnabled={previewDataEnabled} />}
            {activePage === 'guests'       && <GuestsPage activePropertyId={selectedPropertyId} />}
            {activePage === 'housekeeping' && <HousekeepingPage previewDataEnabled={previewDataEnabled} />}
            {activePage === 'payments'     && <PaymentsPage previewDataEnabled={previewDataEnabled} />}
            {activePage === 'expenses'     && <ExpensesPage activePropertyId={selectedPropertyId} />}
            {activePage === 'webhooks'     && <WebhookSyncLogsPage workspace={channelWorkspace} />}
            {activePage === 'api-testing'  && <ApiTestingPage />}
            {activePage === 'support'      && <SupportConsolePage />}
            {activePage === 'audit'        && <AuditLogsPage />}
            {activePage === 'whatsapp'     && <WhatsAppPage activePropertyId={selectedPropertyId} />}
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
    case 'whatsapp':  return <svg {...p}><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.5Z"/><path d="M9.5 8.8c.2-.4.3-.5.6-.5h.5c.2 0 .4.1.5.4l.5 1.2c.1.3.1.5-.1.7l-.3.4c.5.9 1.2 1.6 2.2 2.1l.5-.4c.2-.2.4-.2.7-.1l1.1.5c.3.1.4.3.4.6v.4c0 .3-.1.5-.4.7-.5.3-1.2.4-2 .2-1.8-.5-4.1-2.5-4.8-4.4-.3-.8-.2-1.4.1-1.8Z"/></svg>;
    case 'menu':      return <svg {...p}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'close':     return <svg {...p}><path d="M6 6 18 18M18 6 6 18"/></svg>;
    case 'logout':    return <svg {...p}><path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M10 12h10M17 8l4 4-4 4"/></svg>;
    default: return null;
  }
}

function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('admin@hms.local');
  const [password, setPassword] = useState('Admin@12345');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [propertyCode, setPropertyCode] = useState('');
  const [propertyPhone, setPropertyPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [adminName, setAdminName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordsMismatch = mode === 'signup' && signupStep === 2 && password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword;

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (mode === 'signup' && signupStep === 1) {
      setSignupStep(2);
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const response = mode === 'signin'
        ? await api.post<AuthResponse>('/auth/login', { email, password })
        : await api.post<AuthResponse>('/auth/signup-property', {
            property_name: propertyName,
            property_code: propertyCode || undefined,
            phone: propertyPhone || undefined,
            address: propertyAddress,
            admin_name: adminName,
            admin_email: email,
            password,
          });
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
              <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-slate-950">
                {mode === 'signin' ? 'Sign in' : 'Create property'}
              </h2>
              <p className="mt-2 text-center text-sm leading-6 text-slate-500">
                {mode === 'signin' ? 'Continue to your hotel workspace.' : 'Create a hotel workspace and first admin account.'}
              </p>
              <div className="mt-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setSignupStep(1);
                    setEmail('admin@hms.local');
                    setPassword('Admin@12345');
                    setConfirmPassword('');
                    setError(null);
                  }}
                  className={`h-8 rounded-md text-xs font-bold transition ${mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setSignupStep(1);
                    setEmail('');
                    setPassword('');
                    setConfirmPassword('');
                    setError(null);
                  }}
                  className={`h-8 rounded-md text-xs font-bold transition ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Sign up
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {mode === 'signup' && (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${signupStep === 1 ? 'bg-slate-900 text-white' : 'bg-emerald-600 text-white'}`}>1</span>
                  <span className={`text-xs font-bold ${signupStep === 1 ? 'text-slate-900' : 'text-slate-500'}`}>Property</span>
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${signupStep === 2 ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
                  <span className={`text-xs font-bold ${signupStep === 2 ? 'text-slate-900' : 'text-slate-500'}`}>Account</span>
                </div>
              )}

              {mode === 'signup' && signupStep === 1 && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">Hotel/property name</span>
                    <input
                      type="text" required
                      value={propertyName} onChange={(e) => setPropertyName(e.target.value)}
                      placeholder="Harbour Grand"
                      className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600">Property code</span>
                      <input
                        type="text"
                        value={propertyCode} onChange={(e) => setPropertyCode(e.target.value.toUpperCase())}
                        placeholder="HARBOUR"
                        className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600">Phone</span>
                      <input
                        type="tel"
                        value={propertyPhone} onChange={(e) => setPropertyPhone(e.target.value)}
                        placeholder="+91..."
                        className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">Address</span>
                    <textarea
                      required
                      value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)}
                      placeholder="Street, city, state"
                      rows={3}
                      className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">Admin name</span>
                    <input
                      type="text" required
                      value={adminName} onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Hotel owner name"
                      className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                    />
                  </label>
                </>
              )}

              {(mode === 'signin' || signupStep === 2) && <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-600">{mode === 'signin' ? 'Email' : 'Admin email'}</span>
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder={mode === 'signin' ? 'admin@hms.local' : 'owner@hotel.com'}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                />
              </label>}

              {(mode === 'signin' || signupStep === 2) && <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-600">Password</span>
                <span className="relative block">
                  <input
                    type={passwordVisible ? 'text' : 'password'} required minLength={mode === 'signup' ? 10 : undefined} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
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
              </label>}

              {mode === 'signup' && signupStep === 2 && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-600">Confirm password</span>
                  <input
                    type={passwordVisible ? 'text' : 'password'} required minLength={10} autoComplete="new-password"
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Enter password again"
                    className={`h-11 w-full rounded-lg border bg-slate-50/70 px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:bg-white ${
                      passwordsMismatch
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10'
                        : 'border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                    }`}
                  />
                  {passwordsMismatch && (
                    <span className="text-[12px] font-semibold text-rose-600">Passwords do not match.</span>
                  )}
                </label>
              )}
            </div>

            {error && (
              <p className="mt-5 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[13px] leading-5 text-rose-700">
                {error}
              </p>
            )}

            <div className={`mt-6 grid gap-3 ${mode === 'signup' && signupStep === 2 ? 'grid-cols-[0.8fr_1.2fr]' : ''}`}>
              {mode === 'signup' && signupStep === 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setSignupStep(1);
                    setError(null);
                  }}
                  className="flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Back
                </button>
              )}
              <button
                type="submit" disabled={submitting}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 active:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {submitting
                  ? (mode === 'signin' ? 'Signing in...' : 'Creating workspace...')
                  : (mode === 'signin' ? 'Continue' : signupStep === 1 ? 'Next' : 'Create workspace')}
              </button>
            </div>

            {mode === 'signin' && <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Demo credentials</p>
              <p className="mt-2 break-all font-mono text-[12px] leading-5 text-slate-700">
                admin@hms.local / Admin@12345
              </p>
            </div>}
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">Protected workspace for authorized staff.</p>
        </section>
      </div>
    </main>
  );
}
