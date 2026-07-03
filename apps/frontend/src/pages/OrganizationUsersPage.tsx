import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { Property, UserRole } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { ErrorMsg, FloatingSuccessToast, LoadingMsg, inputCls, labelCls, primaryBtn, secondaryBtn } from './ui';

type OrganizationUser = {
  id: string;
  organization_id: string | null;
  property_id: string | null;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const defaultUserForm = {
  property_id: '',
  name: '',
  email: '',
  password: '',
  confirm_password: '',
  role: 'STAFF' as Extract<UserRole, 'SUPER_ADMIN' | 'ADMIN' | 'STAFF'>,
};

const roleOptions: Array<Extract<UserRole, 'SUPER_ADMIN' | 'ADMIN' | 'STAFF'>> = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];

const roleDescriptions: Record<Extract<UserRole, 'SUPER_ADMIN' | 'ADMIN' | 'STAFF'>, string> = {
  SUPER_ADMIN: 'Property lead access',
  ADMIN: 'Operations and setup access',
  STAFF: 'Daily operations access',
};

export function OrganizationUsersPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [addingUser, setAddingUser] = useState(false);
  const [form, setForm] = useState(defaultUserForm);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const usersState = useAsync(async () => fetchAllPages<OrganizationUser>('/auth/users'), [reloadKey]);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), [reloadKey]);
  const users = usersState.data ?? [];
  const properties = propertiesState.data ?? [];
  const propertyOptions = useMemo(() => properties.map((property) => ({
    description: [property.code, property.address].filter(Boolean).join(' - '),
    eyebrow: 'Property',
    indentLevel: 1,
    label: property.name,
    value: property.id,
  })), [properties]);
  const propertyById = useMemo(() => new Map(properties.map((property) => [property.id, property])), [properties]);
  const roleSelectOptions = useMemo(() => roleOptions.map((role, index) => ({
    description: roleDescriptions[role],
    eyebrow: index === 0 ? 'Highest' : index === 1 ? 'Manager' : 'Team',
    indentLevel: index,
    label: formatRole(role),
    value: role,
  })), []);
  const passwordsMismatch = form.password.length > 0 && form.confirm_password.length > 0 && form.password !== form.confirm_password;
  const loadError = usersState.error ?? propertiesState.error;
  const selectedUser = useMemo(() => users.find((user) => user.id === selectedUserId) ?? null, [users, selectedUserId]);

  useEffect(() => {
    if (!actionStatus) return;
    const timeoutId = window.setTimeout(() => setActionStatus(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [actionStatus]);

  function reload() {
    setReloadKey((key) => key + 1);
  }

  async function submitUser(event: FormEvent) {
    event.preventDefault();
    setActionError(null);
    setActionStatus(null);

    if (form.password !== form.confirm_password) {
      setActionError('Passwords do not match');
      return;
    }

    if (!form.property_id) {
      setActionError('Select a property for this user');
      return;
    }

    setPending(true);
    try {
      await api.post('/auth/users', {
        property_id: form.property_id,
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
      });
      setForm(defaultUserForm);
      setAddingUser(false);
      setActionStatus('User created.');
      reload();
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <FloatingSuccessToast message={actionStatus} onClose={() => setActionStatus(null)} />

      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Organization</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Users</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Create property-scoped super admins, admins, and staff for properties inside your organization.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddingUser((value) => !value)}
          className={addingUser ? secondaryBtn : primaryBtn}
        >
          {addingUser ? 'Cancel' : 'Add user'}
        </button>
      </div>

      {loadError && <ErrorMsg>{loadError}</ErrorMsg>}
      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}

      {addingUser && (
        <form onSubmit={submitUser} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02]">
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">New user</p>
            <p className="mt-1 text-[12px] text-slate-500">Each user must be assigned to one property.</p>
          </div>
          <div className="space-y-4">
            <FormStep number="01" title="Assignment">
              <div className="grid gap-4 md:grid-cols-2">
                <label className={labelCls}>
                  <span>Property</span>
                  <CustomSelect
                    options={propertyOptions}
                    placeholder="Select property"
                    value={form.property_id}
                    onChange={(property_id) => setForm({ ...form, property_id })}
                  />
                </label>
                <label className={labelCls}>
                  <span>Role</span>
                  <CustomSelect
                    options={roleSelectOptions}
                    value={form.role}
                    onChange={(role) => setForm({ ...form, role: role as typeof form.role })}
                  />
                </label>
              </div>
            </FormStep>

            <FormStep number="02" title="Account">
              <div className="grid gap-4 md:grid-cols-2">
                <label className={labelCls}>
                  <span>Name</span>
                  <input
                    className={inputCls}
                    required
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="User name"
                  />
                </label>
                <label className={labelCls}>
                  <span>Email</span>
                  <input
                    className={inputCls}
                    required
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="user@hotel.com"
                  />
                </label>
              </div>
            </FormStep>

            <FormStep number="03" title="Security">
              <div className="grid gap-4 md:grid-cols-2">
                <label className={labelCls}>
                  <span>Password</span>
                  <input
                    className={inputCls}
                    required
                    minLength={10}
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder="Minimum 10 characters"
                  />
                </label>
                <label className={labelCls}>
                  <span>Confirm password</span>
                  <input
                    className={`${inputCls} ${passwordsMismatch ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10' : ''}`}
                    required
                    minLength={10}
                    type="password"
                    value={form.confirm_password}
                    onChange={(event) => setForm({ ...form, confirm_password: event.target.value })}
                    placeholder="Enter password again"
                  />
                  {passwordsMismatch && <span className="text-[12px] font-semibold text-rose-600">Passwords do not match.</span>}
                </label>
              </div>
            </FormStep>
          </div>
          <div className="mt-5 flex items-center justify-end">
            <button type="submit" disabled={pending || passwordsMismatch} className={primaryBtn}>
              {pending ? 'Creating...' : 'Create user'}
            </button>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-[14px] font-bold text-slate-900">Organization users</h3>
          {users.length > 0 && <p className="text-[11px] font-medium text-slate-400">Select an entry to view details</p>}
        </div>
        {usersState.loading && users.length === 0 ? (
          <LoadingMsg>Loading users...</LoadingMsg>
        ) : users.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-slate-500">No users found.</div>
        ) : (
          <OrganizationDirectory
            users={users}
            selectedUserId={selectedUserId}
            propertyById={propertyById}
            onSelectUser={(user) => setSelectedUserId((current) => current === user.id ? null : user.id)}
            onCloseDetails={() => setSelectedUserId(null)}
          />
        )}
      </section>
    </div>
  );
}

const roleLevel: Record<Extract<UserRole, 'ORG_OWNER' | 'SUPER_ADMIN' | 'ADMIN' | 'STAFF'>, { numeral: string; title: string }> = {
  ORG_OWNER: { numeral: 'I', title: 'Ownership' },
  SUPER_ADMIN: { numeral: 'II', title: 'Super Admin' },
  ADMIN: { numeral: 'III', title: 'Admin' },
  STAFF: { numeral: 'IV', title: 'Staff' },
};

function OrganizationDirectory({
  onCloseDetails,
  onSelectUser,
  propertyById,
  selectedUserId,
  users,
}: {
  onCloseDetails: () => void;
  onSelectUser: (user: OrganizationUser) => void;
  propertyById: Map<string, Property>;
  selectedUserId: string | null;
  users: OrganizationUser[];
}) {
  const orderedUsers = [...users].sort((a, b) => roleSort(a.role) - roleSort(b.role) || a.name.localeCompare(b.name));
  const superAdmins = orderedUsers.filter((user) => user.role === 'SUPER_ADMIN');
  const admins = orderedUsers.filter((user) => user.role === 'ADMIN');
  const staff = orderedUsers.filter((user) => user.role === 'STAFF');
  const renderUser = (user: OrganizationUser) => (
    <div key={user.id}>
      <DirectoryRow
        name={user.name}
        roleLabel={user.email}
        role={user.role}
        isActive={user.is_active}
        selected={selectedUserId === user.id}
        onClick={() => onSelectUser(user)}
      />
      {selectedUserId === user.id && (
        <InlineUserDetails
          user={user}
          property={user.property_id ? propertyById.get(user.property_id) ?? null : null}
          onClose={onCloseDetails}
        />
      )}
    </div>
  );

  return (
    <div className="divide-y divide-slate-100 bg-gradient-to-b from-[#FBFAF8] to-white">
      <DirectoryLevel level="ORG_OWNER" count={1}>
        <DirectoryRow
          name="Shirish"
          roleLabel="Organization Owner"
          role="ORG_OWNER"
        />
      </DirectoryLevel>

      <DirectoryLevel level="SUPER_ADMIN" count={superAdmins.length}>
        {superAdmins.length ? (
          superAdmins.map(renderUser)
        ) : (
          <EmptyRow label="super admins" />
        )}
      </DirectoryLevel>

      <DirectoryLevel level="ADMIN" count={admins.length}>
        {admins.length ? (
          admins.map(renderUser)
        ) : (
          <EmptyRow label="admins" />
        )}
      </DirectoryLevel>

      <DirectoryLevel level="STAFF" count={staff.length}>
        {staff.length ? (
          staff.map(renderUser)
        ) : (
          <EmptyRow label="staff" />
        )}
      </DirectoryLevel>
    </div>
  );
}

function DirectoryLevel({
  children,
  count,
  level,
}: {
  children: ReactNode;
  count: number;
  level: keyof typeof roleLevel;
}) {
  const { numeral, title } = roleLevel[level];
  return (
    <div className="grid grid-cols-1 gap-0 px-5 py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <div className="mb-3 flex items-baseline gap-2.5 sm:mb-0 sm:flex-col sm:items-start sm:gap-1">
        <span className="font-serif text-[15px] italic text-[#9C7A3C]">{numeral}.</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{title}</span>
        <span className="text-[10px] font-medium text-slate-400 sm:hidden">{count} {count === 1 ? 'person' : 'people'}</span>
      </div>
      <div className="min-w-0 divide-y divide-slate-100/80 rounded-lg border border-slate-100 bg-white/60">{children}</div>
    </div>
  );
}

function DirectoryRow({
  isActive = true,
  name,
  onClick,
  role,
  roleLabel,
  selected = false,
}: {
  isActive?: boolean;
  name: string;
  onClick?: () => void;
  role: UserRole;
  roleLabel: string;
  selected?: boolean;
}) {
  const interactive = Boolean(onClick);
  const Tag = interactive ? 'button' : 'div';

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={`group flex w-full items-center gap-3.5 px-3.5 py-3 text-left transition-colors duration-150 ${
        interactive ? 'cursor-pointer hover:bg-[#FBF7EE] focus-visible:outline-none focus-visible:bg-[#FBF7EE]' : ''
      } ${selected ? 'bg-[#FBF7EE]' : ''}`}
    >
      <span
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-serif text-[12px] font-semibold ${roleAvatarTone(role)}`}
      >
        {getInitials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[14.5px] font-medium text-slate-900">{name}</p>
        <p className="truncate text-[12px] text-slate-500">{roleLabel}</p>
      </div>
      {role !== 'ORG_OWNER' && (
        <span
          className={`hidden flex-shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] sm:flex ${isActive ? 'text-emerald-600' : 'text-slate-300'}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          {isActive ? 'Active' : 'Inactive'}
        </span>
      )}
      {interactive && (
        <svg
          className={`h-3.5 w-3.5 flex-shrink-0 text-[#B08D57] transition duration-150 group-hover:opacity-100 ${selected ? 'rotate-90 opacity-100' : 'opacity-0'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      )}
    </Tag>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="px-3.5 py-3.5 text-[12.5px] italic text-slate-400">No {label} on record</div>;
}

function InlineUserDetails({
  onClose,
  property,
  user,
}: {
  onClose: () => void;
  property: Property | null;
  user: OrganizationUser;
}) {
  return (
    <div className="border-t border-[#F0E5D1] bg-[#FFFCF6] px-3.5 py-4" aria-label={`${user.name} details`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9C7A3C]">User details</p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-600"
          aria-label="Close details"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <PanelField label="Email" value={user.email} />
        <PanelField label="Property" value={property ? property.name : 'Unassigned'} />
        <PanelField
          label="Status"
          value={
            <span className={`inline-flex items-center gap-1.5 ${user.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {user.is_active ? 'Active' : 'Inactive'}
            </span>
          }
        />
        <PanelField label="Joined" value={formatDate(user.created_at)} />
        <PanelField label="Last updated" value={formatDate(user.updated_at)} />
      </dl>
    </div>
  );
}

function PanelField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</dt>
      <dd className="mt-1 text-[14px] font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function FormStep({ children, number, title }: { children: ReactNode; number: string; title: string }) {
  return (
    <section className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-[7rem_1fr]">
      <div className="flex items-center gap-2 sm:block">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
          {number}
        </span>
        <p className="text-[12px] font-bold text-slate-700 sm:mt-2">{title}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function formatRole(role: string) {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function roleSort(role: UserRole) {
  const order: Partial<Record<UserRole, number>> = {
    PLATFORM_OWNER: 0,
    ORG_OWNER: 1,
    SUPER_ADMIN: 2,
    ADMIN: 3,
    STAFF: 4,
  };
  return order[role] ?? 99;
}

function roleAvatarTone(role: UserRole) {
  if (role === 'ORG_OWNER') return 'bg-slate-900 text-[#D9B87C]';
  if (role === 'SUPER_ADMIN') return 'bg-[#F5EBD8] text-[#9C7A3C] ring-1 ring-inset ring-[#D9B87C]/60';
  if (role === 'ADMIN') return 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200';
  return 'bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-150';
}
