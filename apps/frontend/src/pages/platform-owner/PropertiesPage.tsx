import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SearchInput } from '../ui';
import { DeleteButton, IntegrationStatusValue, Metric, Row, StatusDonutChart, StatusPill, formatDate, formatLabel, formatLatency, propertyLabel, scrollPlatformContentToTop } from './shared';
import type { PlatformProperty, PlatformPropertyDetail, PlatformUser } from './types';

export function Properties({
  properties,
  selectedId,
  selectedProperty,
  detail,
  detailLoading,
  loading,
  onSelect,
  onDeleteProperty,
  onDeleteUser,
  pendingDelete,
}: {
  properties: PlatformProperty[];
  selectedId: string;
  selectedProperty: PlatformProperty | null;
  detail: PlatformPropertyDetail | null;
  detailLoading: boolean;
  loading: boolean;
  onSelect: (id: string) => void;
  onDeleteProperty: (property: PlatformProperty) => void;
  onDeleteUser: (user: Pick<PlatformUser, 'id' | 'email'>) => void;
  pendingDelete: string | null;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [propertySearch, setPropertySearch] = useState('');
  const totals = useMemo(() => properties.reduce(
    (sum, property) => ({
      bookings: sum.bookings + property.counts.reservations,
      rooms: sum.rooms + property.counts.rooms,
      users: sum.users + property.counts.users,
    }),
    { bookings: 0, rooms: 0, users: 0 },
  ), [properties]);
  const filteredProperties = useMemo(() => {
    const query = propertySearch.trim().toLowerCase();
    if (!query) return properties;
    return properties.filter((property) =>
      property.name.toLowerCase().includes(query) ||
      property.code.toLowerCase().includes(query),
    );
  }, [properties, propertySearch]);

  function openProperty(propertyId: string) {
    onSelect(propertyId);
    setDetailOpen(true);
    requestAnimationFrame(scrollPlatformContentToTop);
  }

  if (detailOpen) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Property data</p>
              <h3 className="mt-1 truncate text-2xl font-bold text-slate-900">{selectedProperty?.name ?? 'Property'}</h3>
              <p className="mt-1 text-[12px] text-slate-500">{detail?.address ?? selectedProperty?.timezone ?? ''}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {selectedProperty && <StatusPill active={selectedProperty.is_active} />}
              {selectedProperty && (
                <button
                  type="button"
                  onClick={() => void onDeleteProperty(selectedProperty)}
                  disabled={pendingDelete === `property:${selectedProperty.id}`}
                  className="rounded-md border border-rose-100 bg-white px-2 py-1 text-[10px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  {pendingDelete === `property:${selectedProperty.id}` ? 'Deleting' : 'Delete'}
                </button>
              )}
            </div>
          </div>

          {detailLoading && !detail && <PropertyDetailSkeleton />}
          {detail && (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Room categories" value={detail.room_categories.length} compact />
                <Metric label="Rate plans" value={detail.rate_plans.length} compact />
                <Metric label="Channels" value={detail.channels.length} compact />
                <Metric label="Users" value={detail.users.length} compact />
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <StatusDonutChart title="Room status" rows={detail.room_status.map((row) => [formatLabel(row.status), row.count])} palette="rooms" />
                <StatusDonutChart title="Reservation status" rows={detail.reservation_status.map((row) => [formatLabel(row.status), row.count])} palette="reservations" />
              </div>
              <div className="mt-4">
                <ApiUsagePanel usage={detail.api_usage} />
              </div>
            </>
          )}
        </div>

        {detail && (
          <div className="space-y-5">
            <PropertyAccessMesh
              channels={detail.channels}
              users={detail.users}
              reservations={detail.recent_reservations}
              pendingDelete={pendingDelete}
              onDeleteUser={onDeleteUser}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Total properties" value={properties.length} compact />
        <Metric label="Total rooms" value={totals.rooms} compact />
        <Metric label="Total users" value={totals.users} compact />
        <Metric label="Total bookings" value={totals.bookings} compact />
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-[14px] font-bold text-slate-900">All properties</h3>
            <p className="mt-1 text-[12px] text-slate-500">Select a property to open its users, channels, reservations, and API activity.</p>
          </div>
          <SearchInput
            value={propertySearch}
            onChange={setPropertySearch}
            placeholder="Search name or code"
            icon={false}
            inputClassName="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 lg:w-64"
          />
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProperties.map((property) => (
            <button
              type="button"
              key={property.id}
              onClick={() => openProperty(property.id)}
              className={`block rounded-lg border p-4 text-left transition ${selectedId === property.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-slate-900">{property.name}</p>
                  <p className="mt-0.5 text-[11px] font-mono text-slate-400">{property.code}</p>
                  <p className="mt-2 truncate text-[12px] text-slate-500">{property.email ?? property.phone ?? property.timezone}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <StatusPill active={property.is_active} />
                </div>
              </div>
              <p className="mt-3 text-[11px] font-bold text-slate-500">View property data</p>
            </button>
          ))}
          {!loading && properties.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-slate-500 md:col-span-2 xl:col-span-3">No properties found.</div>
          )}
          {!loading && properties.length > 0 && filteredProperties.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-slate-500 md:col-span-2 xl:col-span-3">No properties match your search.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function PropertyAccessMesh({
  channels,
  users,
  reservations,
  pendingDelete,
  onDeleteUser,
}: {
  channels: PlatformPropertyDetail['channels'];
  users: PlatformPropertyDetail['users'];
  reservations: PlatformPropertyDetail['recent_reservations'];
  pendingDelete: string | null;
  onDeleteUser: (user: Pick<PlatformUser, 'id' | 'email'>) => void;
}) {
  const [deleteUserMode, setDeleteUserMode] = useState(false);
  const [selectedUserForDelete, setSelectedUserForDelete] = useState<PlatformPropertyDetail['users'][number] | null>(null);
  const [hoveredDeleteUserId, setHoveredDeleteUserId] = useState<string | null>(null);
  const channelNodes = channels.map((channel, index) => ({
    channel,
    position: channelNodePosition(channel, index, channels.length),
  }));
  const hasTopConnection = channelNodes.some(({ position }) => position.y < 30);
  const hubY = hasTopConnection ? 43 : 38;
  const userNodes = users.map((user, index) => ({
    user,
    position: userNodePosition(index, users.length, hubY),
  }));
  const reservationNodes = buildReservationNodes(reservations, channelNodes, hubY);
  const meshHeightClass = hasTopConnection ? 'min-h-[50rem]' : 'min-h-[42rem]';

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h3 className="text-[14px] font-bold text-slate-900">Channels and users</h3>
        <button
          type="button"
          disabled={users.length === 0}
          onClick={() => {
            setDeleteUserMode((value) => !value);
            setSelectedUserForDelete(null);
          }}
          className={`rounded-md border px-2.5 py-1.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            deleteUserMode
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {deleteUserMode ? 'Cancel delete' : 'Delete user'}
        </button>
      </div>
      <div className={`relative ${meshHeightClass} bg-[radial-gradient(circle_at_50%_38%,#ffffff_0,#f8fafc_45%,#f1f5f9_100%)] p-5`}>
        <div className="hidden lg:block">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {channelNodes.map(({ channel, position }) => (
              <line
                key={`channel-line-${channel.id}`}
                x1="50"
                y1={hubY}
                x2={position.x}
                y2={position.y}
                vectorEffect="non-scaling-stroke"
                className={channel.status.toUpperCase() === 'ACTIVE' ? 'stroke-emerald-300' : 'stroke-slate-300'}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            ))}
            {userNodes.map(({ user, position }) => (
              <line
                key={`user-line-${user.id}`}
                x1="50"
                y1={hubY}
                x2={position.x}
                y2={position.y}
                vectorEffect="non-scaling-stroke"
                className={deleteUserMode && hoveredDeleteUserId === user.id ? 'stroke-rose-400' : user.is_active ? 'stroke-sky-200' : 'stroke-slate-200'}
                strokeWidth={deleteUserMode && hoveredDeleteUserId === user.id ? '2' : '1.2'}
                strokeLinecap="round"
              />
            ))}
            {reservationNodes.map(({ reservation, position, origin }) => (
              <line
                key={`reservation-line-${reservation.id}`}
                x1={origin.x}
                y1={origin.y}
                x2={position.x}
                y2={position.y}
                vectorEffect="non-scaling-stroke"
                className="stroke-sky-300"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeDasharray="4 4"
              />
            ))}
          </svg>

          <div className="absolute left-1/2 z-20 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-slate-200 bg-white shadow-lg shadow-slate-200/70" style={{ top: `${hubY}%` }}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hotel</span>
            <span className="mt-1 text-lg font-black text-slate-900">PMS</span>
          </div>

          {channelNodes.map(({ channel, position }) => (
            <ChannelMeshNode key={channel.id} channel={channel} x={position.x} y={position.y} />
          ))}

          {userNodes.map(({ user, position }) => (
            <UserMeshNode
              key={user.id}
              user={user}
              x={position.x}
              y={position.y}
              pendingDelete={pendingDelete}
              deleteMode={deleteUserMode}
              onHoverUser={setHoveredDeleteUserId}
              onClickUser={(targetUser) => {
                if (!deleteUserMode) return;
                setSelectedUserForDelete(targetUser);
                onDeleteUser(targetUser);
                setDeleteUserMode(false);
              }}
            />
          ))}

          {reservationNodes.map(({ reservation, position }) => (
            <ReservationMeshNode
              key={reservation.id}
              reservation={reservation}
              x={position.x}
              y={position.y}
            />
          ))}
        </div>

        <div className="space-y-4 lg:hidden">
          <div className="mx-auto flex h-20 w-20 flex-col items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hotel</span>
            <span className="mt-1 text-base font-black text-slate-900">PMS</span>
          </div>
          <div className="grid gap-3">
            {channels.map((channel) => <ChannelMeshNode key={channel.id} channel={channel} />)}
            {users.map((user) => (
              <UserMeshNode
                key={user.id}
                user={user}
                pendingDelete={pendingDelete}
                deleteMode={deleteUserMode}
                onHoverUser={setHoveredDeleteUserId}
                onClickUser={(targetUser) => {
                  if (!deleteUserMode) return;
                  setSelectedUserForDelete(targetUser);
                  onDeleteUser(targetUser);
                  setDeleteUserMode(false);
                }}
              />
            ))}
            {reservations.slice(0, 12).map((reservation) => (
              <ReservationMeshNode key={reservation.id} reservation={reservation} />
            ))}
          </div>
        </div>

        {channels.length === 0 && users.length === 0 && (
          <div className="flex min-h-[24rem] items-center justify-center text-[13px] text-slate-500">No channels or users found.</div>
        )}
      </div>
    </section>
  );
}

function ChannelMeshNode({ channel, x, y }: { channel: PlatformPropertyDetail['channels'][number]; x?: number; y?: number }) {
  const active = channel.status.toUpperCase() === 'ACTIVE';

  return (
    <div
      className={`z-10 min-w-0 rounded-xl border bg-white px-4 py-3 shadow-sm transition hover:shadow-md lg:absolute lg:w-56 lg:-translate-x-1/2 lg:-translate-y-1/2 ${active ? 'border-emerald-200' : 'border-slate-200'}`}
      style={x != null && y != null ? { left: `${x}%`, top: `${y}%` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-black text-slate-900">{channel.provider}</p>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{channel.name}</p>
        </div>
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {channel.provider.slice(0, 2)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <IntegrationStatusValue status={channel.status} />
        <span className="rounded-md bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
          {channel.external_hotel_id ?? 'No hotel id'}
        </span>
      </div>
    </div>
  );
}

function UserMeshNode({
  user,
  x,
  y,
  pendingDelete,
  deleteMode,
  onHoverUser,
  onClickUser,
}: {
  user: PlatformPropertyDetail['users'][number];
  x?: number;
  y?: number;
  pendingDelete: string | null;
  deleteMode: boolean;
  onHoverUser: (id: string | null) => void;
  onClickUser: (user: PlatformPropertyDetail['users'][number]) => void;
}) {
  const roleTone = userRoleTone(user.role);

  return (
    <button
      type="button"
      disabled={pendingDelete === `user:${user.id}`}
      onClick={() => onClickUser(user)}
      onMouseEnter={() => deleteMode && onHoverUser(user.id)}
      onMouseLeave={() => onHoverUser(null)}
      onFocus={() => deleteMode && onHoverUser(user.id)}
      onBlur={() => onHoverUser(null)}
      className={`z-10 min-w-0 rounded-lg border bg-white px-3 py-2 text-left shadow-sm transition lg:absolute lg:w-40 lg:-translate-x-1/2 lg:-translate-y-1/2 ${
        deleteMode ? 'cursor-pointer' : 'cursor-default'
      } ${user.is_active ? roleTone.border : 'border-slate-100 opacity-60'}`}
      style={x != null && y != null ? { left: `${x}%`, top: `${y}%` } : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className={`inline-flex max-w-full truncate rounded-md px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wide ${roleTone.badge}`}>
            {formatLabel(user.role)}
          </span>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${user.is_active ? roleTone.dot : 'bg-slate-300'}`} />
            <p className="truncate text-[11.5px] font-bold text-slate-800">{user.name}</p>
          </div>
        </div>
        {pendingDelete === `user:${user.id}` && <span className="ml-auto text-[10px] font-bold text-rose-600">Deleting</span>}
      </div>
    </button>
  );
}

function ReservationMeshNode({
  reservation,
  x,
  y,
}: {
  reservation: PlatformPropertyDetail['recent_reservations'][number];
  x?: number;
  y?: number;
}) {
  return (
    <div
      className="z-10 min-w-0 rounded-lg border border-sky-100 bg-white px-3 py-2 shadow-sm lg:absolute lg:w-40 lg:-translate-x-1/2 lg:-translate-y-1/2"
      style={x != null && y != null ? { left: `${x}%`, top: `${y}%` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] font-bold text-slate-800">{reservation.external_reservation_id}</p>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">{reservation.source ?? 'Direct'} · {formatDate(reservation.updated_at)}</p>
        </div>
        <span className="flex-shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-700">
          {formatLabel(reservation.status)}
        </span>
      </div>
    </div>
  );
}

function channelNodePosition(channel: PlatformPropertyDetail['channels'][number], index: number, count: number) {
  const provider = channel.provider.toLowerCase();
  if (provider.includes('booking')) return { x: 24, y: 38 };
  if (provider.includes('airbnb')) return { x: 76, y: 38 };
  if (provider.includes('expedia')) return { x: 50, y: 18 };
  if (count === 1) return { x: 24, y: 38 };
  if (count === 2) return index === 0 ? { x: 24, y: 38 } : { x: 76, y: 38 };
  const base = [
    { x: 24, y: 38 },
    { x: 76, y: 38 },
    { x: 50, y: 18 },
    { x: 24, y: 18 },
    { x: 76, y: 18 },
  ];
  return base[index] ?? { x: 50, y: 24 };
}

function userNodePosition(index: number, count: number, hubY: number) {
  const maxVisible = Math.max(count, 1);
  const columns = Math.min(maxVisible, 5);
  const row = Math.floor(index / columns);
  const column = index % columns;
  const startX = columns === 1 ? 50 : 22;
  const endX = columns === 1 ? 50 : 78;
  const x = columns === 1 ? 50 : startX + (column / (columns - 1)) * (endX - startX);
  return { x, y: hubY + 44 + row * 9 };
}

function matchReservationChannel(
  reservation: PlatformPropertyDetail['recent_reservations'][number],
  channelNodes: Array<{ channel: PlatformPropertyDetail['channels'][number]; position: { x: number; y: number } }>,
) {
  const source = reservation.source?.trim().toLowerCase();
  if (!source || source === 'direct') return null;

  return channelNodes.find(({ channel }) => {
    const provider = channel.provider.toLowerCase();
    const name = channel.name.toLowerCase();
    return source.includes(provider) || provider.includes(source) || source.includes(name);
  }) ?? null;
}

function buildReservationNodes(
  reservations: PlatformPropertyDetail['recent_reservations'],
  channelNodes: Array<{ channel: PlatformPropertyDetail['channels'][number]; position: { x: number; y: number } }>,
  hubY: number,
) {
  const nodes: Array<{
    reservation: PlatformPropertyDetail['recent_reservations'][number];
    position: { x: number; y: number };
    origin: { x: number; y: number };
  }> = [];
  const usedReservationIds = new Set<string>();

  for (const channelNode of channelNodes) {
    const channelReservations = reservations
      .filter((reservation) => matchReservationChannel(reservation, channelNodes)?.channel.id === channelNode.channel.id)
      .slice(0, 4);

    channelReservations.forEach((reservation, index) => {
      usedReservationIds.add(reservation.id);
      nodes.push({
        reservation,
        origin: channelNode.position,
        position: reservationNodePositionForOrigin(index, channelReservations.length, channelNode.position),
      });
    });
  }

  const directReservations = reservations
    .filter((reservation) => !usedReservationIds.has(reservation.id) && !matchReservationChannel(reservation, channelNodes))
    .slice(0, 4);

  directReservations.forEach((reservation, index) => {
    nodes.push({
      reservation,
      origin: { x: 50, y: hubY },
      position: directReservationNodePosition(index, directReservations.length, hubY),
    });
  });

  return nodes;
}

function reservationNodePositionForOrigin(index: number, count: number, origin: { x: number; y: number }) {
  const topOffsets = [-30, -10, 10, 30];
  const sideY = [12, 24, 52, 64];

  if (origin.x < 35) {
    return { x: 7, y: sideY[index] ?? 68 };
  }

  if (origin.x > 65) {
    return { x: 93, y: sideY[index] ?? 68 };
  }

  return { x: Math.max(14, Math.min(86, origin.x + topOffsets[index])), y: 6 };
}

function directReservationNodePosition(index: number, count: number, hubY: number) {
  const columns = Math.min(Math.max(count, 1), 4);
  const startX = columns === 1 ? 50 : 36;
  const endX = columns === 1 ? 50 : 64;
  const x = columns === 1 ? 50 : startX + (index / (columns - 1)) * (endX - startX);
  return { x, y: hubY + 20 };
}

function userRoleTone(role: string) {
  if (role === 'ORG_OWNER') {
    return {
      border: 'border-amber-200',
      dot: 'bg-amber-500',
      badge: 'bg-amber-50 text-amber-700',
    };
  }

  if (role === 'SUPER_ADMIN') {
    return {
      border: 'border-indigo-200',
      dot: 'bg-indigo-500',
      badge: 'bg-indigo-50 text-indigo-700',
    };
  }

  if (role === 'ADMIN') {
    return {
      border: 'border-sky-100',
      dot: 'bg-sky-500',
      badge: 'bg-sky-50 text-sky-700',
    };
  }

  return {
    border: 'border-slate-100',
    dot: 'bg-emerald-500',
    badge: 'bg-slate-50 text-slate-600',
  };
}

function PropertyDetailSkeleton() {
  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {['Room categories', 'Rate plans', 'Channels', 'Users'].map((label) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="mt-3 h-6 w-10 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-28 rounded-lg border border-slate-100 bg-slate-50" />
        <div className="h-28 rounded-lg border border-slate-100 bg-slate-50" />
      </div>
      <div className="h-80 rounded-lg border border-slate-100 bg-slate-50" />
    </div>
  );
}

function ApiUsagePanel({ usage }: { usage: PlatformPropertyDetail['api_usage'] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-[14px] font-bold text-slate-900">API usage patterns</h3>
        <p className="mt-1 text-[12px] text-slate-500">
          Recent calls made by users scoped to this property. Stored in the live trace buffer.
        </p>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <ApiCallsByHourChart points={usage.calls_by_hour} />
        <ApiHealthSnapshot usage={usage} />
      </div>
    </section>
  );
}

function ApiCallsByHourChart({ points }: { points: PlatformPropertyDetail['api_usage']['calls_by_hour'] }) {
  const max = Math.max(...points.map((point) => Math.max(point.calls, point.failed_calls)), 1);
  const total = points.reduce((sum, point) => sum + point.calls, 0);
  const failed = points.reduce((sum, point) => sum + point.failed_calls, 0);
  const W = 720;
  const H = 220;
  const padLeft = 34;
  const padRight = 12;
  const padTop = 18;
  const padBottom = 34;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;
  const barGap = 5;
  const barW = Math.max(6, (plotW - barGap * Math.max(points.length - 1, 0)) / Math.max(points.length, 1));
  const yTicks = [0, Math.ceil(max / 2), max];

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-slate-700">API calls per hour</p>
          <p className="mt-1 text-[11px] text-slate-500">Last 24 hours from the trace buffer</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3 text-[10.5px] font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-sky-500" /> Calls</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-rose-500" /> Failed</span>
        </div>
      </div>
      <svg className="mt-3 h-[220px] w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="API calls per hour">
        {yTicks.map((tick) => {
          const y = padTop + plotH - (tick / max) * plotH;
          return (
            <g key={tick}>
              <line x1={padLeft} x2={W - padRight} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={tick === 0 ? undefined : '3 4'} />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px] font-semibold">{tick}</text>
            </g>
          );
        })}
        {points.map((point, index) => {
          const x = padLeft + index * (barW + barGap);
          const callsH = point.calls > 0 ? Math.max(4, (point.calls / max) * plotH) : 2;
          const failedH = point.failed_calls > 0 ? Math.max(3, (point.failed_calls / max) * plotH) : 0;
          const showTick = index === 0 || index === points.length - 1 || index % 6 === 0;
          return (
            <g key={point.hour}>
              <title>{`${point.label}: ${point.calls} calls, ${point.failed_calls} failed`}</title>
              <rect x={x} y={padTop + plotH - callsH} width={barW} height={callsH} rx="3" className="fill-sky-500/75" />
              {failedH > 0 && <rect x={x} y={padTop + plotH - failedH} width={barW} height={failedH} rx="3" className="fill-rose-500" />}
              {showTick && (
                <text x={x + barW / 2} y={H - 12} textAnchor="middle" className="fill-slate-400 text-[10px] font-semibold">
                  {point.label.replace(' ', '')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between border-t border-slate-200/70 pt-3">
        <span className="text-[11px] font-semibold text-slate-500">Total {total} calls</span>
        <span className={`text-[11px] font-bold ${failed > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
          {failed} failed
        </span>
      </div>
    </div>
  );
}

function ApiHealthSnapshot({ usage }: { usage: PlatformPropertyDetail['api_usage'] }) {
  const failureRate = usage.total_calls > 0 ? Math.round((usage.failed_calls / usage.total_calls) * 100) : 0;
  const recentShare = usage.total_calls > 0 ? Math.min(100, Math.round((usage.calls_last_60m / usage.total_calls) * 100)) : 0;

  return (
    <div className="grid gap-3">
      <GaugeCard label="Failure rate" value={failureRate} suffix="%" tone={failureRate > 0 ? 'bad' : 'good'} />
      <GaugeCard label="Last hour activity" value={recentShare} suffix="%" tone={recentShare > 50 ? 'warn' : 'neutral'} />
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
        <p className="text-[12px] font-bold text-slate-700">Average latency</p>
        <div className="mt-3 flex items-end gap-2">
          <span className="text-3xl font-bold tracking-tight text-slate-900">{usage.average_latency_ms ?? '-'}</span>
          <span className="pb-1 text-[11px] font-bold text-slate-400">ms</span>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {usage.last_called_at ? `Last call ${formatDate(usage.last_called_at)}` : 'No calls recorded yet'}
        </p>
      </div>
    </div>
  );
}

function GaugeCard({ label, value, suffix, tone }: { label: string; value: number; suffix: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const color = {
    good: '#10b981',
    warn: '#f59e0b',
    bad: '#ef4444',
    neutral: '#64748b',
  }[tone];
  const dash = Math.max(0, Math.min(100, value));

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-slate-700">{label}</p>
          <p className="mt-1 text-[11px] text-slate-500">{value}{suffix}</p>
        </div>
        <svg width="58" height="58" viewBox="0 0 42 42" aria-hidden="true">
          <circle cx="21" cy="21" r="16" fill="none" stroke="#e2e8f0" strokeWidth="5" />
          <circle
            cx="21"
            cy="21"
            r="16"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${100 - dash}`}
            pathLength="100"
            transform="rotate(-90 21 21)"
          />
          <text x="21" y="24" textAnchor="middle" className="fill-slate-800 text-[9px] font-bold">{value}</text>
        </svg>
      </div>
    </div>
  );
}
