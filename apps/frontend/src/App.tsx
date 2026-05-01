import { useState } from 'react';
import { api, getApiErrorMessage } from './api/client';
import { AuthResponse, AuthUser } from './api/types';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { BookingsPage } from './pages/BookingsPage';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { ChannelsPage } from './pages/ChannelsPage';
import { DashboardPage } from './pages/DashboardPage';
import { GuestsPage } from './pages/GuestsPage';
import { HousekeepingPage } from './pages/HousekeepingPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { PropertySetupPage } from './pages/PropertySetupPage';
import { RoomsPage } from './pages/RoomsPage';

type Page =
  | 'dashboard'
  | 'setup'
  | 'availability'
  | 'rooms'
  | 'bookings'
  | 'guests'
  | 'housekeeping'
  | 'payments'
  | 'channels'
  | 'audit';

const pages: Array<{ id: Page; label: string; section: string }> = [
  { id: 'dashboard', label: 'Dashboard', section: 'Overview' },
  { id: 'bookings', label: 'Bookings', section: 'Operations' },
  { id: 'guests', label: 'Guests', section: 'Operations' },
  { id: 'rooms', label: 'Rooms', section: 'Operations' },
  { id: 'housekeeping', label: 'Housekeeping', section: 'Operations' },
  { id: 'availability', label: 'Availability', section: 'Commercial' },
  { id: 'setup', label: 'Property Setup', section: 'Commercial' },
  { id: 'payments', label: 'Payments', section: 'Finance' },
  { id: 'channels', label: 'Channels', section: 'Integrations' },
  { id: 'audit', label: 'Audit Logs', section: 'Admin' },
];

export function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [user, setUser] = useState<AuthUser | null>(() => {
    const rawUser = localStorage.getItem('hms_user');
    return rawUser ? (JSON.parse(rawUser) as AuthUser) : null;
  });

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">Hotel operations</p>
          <h1>HMS Admin</h1>
          <p className="sidebar-copy">Inventory, reservations, commercial setup, and daily control in one workspace.</p>
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
                      onClick={() => setActivePage(page.id)}
                      type="button"
                    >
                      {page.label}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-panel">
          <span className="sidebar-panel-label">Signed in</span>
          <strong>{user.name}</strong>
          <p>{user.email}</p>
          <p className="user-chip">{user.role}</p>
        </div>

        <button
          className="nav-item nav-item-signout"
          onClick={() => {
            localStorage.removeItem('hms_access_token');
            localStorage.removeItem('hms_refresh_token');
            localStorage.removeItem('hms_user');
            setUser(null);
          }}
          type="button"
        >
          Sign out
        </button>
      </aside>

      <main className="main-panel">
        {activePage === 'dashboard' && <DashboardPage />}
        {activePage === 'setup' && <PropertySetupPage />}
        {activePage === 'availability' && <AvailabilityPage />}
        {activePage === 'rooms' && <RoomsPage />}
        {activePage === 'bookings' && <BookingsPage />}
        {activePage === 'guests' && <GuestsPage />}
        {activePage === 'housekeeping' && <HousekeepingPage />}
        {activePage === 'payments' && <PaymentsPage />}
        {activePage === 'channels' && <ChannelsPage />}
        {activePage === 'audit' && <AuditLogsPage />}
      </main>
    </div>
  );
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
      localStorage.setItem('hms_access_token', response.data.access_token);
      localStorage.setItem('hms_refresh_token', response.data.refresh_token);
      localStorage.setItem('hms_user', JSON.stringify(response.data.user));
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
