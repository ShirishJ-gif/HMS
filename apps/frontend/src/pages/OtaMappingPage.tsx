import { FormEvent, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CatalogList, formatConnectionLabel, formatDateTime } from './channel/ChannelUi';
import { ChannelWorkspace } from './channel/useChannelWorkspace';
import { CustomSelect } from '../components/CustomSelect';
import { PropertySetupPage } from './PropertySetupPage';
import { RoomsPage } from './RoomsPage';
import {
  labelCls,
  inputCls,
  primaryBtn,
  secondaryBtn,
  ErrorMsg,
  LoadingMsg,
  SuccessMsg,
} from './ui';

/* ─── OTA brand colours ─── */
type OtaBrand = { color: string; bg: string; abbr: string };
function otaBrand(name = ''): OtaBrand {
  const n = name.toLowerCase();
  if (n.includes('booking')) return { color: '#003580', bg: '#dbeafe', abbr: 'B' };
  if (n.includes('airbnb')) return { color: '#e11d48', bg: '#ffe4e6', abbr: 'AB' };
  if (n.includes('expedia')) return { color: '#1e2a4a', bg: '#e0e7ff', abbr: 'EX' };
  if (n.includes('agoda')) return { color: '#7b2d8b', bg: '#f3e8ff', abbr: 'AG' };
  if (n.includes('makemy') || n.includes('mmt')) return { color: '#b91c1c', bg: '#fee2e2', abbr: 'MT' };
  if (n.includes('goibibo')) return { color: '#c2410c', bg: '#ffedd5', abbr: 'GI' };
  if (n.includes('cleartrip')) return { color: '#0369a1', bg: '#e0f2fe', abbr: 'CT' };
  if (n.includes('tripadvisor')) return { color: '#166534', bg: '#dcfce7', abbr: 'TA' };
  if (n.includes('hotels')) return { color: '#9f1239', bg: '#ffe4e6', abbr: 'HC' };
  if (n.includes('vrbo') || n.includes('homeaway')) return { color: '#15803d', bg: '#dcfce7', abbr: 'VR' };
  if (n.includes('trip') || n.includes('ctrip')) return { color: '#1d4ed8', bg: '#dbeafe', abbr: 'TC' };
  const abbr = name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'OT';
  return { color: '#475569', bg: '#f1f5f9', abbr };
}

/* ─── helpers ─── */
function fmtEventLabel(v: string) { return v.charAt(0).toUpperCase() + v.slice(1); }
function describeEvent(v: string) {
  if (v === 'new') return 'Creates a fresh provider test reservation. Reservation ID can stay empty.';
  if (v === 'modified') return 'Replays an update for an existing imported reservation.';
  if (v === 'cancelled') return 'Triggers a provider-side cancellation so HMS can reconcile the stay.';
  return 'Sends a provider-side test event and syncs the resulting state into HMS.';
}
function isAuthUrlResponse(p: unknown): p is { auth_url: string } {
  return Boolean(p && typeof p === 'object' && 'auth_url' in p && typeof (p as { auth_url?: unknown }).auth_url === 'string');
}
function matchesOtaOption(connectionName: string | null | undefined, optionLabel: string) {
  const a = (connectionName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = optionLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
  return Boolean(a && b && a.includes(b));
}

/* ─── Status badge ─── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; dot: string; text: string }> = {
    ACTIVE: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', text: 'Active' },
    PAUSED: { bg: 'bg-amber-50 border-amber-200 text-amber-600', dot: 'bg-amber-400', text: 'Paused' },
    ERROR: { bg: 'bg-rose-50 border-rose-200 text-rose-600', dot: 'bg-rose-500', text: 'Error' },
  };
  const s = map[status] ?? { bg: 'bg-slate-50 border-slate-200 text-slate-500', dot: 'bg-slate-300', text: status || 'Pending' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold tracking-wide uppercase ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.text}
    </span>
  );
}

/* ─── Log status badge ─── */
function LogStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    SUCCEEDED: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    PARTIAL_FAILED: 'bg-amber-50 border-amber-200 text-amber-700',
    FAILED: 'bg-rose-50 border-rose-200 text-rose-600',
  };
  const dot: Record<string, string> = {
    SUCCEEDED: 'bg-emerald-500',
    PARTIAL_FAILED: 'bg-amber-400',
    FAILED: 'bg-rose-500',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${map[status] ?? 'bg-blue-50 border-blue-200 text-blue-600'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status] ?? 'bg-blue-400'}`} />
      {status}
    </span>
  );
}

/* ─── Collapsible section ─── */
function Section({
  icon, title, badge, accent = '#6366f1', defaultOpen = false, actionSlotId, children,
}: {
  icon?: string; title: string; badge?: string; accent?: string; defaultOpen?: boolean; actionSlotId?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-xl border bg-white transition-all duration-200 ${open ? 'overflow-visible border-slate-200 shadow-sm ring-1 ring-black/[0.02]' : 'overflow-hidden border-slate-200'}`}>
      <div className="flex items-center gap-3 rounded-t-xl bg-white px-4 py-3.5">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:text-slate-900"
        >
          {icon && (
            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
              style={{ backgroundColor: open ? accent + '15' : '#f1f5f9' }}>
              {icon}
            </span>
          )}
          <span className="text-[13.5px] font-semibold text-slate-800 flex-1">{title}</span>
        </button>
        {open && actionSlotId && <span id={actionSlotId} className="flex items-center" />}
        {badge && (
          <span className="text-[10.5px] text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 font-medium">
            {badge}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`text-slate-400 text-[10px] font-bold transition-transform duration-200 ml-1 ${open ? 'rotate-180' : ''}`}
          aria-label={open ? 'Collapse section' : 'Expand section'}
        >
          ▼
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 bg-white rounded-b-xl">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── Progress stepper ─── */
function Stepper({ steps, brandColor }: { steps: { label: string; done: boolean }[]; brandColor: string }) {
  const doneCount = steps.filter(s => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Setup progress</p>
        <span className="text-[12px] font-semibold" style={{ color: doneCount === steps.length ? '#10b981' : brandColor }}>
          {doneCount}/{steps.length} steps
        </span>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: doneCount === steps.length ? '#10b981' : brandColor }} />
      </div>
      {/* Steps */}
      <div className="flex items-start gap-1">
        {steps.map((step, i) => (
          <div key={step.label} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-all
              ${step.done
                ? 'text-white border-transparent'
                : i === doneCount
                  ? 'bg-white border-amber-300 text-amber-600'
                  : 'bg-white border-slate-200 text-slate-400'}`}
              style={step.done ? { backgroundColor: brandColor, borderColor: brandColor } : {}}>
              {step.done ? '✓' : i + 1}
            </div>
            <span className={`text-[9px] text-center leading-tight font-medium w-12
              ${step.done ? 'text-slate-600' : i === doneCount ? 'text-amber-600' : 'text-slate-400'}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Mini stat card ─── */
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex-1 min-w-0 bg-slate-50 border border-black/[0.05] rounded-xl p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className="text-[18px] font-bold text-slate-900 leading-none">{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

type RoomConnectorConnection = NonNullable<ChannelWorkspace['selectedConnection']>;
type ConnectorLine = { color: string; d: string; id: string };
type SetupStep = { label: string; done: boolean };

const connectorColors = ['#6EC6B8', '#9BBDF9', '#F3BE7A', '#C4AEF7', '#86D9B2'];
const connectorEndpointGap = 16;
const roomMappingSaveSlotId = 'ota-room-mapping-save-slot';
const rateMappingSaveSlotId = 'ota-rate-mapping-save-slot';

function buildOtaSetupSteps({
  airbnbActions,
  catalogLoaded,
  channelId,
  otaName,
  rateMappingsCount,
  roomMappingsCount,
  setupStatus,
}: {
  airbnbActions: Set<string>;
  catalogLoaded: boolean;
  channelId?: string | null;
  otaName: string;
  rateMappingsCount: number;
  roomMappingsCount: number;
  setupStatus?: NonNullable<RoomConnectorConnection['provider_config_summary']>['setup_status'];
}): SetupStep[] {
  const normalizedOta = otaName.toLowerCase();
  const isAirbnb = channelId === '3' || normalizedOta.includes('airbnb');
  const isBooking = channelId === '1' || normalizedOta.includes('booking');
  const isExpedia = channelId === '2' || normalizedOta.includes('expedia');

  if (isAirbnb) {
    return [
      { label: 'Host activation', done: airbnbActions.has('airbnb-host-activation') },
      { label: 'Open auth URL', done: airbnbActions.has('airbnb-oauth2-tests') },
      { label: 'Host status', done: airbnbActions.has('airbnb-host-status') },
      { label: 'Host listings', done: airbnbActions.has('airbnb-listings') },
      { label: 'Re-activate property', done: Boolean(setupStatus?.activated) },
      { label: 'Property check', done: Boolean(setupStatus?.checked) },
      { label: 'Load rooms & rates', done: catalogLoaded },
    ];
  }

  return [
    isBooking || isExpedia
      ? { label: 'Re-activate property', done: Boolean(setupStatus?.activated) }
      : { label: 'Property check', done: Boolean(setupStatus?.checked) },
    { label: 'Catalog', done: catalogLoaded },
    { label: 'Rooms', done: roomMappingsCount > 0 },
    { label: 'Rates', done: rateMappingsCount > 0 },
    { label: 'Activate rooms', done: Boolean(setupStatus?.rooms_activated) },
    { label: 'Property check', done: Boolean(setupStatus?.ready) },
  ];
}

function roomConnectorId(prefix: string, value: string) {
  return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function pointerPoint(event: ReactMouseEvent | ReactTouchEvent | MouseEvent | TouchEvent) {
  if ('touches' in event && event.touches.length > 0) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  if ('changedTouches' in event && event.changedTouches.length > 0) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }
  return { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
}

function RoomConnectorMapper({
  brand,
  connection,
  workspace,
}: {
  brand: OtaBrand;
  connection: RoomConnectorConnection;
  workspace: ChannelWorkspace;
}) {
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const midRef = useRef<HTMLDivElement | null>(null);
  const [dragRoomId, setDragRoomId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ title: string; x: number; y: number } | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const [lines, setLines] = useState<ConnectorLine[]>([]);
  const [editMode, setEditMode] = useState(false);

  const savedByCategory = useMemo(
    () => new Map(connection.room_mappings.map(mapping => [mapping.room_category_id, mapping])),
    [connection.room_mappings],
  );
  const [draftMatches, setDraftMatches] = useState<Record<string, string>>(() =>
    Object.fromEntries(connection.room_mappings.map(mapping => [mapping.room_category_id, mapping.external_room_id])),
  );
  useEffect(() => {
    setDraftMatches(Object.fromEntries(connection.room_mappings.map(mapping => [mapping.room_category_id, mapping.external_room_id])));
  }, [connection.room_mappings]);
  const draftEntries = useMemo(() => Object.entries(draftMatches), [draftMatches]);
  const mappedByCategory = useMemo(() => new Map(draftEntries), [draftEntries]);
  const mappedExternalIds = useMemo(
    () => new Set(draftEntries.map(([, externalRoomId]) => externalRoomId)),
    [draftEntries],
  );
  const unsavedRoomMappings = draftEntries
    .filter(([roomCategoryId, externalRoomId]) => savedByCategory.get(roomCategoryId)?.external_room_id !== externalRoomId)
    .filter(([roomCategoryId]) => !savedByCategory.has(roomCategoryId))
    .map(([roomCategoryId, externalRoomId]) => ({ roomCategoryId, externalRoomId }));
  const changedRoomMappings = draftEntries
    .map(([roomCategoryId, externalRoomId]) => {
      const saved = savedByCategory.get(roomCategoryId);
      return saved && saved.external_room_id !== externalRoomId ? { mappingId: saved.id, externalRoomId } : null;
    })
    .filter((mapping): mapping is { mappingId: string; externalRoomId: string } => mapping != null);
  const hasSavedRemapDraft = draftEntries.some(
    ([roomCategoryId, externalRoomId]) => savedByCategory.has(roomCategoryId) && savedByCategory.get(roomCategoryId)?.external_room_id !== externalRoomId,
  );
  const rooms = workspace.scopedCategories;
  const roomOrderById = useMemo(
    () => new Map(rooms.map((room, index) => [room.id, index])),
    [rooms],
  );
  const mappedRoomIndexByExternalId = useMemo(
    () => new Map(draftEntries.map(([roomCategoryId, externalRoomId]) => [externalRoomId, roomOrderById.get(roomCategoryId) ?? 0])),
    [draftEntries, roomOrderById],
  );
  const targets = useMemo(() => {
    const byId = new Map(workspace.catalogRooms.map(target => [target.external_room_id, target]));
    for (const mapping of connection.room_mappings) {
      if (!byId.has(mapping.external_room_id)) {
        byId.set(mapping.external_room_id, {
          external_room_id: mapping.external_room_id,
          external_room_name: mapping.external_room_name ?? mapping.room_category.name,
        });
      }
    }
    const savedTargetOrder = new Map<string, number>(
      draftEntries.flatMap(([roomCategoryId, externalRoomId]) => {
        const saved = savedByCategory.get(roomCategoryId);
        return saved?.external_room_id === externalRoomId
          ? [[externalRoomId, roomOrderById.get(roomCategoryId) ?? Number.MAX_SAFE_INTEGER] as const]
          : [];
      }),
    );

    return Array.from(byId.values())
      .map((target, index) => ({ target, index }))
      .sort((a, b) => {
        const orderA = savedTargetOrder.get(a.target.external_room_id);
        const orderB = savedTargetOrder.get(b.target.external_room_id);
        if (orderA != null && orderB != null) return orderA - orderB;
        if (orderA != null) return -1;
        if (orderB != null) return 1;
        return a.index - b.index;
      })
      .map(({ target }) => target);
  }, [connection.room_mappings, draftEntries, roomOrderById, savedByCategory, workspace.catalogRooms]);
  const canMap = workspace.canMap && workspace.pendingAction !== 'create-room-mapping';
  const saveSlot = typeof document === 'undefined' ? null : document.getElementById(roomMappingSaveSlotId);
  const hasRoomChanges = unsavedRoomMappings.length > 0 || changedRoomMappings.length > 0;

  async function saveRoomChanges() {
    if (unsavedRoomMappings.length > 0) await workspace.saveRoomMappingsBatch(unsavedRoomMappings);
    for (const mapping of changedRoomMappings) {
      await workspace.updateRoomMapping(mapping.mappingId, { externalRoomId: mapping.externalRoomId });
    }
    setEditMode(false);
  }

  const drawLines = useCallback(() => {
    const mid = midRef.current;
    if (!mid) return;
    const midBox = mid.getBoundingClientRect();

    const nextLines = draftEntries.flatMap(([roomCategoryId, externalRoomId], index) => {
      const leftDot = document.getElementById(roomConnectorId('hms-room-dot', roomCategoryId));
      const rightDot = document.getElementById(roomConnectorId('ota-room-dot', externalRoomId));
      if (!leftDot || !rightDot) return [];

      const leftBox = leftDot.getBoundingClientRect();
      const rightBox = rightDot.getBoundingClientRect();
      const x1 = leftBox.left + leftBox.width / 2 - midBox.left + connectorEndpointGap;
      const y1 = leftBox.top + leftBox.height / 2 - midBox.top;
      const x2 = rightBox.left + rightBox.width / 2 - midBox.left - connectorEndpointGap;
      const y2 = rightBox.top + rightBox.height / 2 - midBox.top;
      const cx = (x1 + x2) / 2;
      const saved = savedByCategory.get(roomCategoryId)?.external_room_id === externalRoomId;
      const colorIndex = roomOrderById.get(roomCategoryId) ?? index;

      return [{
        color: connectorColors[colorIndex % connectorColors.length],
        d: saved ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`,
        id: `${roomCategoryId}:${externalRoomId}`,
      }];
    });

    setLines(nextLines);
  }, [draftEntries, roomOrderById, savedByCategory]);

  useEffect(() => {
    const raf = requestAnimationFrame(drawLines);
    const settleTimer = window.setTimeout(drawLines, 80);
    window.addEventListener('resize', drawLines);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', drawLines);
    };
  }, [drawLines, rooms.length, targets.length]);

  const findTargetAtPoint = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest<HTMLElement>('[data-ota-room-id]')?.dataset.otaRoomId ?? null;
  };

  const startDrag = (roomId: string, title: string, event: ReactMouseEvent | ReactTouchEvent) => {
    const saved = savedByCategory.has(roomId);
    if (saved && !editMode) return;
    if (!saved && !canMap) return;
    event.preventDefault();
    const point = pointerPoint(event);
    setDragRoomId(roomId);
    setGhost({ title, x: point.x, y: point.y });
  };

  useEffect(() => {
    if (!dragRoomId) return;

    const move = (event: MouseEvent | TouchEvent) => {
      event.preventDefault();
      const point = pointerPoint(event);
      setGhost(current => current ? { ...current, x: point.x, y: point.y } : current);
      setHoverTargetId(findTargetAtPoint(point.x, point.y));
    };

    const up = (event: MouseEvent | TouchEvent) => {
      const point = pointerPoint(event);
      const targetId = findTargetAtPoint(point.x, point.y);
      if (targetId) {
        setDraftMatches(current => {
          const next = Object.fromEntries(Object.entries(current).filter(([, externalRoomId]) => externalRoomId !== targetId));
          next[dragRoomId] = targetId;
          return next;
        });
      }
      setDragRoomId(null);
      setGhost(null);
      setHoverTargetId(null);
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
    };
  }, [dragRoomId]);

  return (
    <div className="pt-1">
      {!workspace.canMap && draftEntries.length === 0 && (
        <div className="mb-4 border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-medium text-amber-800">
          Load the provider catalog for this connection before saving new room mappings.
        </div>
      )}
      {/* {!workspace.canMap && draftEntries.length > 0 && (
        <div className="mb-4 border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] font-medium text-slate-600">
          Saved room mappings are shown below. Load the provider catalog only when adding new mappings.
        </div>
      )} */}
      {hasSavedRemapDraft && (
        <div className="mb-4 border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-medium text-amber-800">
          Saved room mapping changes are staged. Save changes or cancel edit mode before adding more mappings.
        </div>
      )}

      {saveSlot && createPortal(
        <span className="flex items-center gap-1.5">
          {editMode ? (
            <button
              type="button"
              onClick={() => { setEditMode(false); setDraftMatches(Object.fromEntries(connection.room_mappings.map(mapping => [mapping.room_category_id, mapping.external_room_id]))); }}
              className="inline-flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="inline-flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => void saveRoomChanges()}
            disabled={!hasRoomChanges || (!editMode && hasSavedRemapDraft) || workspace.pendingAction === 'create-room-mapping' || workspace.pendingAction === 'update-room-mapping'}
            className="inline-flex h-7 items-center justify-center rounded-md bg-emerald-600 px-3 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {workspace.pendingAction === 'create-room-mapping' || workspace.pendingAction === 'update-room-mapping' ? 'Saving...' : `Save${hasRoomChanges ? ` (${unsavedRoomMappings.length + changedRoomMappings.length})` : ''}`}
          </button>
        </span>,
        saveSlot,
      )}

      <div ref={arenaRef} className="mt-3 grid grid-cols-1 gap-5 px-4 lg:px-8 lg:grid-cols-[minmax(0,0.95fr)_4rem_minmax(0,0.95fr)]">
        <div className="min-w-0 lg:pr-5">
          <p className="mb-4 max-w-[22rem] px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">HMS inventory</p>
          <div className="scrollbar-none max-h-[24rem] space-y-2 overflow-y-auto px-1 lg:max-w-[22rem]">
            {rooms.map((room, index) => {
              const mappedExternalRoomId = mappedByCategory.get(room.id);
              const matched = Boolean(mappedExternalRoomId);
              const saved = savedByCategory.get(room.id)?.external_room_id === mappedExternalRoomId;
              const color = connectorColors[index % connectorColors.length];
              return (
                <button
                  key={room.id}
                  type="button"
                  onMouseDown={event => startDrag(room.id, room.name, event)}
                  onTouchStart={event => startDrag(room.id, room.name, event)}
                  className={`relative w-full cursor-grab select-none border bg-white px-3.5 py-2.5 text-left shadow-sm transition active:cursor-grabbing ${
                    dragRoomId === room.id ? 'scale-[0.98] opacity-50' : 'hover:-translate'
                  } ${matched ? 'bg-white' : 'border-slate-200 hover:border-slate-400'}`}
                  style={matched ? { borderColor: color, boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                >
                  <span
                    id={roomConnectorId('hms-room-dot', room.id)}
                    className="absolute -right-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 bg-white"
                    style={matched ? { backgroundColor: color, borderColor: color } : { borderColor: '#cbd5e1' }}
                  />
                  <span className="block pr-7 text-[13px] font-semibold text-slate-900">{room.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">{room.code} · max {room.max_occupancy}</span>
                  {matched && <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm" style={{ backgroundColor: color }}>{saved ? 'Mapped' : 'Draft'}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div ref={midRef} className="relative hidden min-h-[15rem] items-center justify-center lg:flex">
          <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <defs>
              <marker id="room-map-arrow" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="currentColor" opacity="0.4" />
              </marker>
            </defs>
            {lines.map(line => (
              <path
                key={line.id}
                d={line.d}
                fill="none"
                markerEnd="url(#room-map-arrow)"
                opacity="0.85"
                stroke={line.color}
                strokeLinecap="round"
                strokeWidth="2"
              />
            ))}
          </svg>
          <div className="rotate-180 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-300 [writing-mode:vertical-rl]">
            drop zone
          </div>
        </div>

        <div className="min-w-0 lg:pl-5">
          <p className="mb-4 px-1 text-[10px] font-bold uppercase tracking-widest lg:ml-auto lg:max-w-[22rem]" style={{ color: brand.color }}>OTA drop targets</p>
          <div className="scrollbar-none max-h-[24rem] space-y-2 overflow-y-auto pl-1 lg:ml-auto lg:max-w-[22rem]">
            {targets.map((target, index) => {
              const matched = mappedExternalIds.has(target.external_room_id);
              const hover = hoverTargetId === target.external_room_id && dragRoomId && !matched;
              const colorIndex = mappedRoomIndexByExternalId.get(target.external_room_id) ?? index;
              const color = connectorColors[colorIndex % connectorColors.length];
              return (
                <button
                  key={target.external_room_id}
                  type="button"
                  data-ota-room-id={target.external_room_id}
                  onClick={() => {
                    const room = rooms.find(candidate => !mappedByCategory.has(candidate.id));
                    if (room && canMap && !matched) {
                      setDraftMatches(current => {
                        const next = Object.fromEntries(Object.entries(current).filter(([, externalRoomId]) => externalRoomId !== target.external_room_id));
                        next[room.id] = target.external_room_id;
                        return next;
                      });
                    }
                  }}
                  className={`relative w-full border bg-white px-3.5 py-2.5 text-left transition ${
                    hover ? 'scale-[1.01] border-sky-400 bg-sky-50' : matched ? 'bg-white shadow-sm' : 'border-slate-200 hover:border-slate-400'
                  }`}
                  style={matched ? { borderColor: color, boxShadow: `inset -3px 0 0 ${color}` } : undefined}
                >
                  <span
                    id={roomConnectorId('ota-room-dot', target.external_room_id)}
                    className="absolute -left-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 bg-white"
                    style={matched ? { backgroundColor: color, borderColor: color } : { borderColor: hover ? '#38bdf8' : '#cbd5e1' }}
                  />
                  <span className="block pr-7 text-[13px] font-semibold text-slate-900">{target.external_room_name ?? 'Provider room'}</span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">{target.external_room_id}</span>
                  {matched && <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm" style={{ backgroundColor: color }}>Mapped</span>}
                </button>
              );
            })}
            {targets.length === 0 && <p className="py-8 text-center text-[12px] text-slate-400">No OTA rooms loaded yet.</p>}
          </div>
        </div>

      </div>

      {ghost && (
        <div
          className="pointer-events-none fixed z-[9999] rotate-3 border border-sky-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-900 opacity-95 shadow-xl shadow-slate-900/15"
          style={{ left: ghost.x + 12, top: ghost.y - 20 }}
        >
          {ghost.title}
        </div>
      )}
    </div>
  );
}

function RateConnectorMapper({
  brand,
  connection,
  workspace,
}: {
  brand: OtaBrand;
  connection: RoomConnectorConnection;
  workspace: ChannelWorkspace;
}) {
  const midRef = useRef<HTMLDivElement | null>(null);
  const [dragRateId, setDragRateId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ title: string; x: number; y: number } | null>(null);
  const [hoverTargetKey, setHoverTargetKey] = useState<string | null>(null);
  const [lines, setLines] = useState<ConnectorLine[]>([]);
  const [editMode, setEditMode] = useState(false);

  const roomMappingByCategory = useMemo(
    () => new Map(connection.room_mappings.map(mapping => [mapping.room_category_id, mapping])),
    [connection.room_mappings],
  );
  const roomMappingByExternalRoomId = useMemo(
    () => new Map(connection.room_mappings.map(mapping => [mapping.external_room_id, mapping])),
    [connection.room_mappings],
  );
  const savedByRatePlan = useMemo(
    () => new Map(connection.rate_mappings.map(mapping => [mapping.rate_plan_id, mapping])),
    [connection.rate_mappings],
  );
  const [draftMatches, setDraftMatches] = useState<Record<string, { externalRoomId: string; externalRateId: string }>>(() =>
    Object.fromEntries(connection.rate_mappings.map(mapping => [
      mapping.rate_plan_id,
      { externalRoomId: mapping.external_room_id ?? '', externalRateId: mapping.external_rate_id },
    ])),
  );

  useEffect(() => {
    setDraftMatches(Object.fromEntries(connection.rate_mappings.map(mapping => [
      mapping.rate_plan_id,
      { externalRoomId: mapping.external_room_id ?? '', externalRateId: mapping.external_rate_id },
    ])));
  }, [connection.rate_mappings]);

  const draftEntries = useMemo(() => Object.entries(draftMatches), [draftMatches]);
  const eligibleRatePlans = useMemo(
    () => workspace.scopedRatePlans.filter(ratePlan => roomMappingByCategory.has(ratePlan.room_category_id)),
    [roomMappingByCategory, workspace.scopedRatePlans],
  );
  const ratePlanOrderById = useMemo(
    () => new Map(eligibleRatePlans.map((ratePlan, index) => [ratePlan.id, index])),
    [eligibleRatePlans],
  );
  const mappedRatePlanIndexByTargetKey = useMemo(
    () => new Map(draftEntries.map(([ratePlanId, target]) => [`${target.externalRoomId}:${target.externalRateId}`, ratePlanOrderById.get(ratePlanId) ?? 0])),
    [draftEntries, ratePlanOrderById],
  );
  const rateTargets = useMemo(() => {
    const mappedRoomIds = new Set(connection.room_mappings.map(mapping => mapping.external_room_id));
    const byKey = new Map(
      workspace.catalogRates
        .filter(rate => rate.external_room_id && mappedRoomIds.has(rate.external_room_id))
        .map(rate => [`${rate.external_room_id}:${rate.external_rate_id}`, rate]),
    );
    for (const mapping of connection.rate_mappings) {
      if (!mapping.external_room_id || !mappedRoomIds.has(mapping.external_room_id)) continue;
      const key = `${mapping.external_room_id}:${mapping.external_rate_id}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          external_room_id: mapping.external_room_id,
          external_rate_id: mapping.external_rate_id,
          external_rate_name: mapping.external_rate_name ?? mapping.rate_plan.name,
        });
      }
    }
    const savedTargetOrder = new Map<string, number>(
      draftEntries.flatMap(([ratePlanId, target]) => {
        const saved = savedByRatePlan.get(ratePlanId);
        return saved?.external_room_id === target.externalRoomId && saved.external_rate_id === target.externalRateId
          ? [[`${target.externalRoomId}:${target.externalRateId}`, ratePlanOrderById.get(ratePlanId) ?? Number.MAX_SAFE_INTEGER] as const]
          : [];
      }),
    );

    return Array.from(byKey.values())
      .map((target, index) => ({ target, index, key: `${target.external_room_id}:${target.external_rate_id}` }))
      .sort((a, b) => {
        const orderA = savedTargetOrder.get(a.key);
        const orderB = savedTargetOrder.get(b.key);
        if (orderA != null && orderB != null) return orderA - orderB;
        if (orderA != null) return -1;
        if (orderB != null) return 1;
        return a.index - b.index;
      })
      .map(({ target }) => target);
  }, [connection.rate_mappings, connection.room_mappings, draftEntries, ratePlanOrderById, savedByRatePlan, workspace.catalogRates]);
  const mappedTargetKeys = useMemo(
    () => new Set(draftEntries.map(([, target]) => `${target.externalRoomId}:${target.externalRateId}`)),
    [draftEntries],
  );
  const unsavedRateMappings = draftEntries
    .filter(([ratePlanId, target]) => {
      const saved = savedByRatePlan.get(ratePlanId);
      return saved?.external_room_id !== target.externalRoomId || saved.external_rate_id !== target.externalRateId;
    })
    .filter(([ratePlanId]) => !savedByRatePlan.has(ratePlanId))
    .map(([ratePlanId, target]) => ({ ratePlanId, externalRoomId: target.externalRoomId, externalRateId: target.externalRateId }));
  const changedRateMappings = draftEntries
    .map(([ratePlanId, target]) => {
      const saved = savedByRatePlan.get(ratePlanId);
      return saved && (saved.external_room_id !== target.externalRoomId || saved.external_rate_id !== target.externalRateId)
        ? { mappingId: saved.id, externalRoomId: target.externalRoomId, externalRateId: target.externalRateId }
        : null;
    })
    .filter((mapping): mapping is { mappingId: string; externalRoomId: string; externalRateId: string } => mapping != null);
  const hasSavedRemapDraft = draftEntries.some(([ratePlanId, target]) => {
    const saved = savedByRatePlan.get(ratePlanId);
    return Boolean(saved && (saved.external_room_id !== target.externalRoomId || saved.external_rate_id !== target.externalRateId));
  });
  const canMap = workspace.canMap && workspace.pendingAction !== 'create-rate-mapping';
  const saveSlot = typeof document === 'undefined' ? null : document.getElementById(rateMappingSaveSlotId);
  const hasRateChanges = unsavedRateMappings.length > 0 || changedRateMappings.length > 0;

  async function saveRateChanges() {
    if (unsavedRateMappings.length > 0) await workspace.saveRateMappingsBatch(unsavedRateMappings);
    for (const mapping of changedRateMappings) {
      await workspace.updateRateMapping(mapping.mappingId, { externalRoomId: mapping.externalRoomId, externalRateId: mapping.externalRateId });
    }
    setEditMode(false);
  }

  const drawLines = useCallback(() => {
    const mid = midRef.current;
    if (!mid) return;
    const midBox = mid.getBoundingClientRect();
    const nextLines = draftEntries.flatMap(([ratePlanId, target], index) => {
      const leftDot = document.getElementById(roomConnectorId('hms-rate-dot', ratePlanId));
      const rightDot = document.getElementById(roomConnectorId('ota-rate-dot', `${target.externalRoomId}-${target.externalRateId}`));
      if (!leftDot || !rightDot) return [];
      const leftBox = leftDot.getBoundingClientRect();
      const rightBox = rightDot.getBoundingClientRect();
      const x1 = leftBox.left + leftBox.width / 2 - midBox.left + connectorEndpointGap;
      const y1 = leftBox.top + leftBox.height / 2 - midBox.top;
      const x2 = rightBox.left + rightBox.width / 2 - midBox.left - connectorEndpointGap;
      const y2 = rightBox.top + rightBox.height / 2 - midBox.top;
      const cx = (x1 + x2) / 2;
      const saved = savedByRatePlan.get(ratePlanId);
      const isSaved = Boolean(saved && saved.external_room_id === target.externalRoomId && saved.external_rate_id === target.externalRateId);
      const colorIndex = ratePlanOrderById.get(ratePlanId) ?? index;
      return [{
        color: connectorColors[colorIndex % connectorColors.length],
        d: isSaved ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`,
        id: `${ratePlanId}:${target.externalRoomId}:${target.externalRateId}`,
      }];
    });
    setLines(nextLines);
  }, [draftEntries, ratePlanOrderById, savedByRatePlan]);

  useEffect(() => {
    const raf = requestAnimationFrame(drawLines);
    const settleTimer = window.setTimeout(drawLines, 80);
    window.addEventListener('resize', drawLines);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', drawLines);
    };
  }, [drawLines, eligibleRatePlans.length, rateTargets.length]);

  const findTargetAtPoint = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    const target = element?.closest<HTMLElement>('[data-ota-rate-key]');
    return target ? {
      key: target.dataset.otaRateKey ?? '',
      externalRoomId: target.dataset.otaRoomId ?? '',
      externalRateId: target.dataset.otaRateId ?? '',
    } : null;
  };

  const startDrag = (ratePlanId: string, title: string, event: ReactMouseEvent | ReactTouchEvent) => {
    const saved = savedByRatePlan.has(ratePlanId);
    if (saved && !editMode) return;
    if (!saved && !canMap) return;
    event.preventDefault();
    const point = pointerPoint(event);
    setDragRateId(ratePlanId);
    setGhost({ title, x: point.x, y: point.y });
  };

  useEffect(() => {
    if (!dragRateId) return;
    const move = (event: MouseEvent | TouchEvent) => {
      event.preventDefault();
      const point = pointerPoint(event);
      setGhost(current => current ? { ...current, x: point.x, y: point.y } : current);
      setHoverTargetKey(findTargetAtPoint(point.x, point.y)?.key ?? null);
    };
    const up = (event: MouseEvent | TouchEvent) => {
      const point = pointerPoint(event);
      const target = findTargetAtPoint(point.x, point.y);
      const ratePlan = workspace.scopedRatePlans.find(plan => plan.id === dragRateId);
      const roomMapping = ratePlan ? roomMappingByCategory.get(ratePlan.room_category_id) : null;
      if (target && roomMapping?.external_room_id === target.externalRoomId) {
        setDraftMatches(current => {
          const next = Object.fromEntries(Object.entries(current).filter(([, value]) => `${value.externalRoomId}:${value.externalRateId}` !== target.key));
          next[dragRateId] = { externalRoomId: target.externalRoomId, externalRateId: target.externalRateId };
          return next;
        });
      }
      setDragRateId(null);
      setGhost(null);
      setHoverTargetKey(null);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
    };
  }, [dragRateId, roomMappingByCategory, workspace.scopedRatePlans]);

  return (
    <div className="pt-1">
      {connection.room_mappings.length === 0 && (
        <div className="mb-4 border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-medium text-amber-800">
          Save room mappings before mapping rates.
        </div>
      )}
      {hasSavedRemapDraft && (
        <div className="mb-4 border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-medium text-amber-800">
          Saved rate mapping changes are staged. Save changes or cancel edit mode before adding more mappings.
        </div>
      )}
      {saveSlot && createPortal(
        <span className="flex items-center gap-1.5">
          {editMode ? (
            <button
              type="button"
              onClick={() => { setEditMode(false); setDraftMatches(Object.fromEntries(connection.rate_mappings.map(mapping => [mapping.rate_plan_id, { externalRoomId: mapping.external_room_id ?? '', externalRateId: mapping.external_rate_id }]))); }}
              className="inline-flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="inline-flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => void saveRateChanges()}
            disabled={!hasRateChanges || (!editMode && hasSavedRemapDraft) || workspace.pendingAction === 'create-rate-mapping' || workspace.pendingAction === 'update-rate-mapping'}
            className="inline-flex h-7 items-center justify-center rounded-md bg-emerald-600 px-3 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {workspace.pendingAction === 'create-rate-mapping' || workspace.pendingAction === 'update-rate-mapping' ? 'Saving...' : `Save${hasRateChanges ? ` (${unsavedRateMappings.length + changedRateMappings.length})` : ''}`}
          </button>
        </span>,
        saveSlot,
      )}

      <div className="mt-3 grid grid-cols-1 gap-5 px-4 lg:px-8 lg:grid-cols-[minmax(0,0.95fr)_4rem_minmax(0,0.95fr)]">
        <div className="min-w-0 lg:pr-5">
          <p className="mb-4 max-w-[22rem] px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">HMS rate plans</p>
          <div className="space-y-2 px-1 lg:max-w-[22rem]">
            {eligibleRatePlans.map((ratePlan, index) => {
              const target = draftMatches[ratePlan.id];
              const saved = savedByRatePlan.get(ratePlan.id);
              const matched = Boolean(target);
              const isSaved = Boolean(saved && saved.external_room_id === target?.externalRoomId && saved.external_rate_id === target?.externalRateId);
              const color = connectorColors[index % connectorColors.length];
              return (
                <button
                  key={ratePlan.id}
                  type="button"
                  onMouseDown={event => startDrag(ratePlan.id, ratePlan.name, event)}
                  onTouchStart={event => startDrag(ratePlan.id, ratePlan.name, event)}
                  className={`relative w-full cursor-grab select-none border bg-white px-3.5 py-2.5 text-left shadow-sm transition active:cursor-grabbing ${dragRateId === ratePlan.id ? 'scale-[0.98] opacity-50' : 'hover:-translate-y-0.5'} ${matched ? 'bg-white' : 'border-slate-200 hover:border-slate-400'}`}
                  style={matched ? { borderColor: color, boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                >
                  <span id={roomConnectorId('hms-rate-dot', ratePlan.id)} className="absolute -right-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 bg-white" style={matched ? { backgroundColor: color, borderColor: color } : { borderColor: '#cbd5e1' }} />
                  <span className="block pr-7 text-[13px] font-semibold text-slate-900">{ratePlan.name}</span>
                  <span className="mt-1 inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                    {ratePlan.room_category.name}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-slate-500">{ratePlan.code} · {ratePlan.currency} {ratePlan.base_rate}</span>
                  {matched && <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm" style={{ backgroundColor: color }}>{isSaved ? 'Mapped' : 'Draft'}</span>}
                </button>
              );
            })}
            {eligibleRatePlans.length === 0 && <p className="py-8 text-center text-[12px] text-slate-400">No rate plans unlocked yet.</p>}
          </div>
        </div>
        <div ref={midRef} className="relative hidden min-h-[15rem] items-center justify-center lg:flex">
          <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <defs>
              <marker id="rate-map-arrow" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="currentColor" opacity="0.4" />
              </marker>
            </defs>
            {lines.map(line => (
              <path
                key={line.id}
                d={line.d}
                fill="none"
                markerEnd="url(#rate-map-arrow)"
                opacity="0.85"
                stroke={line.color}
                strokeLinecap="round"
                strokeWidth="2"
              />
            ))}
          </svg>
          <div className="rotate-180 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-300 [writing-mode:vertical-rl]">drop zone</div>
        </div>
        <div className="min-w-0 lg:pl-5">
          <p className="mb-4 px-1 text-[10px] font-bold uppercase tracking-widest lg:ml-auto lg:max-w-[22rem]" style={{ color: brand.color }}>OTA rate targets</p>
          <div className="space-y-2 pl-1 lg:ml-auto lg:max-w-[22rem]">
            {rateTargets.map((target, index) => {
              const key = `${target.external_room_id}:${target.external_rate_id}`;
              const matched = mappedTargetKeys.has(key);
              const mappedRoom = target.external_room_id ? roomMappingByExternalRoomId.get(target.external_room_id) : null;
              const draggedRatePlan = dragRateId ? workspace.scopedRatePlans.find(plan => plan.id === dragRateId) : null;
              const compatible = !draggedRatePlan || mappedRoom?.room_category_id === draggedRatePlan.room_category_id;
              const hover = hoverTargetKey === key && dragRateId && !matched && compatible;
              const incompatibleHover = hoverTargetKey === key && dragRateId && !matched && !compatible;
              const colorIndex = mappedRatePlanIndexByTargetKey.get(key) ?? index;
              const color = connectorColors[colorIndex % connectorColors.length];
              return (
                <button
                  key={key}
                  type="button"
                  data-ota-rate-key={key}
                  data-ota-room-id={target.external_room_id ?? ''}
                  data-ota-rate-id={target.external_rate_id}
                  className={`relative w-full border bg-white px-3.5 py-2.5 text-left transition ${hover ? 'scale-[1.01] border-amber-300 bg-amber-50' : incompatibleHover ? 'border-rose-200 bg-rose-50' : matched ? 'bg-white shadow-sm' : 'border-slate-200 hover:border-slate-400'}`}
                  style={matched ? { borderColor: color, boxShadow: `inset -3px 0 0 ${color}` } : undefined}
                >
                  <span id={roomConnectorId('ota-rate-dot', `${target.external_room_id}-${target.external_rate_id}`)} className="absolute -left-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 bg-white" style={matched ? { backgroundColor: color, borderColor: color } : { borderColor: hover ? '#f59e0b' : '#cbd5e1' }} />
                  <span className="block pr-7 text-[13px] font-semibold text-slate-900">{target.external_rate_name ?? 'Provider rate'}</span>
                  <span className={`mt-1 inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${mappedRoom ? 'bg-slate-100 text-slate-500' : 'bg-rose-50 text-rose-600'}`}>
                    {mappedRoom ? `Maps to ${mappedRoom.room_category.name}` : 'Room not mapped'}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-slate-500">{target.external_room_id} / {target.external_rate_id}</span>
                  {incompatibleHover && (
                    <span className="mt-1 block text-[10.5px] font-semibold text-rose-600">
                      Select a {mappedRoom?.room_category.name ?? 'matching room'} HMS rate plan
                    </span>
                  )}
                  {matched && <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm" style={{ backgroundColor: color }}>Mapped</span>}
                </button>
              );
            })}
            {rateTargets.length === 0 && <p className="py-8 text-center text-[12px] text-slate-400">No OTA rate targets loaded for mapped rooms.</p>}
          </div>
        </div>
      </div>
      {ghost && (
        <div className="pointer-events-none fixed z-[9999] rotate-3 border border-amber-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-900 opacity-95 shadow-xl shadow-slate-900/15" style={{ left: ghost.x + 12, top: ghost.y - 20 }}>
          {ghost.title}
        </div>
      )}
    </div>
  );
}

function OtaConnectionSetup({
  workspace,
  onCancel,
}: {
  workspace: ChannelWorkspace;
  onCancel?: () => void;
}) {
  const selectedOtaLabel =
    workspace.zodomusOtaOptions.find(option => option.key === workspace.zodomusOtaKey)?.label ?? 'OTA';

  return (
    <form
      onSubmit={workspace.createConnection}
      className="bg-white border border-black/[0.08] rounded-2xl shadow-sm p-5"
    >
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-1">New OTA connection</p>
          <h3 className="text-[16px] font-bold text-slate-900">Connect {selectedOtaLabel}</h3>
          <p className="text-[12px] text-slate-500 mt-1">Create the channel link first, then continue with catalog loading and mappings.</p>
        </div>
        {onCancel && (
          <button type="button" className={secondaryBtn} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <label className={labelCls}>
          <span>Hotel property</span>
          <CustomSelect
            onChange={workspace.setPropertyId}
            options={workspace.properties.map(property => ({ label: property.name, value: property.id }))}
            placeholder="Select property"
            value={workspace.propertyId}
          />
        </label>
        <label className={labelCls}>
          <span>OTA</span>
          <CustomSelect
            onChange={value => workspace.setZodomusOtaKey(value as typeof workspace.zodomusOtaKey)}
            options={workspace.zodomusOtaOptions.map(option => ({ label: option.label, value: option.key }))}
            value={workspace.zodomusOtaKey}
          />
        </label>
        <label className={labelCls}>
          <span>Price model</span>
          <CustomSelect
            onChange={workspace.setZodomusPriceModelId}
            options={workspace.priceModelOptions.map(model => ({ label: `${model.id} - ${model.model}`, value: String(model.id) }))}
            value={workspace.zodomusPriceModelId}
          />
        </label>
        <label className={labelCls}>
          <span>Zodomus property ID</span>
          <input
            className={inputCls}
            onChange={event => workspace.setZodomusPropertyId(event.target.value)}
            placeholder="999999"
            required
            value={workspace.zodomusPropertyId}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button
          className={primaryBtn}
          disabled={!workspace.propertyId || workspace.pendingAction === 'create-connection'}
          type="submit"
        >
          {workspace.pendingAction === 'create-connection' ? 'Saving...' : 'Save connection'}
        </button>
        <span className="text-[12px] text-slate-400">Use the Zodomus property ID for this OTA. Booking.com and Airbnb IDs are not interchangeable.</span>
      </div>
    </form>
  );
}

/* ─── Inline panel tab types ─── */
type PanelTab = 'mappings' | 'logs';
type PropertySetupDrawerTab = 'property' | 'rooms';
const expandedOtaCardStorageKey = 'hms_ota_mapping_expanded_connection_id';

function FloatingSuccessToast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="pointer-events-none fixed left-4 right-4 top-16 z-50 flex justify-center lg:left-auto lg:right-6 lg:justify-end">
      <div className="w-full max-w-md shadow-2xl shadow-emerald-950/10">
        <SuccessMsg>{message}</SuccessMsg>
      </div>
    </div>
  );
}

function PropertySetupDrawer({
  activeTab,
  onClose,
  onConfigureOta,
  onTabChange,
}: {
  activeTab: PropertySetupDrawerTab;
  onClose: () => void;
  onConfigureOta: () => void;
  onTabChange: (tab: PropertySetupDrawerTab) => void;
}) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const tabs: Array<{ id: PropertySetupDrawerTab; label: string; description: string }> = [
    { id: 'property', label: 'Property setup', description: 'Profile, rates & media' },
    { id: 'rooms', label: 'Rooms', description: 'Physical inventory' },
  ];
  const contentClassName = activeTab === 'property'
    ? 'min-h-0 flex-1 overflow-hidden bg-[#f5f5f3]'
    : 'min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f5f5f3]';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
      <button
        aria-label="Close property setup"
        className="hidden flex-1 cursor-default md:block"
        onClick={onClose}
        type="button"
      />
      <aside className="flex h-full w-full max-w-[1640px] flex-col overflow-hidden border-l border-black/[0.06] bg-white shadow-2xl shadow-slate-950/20 md:w-[min(1640px,calc(100vw-0.5rem))]">
        <div className="flex flex-shrink-0 items-center gap-4 border-b border-slate-100 bg-white px-5 py-3 lg:px-6">
          <div className="min-w-0 flex-shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600">OTA onboarding</p>
            <h2 className="mt-0.5 text-[15px] font-bold tracking-tight text-slate-900">Add property</h2>
          </div>

          <div className="flex min-w-0 flex-1 justify-center">
            <div className="relative grid w-full max-w-xl grid-cols-2">
              <div className="absolute left-[25%] right-[25%] top-4 h-px bg-slate-200" />
              {activeTab === 'rooms' && (
                <div className="absolute left-[25%] right-[50%] top-4 h-px bg-emerald-500" />
              )}
              {tabs.map((tab, index) => {
                const selected = activeTab === tab.id;
                const completed = tab.id === 'property' && activeTab === 'rooms';
                return (
                  <button
                    key={tab.id}
                    className="relative flex min-w-0 flex-col items-center px-3 pb-0.5 text-center"
                    onClick={() => onTabChange(tab.id)}
                    type="button"
                  >
                    <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-[11px] font-bold transition ${
                      selected
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : completed
                          ? 'border-emerald-500 bg-white text-emerald-600'
                          : 'border-slate-200 bg-white text-slate-400'
                    }`}>
                      {completed ? (
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path d="m5 12 4 4L19 6" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="mt-1.5 min-w-0">
                      <span className={`block truncate text-[12px] font-bold ${selected || completed ? 'text-slate-900' : 'text-slate-500'}`}>{tab.label}</span>
                      <span className="hidden truncate text-[10px] font-medium text-slate-400 sm:block">{tab.description}</span>
                    </span>
                    <span className={`mt-1.5 h-0.5 w-12 rounded-full ${selected ? 'bg-emerald-500' : 'bg-transparent'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <button
            aria-label="Close"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className={contentClassName}>
          {activeTab === 'property' && (
            <PropertySetupPage
              controlledSelectedPropertyId={selectedPropertyId}
              embedded
              onAddRooms={() => onTabChange('rooms')}
              onConfigureOta={onConfigureOta}
              onSelectedPropertyIdChange={setSelectedPropertyId}
            />
          )}
          {activeTab === 'rooms' && (
            <RoomsPage embedded propertyId={selectedPropertyId} />
          )}
        </div>
      </aside>
    </div>
  );
}

function readPersistedExpandedOtaCardId() {
  try {
    return localStorage.getItem(expandedOtaCardStorageKey);
  } catch {
    return null;
  }
}

function persistExpandedOtaCardId(connectionId: string | null) {
  try {
    if (connectionId) {
      localStorage.setItem(expandedOtaCardStorageKey, connectionId);
      return;
    }

    localStorage.removeItem(expandedOtaCardStorageKey);
  } catch {
    // Keep navigation usable when storage is unavailable.
  }
}

/* ══════════════════════════════════════════════════════════
   INLINE PANEL — expands below the card when clicked
══════════════════════════════════════════════════════════ */
function InlinePanel({
  workspace,
  connectionId,
  onClose,
  onOpenWorkspace,
}: {
  workspace: ChannelWorkspace;
  connectionId: string;
  onClose: () => void;
  onOpenWorkspace: (id: string) => void;
}) {
  const [tab, setTab] = useState<PanelTab>('mappings');

  const conn = workspace.zodomusConnections.find(c => c.id === connectionId);
  if (!conn) return null;

  const otaName = conn.provider_config_summary?.ota_name ?? conn.provider;
  const brand = otaBrand(otaName);
  const ready = Boolean(conn.provider_config_summary?.setup_status?.ready);
  const autoSaved = Boolean(conn.provider_config_summary?.automation?.enabled);
  const canSync = Boolean(ready && autoSaved);
  const isSelected = workspace.selectedConnection?.id === connectionId;

  const ensureSelected = () => { if (!isSelected) workspace.selectConnection(connectionId); };
  const syncInventory = () => { ensureSelected(); void workspace.runInventorySync(); };
  const syncRates = () => { ensureSelected(); void workspace.runRatesSync(); };
  const refreshLogs = () => { ensureSelected(); void workspace.loadSyncLogs(connectionId); };

  return (
    <div className="bg-white border border-black/[0.08] rounded-2xl overflow-hidden shadow-md">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: `linear-gradient(135deg, ${brand.bg} 0%, white 60%)` }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0 shadow-sm border border-white/60"
          style={{ backgroundColor: brand.bg, color: brand.color }}>
          {brand.abbr}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-bold text-slate-900">{otaName}</p>
            <StatusBadge status={conn.status} />
            {ready && <span className="text-[9px] font-bold bg-teal-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">Ready ✓</span>}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {conn.property.name} &nbsp;·&nbsp; {conn.room_mappings.length} rooms &nbsp;·&nbsp; {conn.rate_mappings.length} rates
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => onOpenWorkspace(connectionId)}
            className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold bg-white/80 hover:bg-white border border-slate-200 text-slate-700 transition-colors shadow-sm"
          >
            Full workspace <span className="text-slate-400">→</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-white/70 text-lg transition-colors"
          >
            ×
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-black/[0.06] bg-slate-50/50 px-5">
        {(['mappings', 'logs'] as PanelTab[]).map(t => {
          const labels: Record<PanelTab, string> = { mappings: 'Mappings', logs: 'Logs' };
          const counts: Partial<Record<PanelTab, number>> = {
            mappings: conn.room_mappings.length + conn.rate_mappings.length,
            logs: workspace.syncLogs.length > 0 ? workspace.syncLogs.length : undefined,
          };
          const count = counts[t];
          return (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-3 text-[12px] border-b-2 -mb-px transition-colors font-medium
                ${tab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              {labels[t]}
              {count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full leading-none border font-semibold
                  ${tab === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-200 text-slate-500 border-transparent'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── MAPPINGS TAB ── */}
      {tab === 'mappings' && (
        <div className="p-5 space-y-4">
          {!canSync && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <span className="text-amber-400 mt-0.5">⚠</span>
              <p className="text-[11.5px] text-amber-800">
                {!ready ? 'Run property check until setup is ready.' : 'Enable automation in the full workspace to unlock sync.'}
              </p>
            </div>
          )}
          {workspace.loading && <LoadingMsg>Working…</LoadingMsg>}
          {workspace.error && isSelected && <ErrorMsg>{workspace.error}</ErrorMsg>}
          {isSelected && <FloatingSuccessToast message={workspace.status} />}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Rooms</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{conn.room_mappings.length} mapped</p>
                </div>
                <button
                  type="button"
                  onClick={syncInventory}
                  disabled={!canSync || workspace.pendingAction === 'inventory-sync'}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {workspace.pendingAction === 'inventory-sync' ? 'Syncing…' : 'Sync inventory'}
                </button>
              </div>
              {conn.room_mappings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center">
                  <p className="text-[12px] text-slate-400">No room mappings yet</p>
                  <p className="text-[10px] text-slate-300 mt-0.5">Open full workspace to map</p>
                </div>
              ) : (
                <div className="rounded-xl border border-black/[0.06] overflow-hidden">
                  <table className="w-full" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr className="bg-slate-50 border-b border-black/[0.06]">
                        <th className="px-3 py-2 text-left text-[9.5px] font-bold uppercase tracking-wider text-slate-400 w-[55%]">HMS room</th>
                        <th className="px-3 py-2 text-left text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Provider ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conn.room_mappings.map(m => (
                        <tr key={m.id} className="border-b border-black/[0.04] last:border-0 hover:bg-slate-50/60">
                          <td className="px-3 py-2 text-[11.5px] font-medium text-slate-800 overflow-hidden text-ellipsis whitespace-nowrap">
                            {m.room_category.name} ({m.room_category.code})
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">{m.external_room_id}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Rates</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{conn.rate_mappings.length} mapped</p>
                </div>
                <button
                  type="button"
                  onClick={syncRates}
                  disabled={!canSync || workspace.pendingAction === 'rates-sync'}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {workspace.pendingAction === 'rates-sync' ? 'Syncing…' : 'Sync rates'}
                </button>
              </div>
              {conn.rate_mappings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center">
                  <p className="text-[12px] text-slate-400">No rate mappings yet</p>
                  <p className="text-[10px] text-slate-300 mt-0.5">Open full workspace to map</p>
                </div>
              ) : (
                <div className="rounded-xl border border-black/[0.06] overflow-hidden">
                  <table className="w-full" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr className="bg-slate-50 border-b border-black/[0.06]">
                        <th className="px-3 py-2 text-left text-[9.5px] font-bold uppercase tracking-wider text-slate-400 w-[55%]">HMS rate plan</th>
                        <th className="px-3 py-2 text-left text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Provider ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conn.rate_mappings.map(m => (
                        <tr key={m.id} className="border-b border-black/[0.04] last:border-0 hover:bg-slate-50/60">
                          <td className="px-3 py-2 text-[11.5px] font-medium text-slate-800 overflow-hidden text-ellipsis whitespace-nowrap">
                            {m.rate_plan.name} ({m.rate_plan.code})
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                              {m.external_room_id ? `${m.external_room_id}/${m.external_rate_id}` : m.external_rate_id}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── LOGS TAB ── */}
      {tab === 'logs' && (
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-slate-400 font-medium">Recent sync history · {otaName}</p>
            <button type="button" onClick={refreshLogs} disabled={workspace.syncLogsLoading}
              className="text-[11px] text-slate-400 hover:text-slate-700 font-semibold flex items-center gap-1">
              {workspace.syncLogsLoading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
          {workspace.syncLogsError && <ErrorMsg>{workspace.syncLogsError}</ErrorMsg>}
          <div className="rounded-xl border border-black/[0.06] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-black/[0.06]">
                  {['Type', 'Status', 'Timestamp', 'Error'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workspace.syncLogs.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-[12px] text-slate-400">No sync logs yet — press Refresh to load.</td></tr>
                ) : (
                  workspace.syncLogs.slice(0, 20).map(log => (
                    <tr key={log.id} className="border-b border-black/[0.04] last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2 text-[12px] font-medium text-slate-700">{log.sync_type}</td>
                      <td className="px-3 py-2"><LogStatusBadge status={log.status} /></td>
                      <td className="px-3 py-2 text-[11px] text-slate-500">{log.created_at ? formatDateTime(log.created_at) : '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-slate-400 truncate max-w-[140px]">{log.error_message ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export function OtaMappingPage({
  workspace,
  onFullWorkspaceChange,
}: {
  workspace: ChannelWorkspace;
  onFullWorkspaceChange?: (open: boolean) => void;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(() => readPersistedExpandedOtaCardId());
  const [setupOtaKey, setSetupOtaKey] = useState<ChannelWorkspace['zodomusOtaKey'] | null>(null);
  const [eventConfirm, setEventConfirm] = useState(false);
  const [backfillConfirm, setBackfillConfirm] = useState(false);
  const [roomsCancelConfirm, setRoomsCancelConfirm] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [removeChoiceIds, setRemoveChoiceIds] = useState<string[]>([]);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [propertySetupDrawerOpen, setPropertySetupDrawerOpen] = useState(false);
  const [propertySetupDrawerTab, setPropertySetupDrawerTab] = useState<PropertySetupDrawerTab>('property');

  const conn = workspace.selectedConnection;
  const setup = workspace.persistedSetupStatus;
  const connectionReady = Boolean(setup?.ready);
  const automationSaved = Boolean(conn?.provider_config_summary?.automation?.enabled);
  const canApplyAuto = Boolean(conn && connectionReady);
  const canUseResTools = Boolean(conn && connectionReady && automationSaved);
  const catLoaded = Boolean(setup?.catalog_loaded) || workspace.canMap;
  const isAirbnb = Boolean(
    conn?.provider_config_summary?.channel_id === '3' ||
    conn?.provider_config_summary?.ota_name?.toLowerCase().includes('airbnb'),
  );
  const autoBlocker = !conn ? 'Select a connection first.'
    : !connectionReady ? 'Run property check until setup status is ready.'
      : 'Ready to save automation.';
  const resBlocker = !conn ? 'Select a connection first.'
    : !connectionReady ? 'Connection must be ready first.'
      : !automationSaved ? 'Apply automation first before webhook testing.'
        : 'Ready for reservation testing.';

  const totalRooms = workspace.zodomusConnections.reduce((t, c) => t + c.room_mappings.length, 0);
  const totalRates = workspace.zodomusConnections.reduce((t, c) => t + c.rate_mappings.length, 0);

  /* ── Build card list ── */
  const matchedIds = new Set<string>();
  const channelCards = workspace.zodomusOtaOptions.map(option => {
    const connection = workspace.zodomusConnections.find(c => {
      if (matchedIds.has(c.id)) return false;
      const otaName = c.provider_config_summary?.ota_name ?? (c as unknown as { name?: string }).name ?? c.provider;
      return matchesOtaOption(otaName, option.label);
    }) ?? null;
    if (connection) matchedIds.add(connection.id);
    return { key: option.key, label: option.label, connection };
  });
  const extraCards = workspace.zodomusConnections
    .filter(c => !matchedIds.has(c.id))
    .map(c => ({ key: c.id, label: c.provider_config_summary?.ota_name ?? c.provider, connection: c }));
  const allCards = [...channelCards, ...extraCards];
  const removeTarget = workspace.zodomusConnections.find(c => c.id === removeTargetId) ?? null;
  const mappedExternalRoomIds = Array.from(new Set(conn?.room_mappings.map(mapping => mapping.external_room_id).filter(Boolean) ?? []));

  useEffect(() => {
    onFullWorkspaceChange?.(Boolean(detailId));
  }, [detailId, onFullWorkspaceChange]);

  useEffect(() => () => onFullWorkspaceChange?.(false), [onFullWorkspaceChange]);

  useEffect(() => {
    if (!setupOtaKey || !workspace.selectedConnection) return;

    setSetupOtaKey(null);
    setExpandedId(workspace.selectedConnection.id);
  }, [setupOtaKey, workspace.selectedConnection]);

  const openConnectionSetup = (otaKey: ChannelWorkspace['zodomusOtaKey']) => {
    workspace.setZodomusOtaKey(otaKey);
    workspace.selectConnection('');
    setExpandedId(null);
    persistExpandedOtaCardId(null);
    setSetupOtaKey(otaKey);
  };

  const openPropertySetupDrawer = (tab: PropertySetupDrawerTab = 'property') => {
    setPropertySetupDrawerTab(tab);
    setPropertySetupDrawerOpen(true);
  };

  const closePropertySetupDrawer = () => {
    setPropertySetupDrawerOpen(false);
  };

  const getConnectionOtaKey = (
    connection: (typeof workspace.zodomusConnections)[number] | null | undefined,
  ): ChannelWorkspace['zodomusOtaKey'] => {
    if (!connection) return workspace.zodomusOtaKey;

    const otaName = connection.provider_config_summary?.ota_name ?? (connection as unknown as { name?: string }).name ?? connection.provider;
    return workspace.zodomusOtaOptions.find(option => matchesOtaOption(otaName, option.label))?.key ?? workspace.zodomusOtaKey;
  };

  const handleCardClick = (connectionId: string) => {
    setSetupOtaKey(null);
    if (expandedId === connectionId) {
      setExpandedId(null);
      persistExpandedOtaCardId(null);
      return;
    }
    const connection = workspace.zodomusConnections.find(c => c.id === connectionId);
    workspace.setZodomusOtaKey(getConnectionOtaKey(connection));
    workspace.selectConnection(connectionId);
    void workspace.loadSyncLogs(connectionId);
    setExpandedId(connectionId);
    persistExpandedOtaCardId(connectionId);
  };

  const getCardConnections = (card: (typeof allCards)[number]) => {
    if (!card.connection) return [];
    const cardOtaName = card.connection.provider_config_summary?.ota_name ?? card.label;
    return workspace.zodomusConnections.filter(connection => {
      const connectionOtaName = connection.provider_config_summary?.ota_name ?? connection.provider;
      return matchesOtaOption(connectionOtaName, card.label) || matchesOtaOption(connectionOtaName, cardOtaName);
    });
  };

  const beginRemoveConnection = () => {
    setSetupOtaKey(null);
    setExpandedId(null);
    persistExpandedOtaCardId(null);
    setRemoveChoiceIds([]);
    setRemoveTargetId(null);
    setRemoveMode(true);
  };

  const cancelRemoveConnection = () => {
    setRemoveMode(false);
    setRemoveChoiceIds([]);
    setRemoveTargetId(null);
  };

  const chooseCardForRemoval = (card: (typeof allCards)[number]) => {
    const candidates = getCardConnections(card);
    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      setRemoveTargetId(candidates[0].id);
      return;
    }
    setRemoveChoiceIds(candidates.map(connection => connection.id));
  };

  const openWorkspace = (id: string) => {
    workspace.selectConnection(id);
    setDetailId(id);
    setExpandedId(id);
    persistExpandedOtaCardId(id);
  };

  const closeWorkspace = () => {
    setDetailId(null);
  };

  /* ══ WORKSPACE VIEW (Level 2) ══════════════════════════════ */
  if (detailId) {
    if (!conn) return (
      <div className="flex items-center justify-center py-24">
        <LoadingMsg>Loading connection…</LoadingMsg>
      </div>
    );

    const otaName = conn.provider_config_summary?.ota_name ?? conn.provider;
    const channelId = conn.provider_config_summary?.channel_id;
    const brand = otaBrand(otaName);
    const STEPS = buildOtaSetupSteps({
      airbnbActions: workspace.airbnbCompletedActions,
      catalogLoaded: catLoaded,
      channelId,
      otaName,
      rateMappingsCount: conn.rate_mappings.length,
      roomMappingsCount: conn.room_mappings.length,
      setupStatus: setup ?? undefined,
    });
    const doneSteps = STEPS.filter(s => s.done).length;
    const OVERVIEW_STEPS = [
      ...STEPS,
      { label: 'Enable automation', done: automationSaved },
      { label: 'Sync inventory', done: Boolean(workspace.latestInventorySyncLog) },
      { label: 'Sync rates', done: Boolean(workspace.latestRateSyncLog) },
    ];
    const overviewDoneSteps = OVERVIEW_STEPS.filter(step => step.done).length;

    return (
      <div className="min-h-screen bg-[#f4f3f0] -mx-5 lg:-mx-8 -my-6 lg:-my-8">
        {/* Sticky top bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 bg-white border-b border-black/[0.07] sticky top-0 z-20">
          <button type="button" onClick={closeWorkspace}
            className="flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-900 transition-colors font-medium">
            ← OTA channels
          </button>
          <span className="text-slate-300 text-xs">/</span>
          <span className="text-[12px] text-slate-400 truncate hidden sm:block max-w-[160px]">{conn.property.name}</span>
          <span className="text-slate-300 text-xs hidden sm:block">/</span>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: brand.bg, color: brand.color }}>{brand.abbr}</span>
            <span className="text-[13px] font-semibold text-slate-800">{otaName}</span>
            <StatusBadge status={conn.status} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {conn.status === 'ACTIVE' ? (
              <button type="button" disabled={workspace.pendingAction === 'pause-connection'} onClick={() => void workspace.pauseConnection()}
                className="h-7 px-3 rounded-lg text-[11px] font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition-colors">
                Pause
              </button>
            ) : (
              <button type="button" disabled={workspace.pendingAction === 'resume-connection'} onClick={() => void workspace.resumeConnection()}
                className="h-7 px-3 rounded-lg text-[11px] font-medium border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-40 transition-colors">
                Resume
              </button>
            )}
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex" style={{ minHeight: 'calc(100vh - 44px)' }}>

          {/* ── LEFT SIDEBAR ── */}
          <aside className="hidden">
            {/* Brand identity */}
            <div className="relative p-5 flex-shrink-0" style={{ background: `linear-gradient(160deg, ${brand.bg}88 0%, white 65%)` }}>
              {connectionReady && (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-teal-500 px-1.5 py-[1px] text-[8px] font-bold uppercase tracking-wide text-white">
                  ✓ Ready
                </span>
              )}
              <div className="mt-2 flex items-start gap-3 pr-8">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-[16px] font-bold shadow-sm border border-white/70 flex-shrink-0"
                  style={{ backgroundColor: brand.bg, color: brand.color }}>
                  {brand.abbr}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-bold text-slate-900 leading-tight truncate">{otaName}</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">{conn.property.name}</p>
                </div>
              </div>
              {(channelId || conn.external_hotel_id) && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {channelId && (
                    <div className="min-w-0 rounded-lg border border-white/70 bg-white/55 px-2 py-1.5">
                      <p className="text-[8.5px] font-bold uppercase tracking-wide text-slate-400">Channel ID</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-600 break-all">{channelId}</p>
                    </div>
                  )}
                  {conn.external_hotel_id && (
                    <div className="min-w-0 rounded-lg border border-white/70 bg-white/55 px-2 py-1.5">
                      <p className="text-[8.5px] font-bold uppercase tracking-wide text-slate-400">Hotel ID</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-600 break-all">{conn.external_hotel_id}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 border-t border-b border-black/[0.06] flex-shrink-0">
              {([['Rooms', conn.room_mappings.length, false], ['Rates', conn.rate_mappings.length, false], ['Steps', `${doneSteps}/${STEPS.length}`, true]] as [string, string | number, boolean][]).map(([label, val, isStep]) => (
                <div key={label} className="py-3 text-center">
                  <p className="text-[17px] font-bold leading-none"
                    style={isStep ? { color: doneSteps === STEPS.length ? '#10b981' : brand.color } : { color: '#0f172a' }}>
                    {val}
                  </p>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Vertical stepper + actions */}
            <div className="p-4 flex-1 overflow-y-auto space-y-5">
              {/* Steps */}
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-3">Setup checklist</p>
                <div className="space-y-2">
                  {STEPS.map((step, i) => (
                    <div key={step.label} className="flex items-center gap-2.5">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 flex-shrink-0 transition-all
                        ${step.done ? 'text-white border-transparent' : i === doneSteps ? 'bg-white border-amber-300 text-amber-600' : 'bg-white border-slate-200 text-slate-400'}`}
                        style={step.done ? { backgroundColor: brand.color, borderColor: brand.color } : {}}>
                        {step.done ? '✓' : i + 1}
                      </div>
                      <span className={`text-[12px] font-medium flex-1 ${step.done ? 'text-slate-800' : i === doneSteps ? 'text-amber-600' : 'text-slate-400'}`}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(doneSteps / STEPS.length) * 100}%`, backgroundColor: doneSteps === STEPS.length ? '#10b981' : brand.color }} />
                </div>
              </div>

              {/* Quick actions */}
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-2">Quick actions</p>
                <div className="space-y-0.5">
                  {([
                    ['↻ Sync inventory', 'inventory-sync', () => void workspace.runInventorySync(), !automationSaved],
                    ['↻ Sync rates', 'rates-sync', () => void workspace.runRatesSync(), !automationSaved],
                    ['Property check', 'property-check', () => void workspace.runPropertyCheck(), false],
                  ] as [string, string, () => void, boolean][]).map(([label, action, fn, blocked]) => (
                    <button key={label} type="button" onClick={fn}
                      disabled={blocked || workspace.pendingAction === action}
                      className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:opacity-35 disabled:cursor-not-allowed">
                      {workspace.pendingAction === action ? 'Working…' : label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Connection switcher */}
              {workspace.zodomusConnections.length > 1 && (
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-2">Switch connection</p>
                  <div className="space-y-0.5">
                    {workspace.zodomusConnections.map(c => {
                      const cb = otaBrand(c.provider_config_summary?.ota_name ?? undefined);
                      const active = c.id === conn.id;
                      return (
                        <button key={c.id} type="button" onClick={() => !active && workspace.selectConnection(c.id)}
                          className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-[11.5px] font-medium transition-all
                            ${active ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
                          <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                            style={{ backgroundColor: cb.bg, color: cb.color }}>{cb.abbr}</span>
                          <span className="truncate flex-1">{c.property.name}</span>
                          {Boolean(c.provider_config_summary?.setup_status?.ready) && <span className="text-teal-500 text-[10px]">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* ── MAIN CONTENT ── */}
          <main className="flex-1 min-w-0 p-5 space-y-2.5">
            {workspace.loading && <div className="mb-1"><LoadingMsg>Loading…</LoadingMsg></div>}
            {workspace.error && <div className="mb-1"><ErrorMsg>{workspace.error}</ErrorMsg></div>}
            <FloatingSuccessToast message={workspace.status} />

            {/* Mobile-only identity (shown when sidebar is hidden) */}
            <div className="hidden">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                style={{ backgroundColor: brand.bg, color: brand.color }}>{brand.abbr}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-slate-900">{otaName}</p>
                <p className="text-[11px] text-slate-500 truncate">{conn.property.name} · {doneSteps}/{STEPS.length} steps</p>
              </div>
              <StatusBadge status={conn.status} />
            </div>

            {/* Sections */}
            <div className="space-y-3">

              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-col gap-4 px-4 py-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/70 text-[14px] font-bold"
                      style={{ backgroundColor: brand.bg, color: brand.color }}>
                      {brand.abbr}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[15px] font-bold text-slate-900">{otaName}</h2>
                        <StatusBadge status={conn.status} />
                        {connectionReady && <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Ready</span>}
                      </div>
                      <p className="mt-0.5 text-[12px] text-slate-500">{conn.property.name}</p>
                      {(channelId || conn.external_hotel_id) && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          {channelId && <p className="text-[10.5px] text-slate-400">Channel ID <span className="font-mono text-slate-600">{channelId}</span></p>}
                          {conn.external_hotel_id && <p className="text-[10.5px] text-slate-400">Hotel ID <span className="font-mono text-slate-600">{conn.external_hotel_id}</span></p>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
                    <button type="button" onClick={() => void workspace.runInventorySync()} disabled={!automationSaved || workspace.pendingAction === 'inventory-sync'}
                      className="h-7 rounded-lg border border-slate-200 bg-white px-2.5 text-[10.5px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
                      {workspace.pendingAction === 'inventory-sync' ? 'Working…' : 'Sync inventory'}
                    </button>
                    <button type="button" onClick={() => void workspace.runRatesSync()} disabled={!automationSaved || workspace.pendingAction === 'rates-sync'}
                      className="h-7 rounded-lg border border-slate-200 bg-white px-2.5 text-[10.5px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
                      {workspace.pendingAction === 'rates-sync' ? 'Working…' : 'Sync rates'}
                    </button>
                  </div>

                  {/* <div className="space-y-2 xl:w-[30rem]">
                    {workspace.zodomusConnections.length > 1 && (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <span className="mr-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Switch connection</span>
                        {workspace.zodomusConnections.map(connection => {
                          const connectionBrand = otaBrand(connection.provider_config_summary?.ota_name ?? undefined);
                          const active = connection.id === conn.id;
                          return (
                            <button key={connection.id} type="button" onClick={() => !active && workspace.selectConnection(connection.id)}
                              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                                active ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                              }`}>
                              <span className="flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold"
                                style={{ backgroundColor: connectionBrand.bg, color: connectionBrand.color }}>{connectionBrand.abbr}</span>
                              {connection.property.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/70">
                      {([['Rooms', conn.room_mappings.length], ['Rates', conn.rate_mappings.length], ['Steps', `${overviewDoneSteps}/${OVERVIEW_STEPS.length}`]] as [string, string | number][]).map(([label, value], index) => (
                        <div key={label} className={`px-3 py-2.5 ${index > 0 ? 'border-l border-slate-100' : ''}`}>
                          <p className="text-[16px] font-bold leading-none text-slate-900">{value}</p>
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div> */}
                </div>

                <div className="space-y-3 border-t border-slate-100 px-4 py-3">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Setup progress</p>
                  <div className="flex items-start">
                    {OVERVIEW_STEPS.map((step, index) => (
                      <div key={step.label} className="flex min-w-0 flex-1 items-start">
                        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-1 text-center">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                            step.done ? 'border-emerald-500 bg-white text-emerald-600' : index === overviewDoneSteps ? 'border-amber-300 bg-white text-amber-600' : 'border-slate-200 bg-white text-slate-400'
                          }`}>
                            {step.done ? '✓' : index + 1}
                          </span>
                          <span className={`text-[10px] font-semibold leading-tight ${step.done ? 'text-slate-700' : index === overviewDoneSteps ? 'text-amber-600' : 'text-slate-400'}`}>{step.label}</span>
                        </div>
                        {index < OVERVIEW_STEPS.length - 1 && <span className={`mt-3.5 h-0.5 w-full max-w-8 rounded-full ${step.done ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Section title="Provider catalog" badge="Room & rate IDs" accent="#6366f1" defaultOpen={!catLoaded}>
                <div className="pt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void workspace.reactivateProperty()}
                      disabled={!conn || workspace.pendingAction === 'property-activate'} className={primaryBtn}>
                      {workspace.pendingAction === 'property-activate' ? 'Activating…' : 'Re-activate property'}
                    </button>
                    <button type="button" onClick={() => void workspace.loadProviderCatalog()}
                      disabled={!workspace.canLoadCatalog || workspace.pendingAction === 'load-provider-catalog'} className={secondaryBtn}>
                      {workspace.pendingAction === 'load-provider-catalog' ? 'Loading…' : 'Load rooms & rates'}
                    </button>
                    <button type="button" onClick={() => void workspace.activateMappedRooms()}
                      disabled={!workspace.canActivateMappedRooms || workspace.pendingAction === 'activate-mapped-rooms'} className={secondaryBtn}>
                      {workspace.pendingAction === 'activate-mapped-rooms' ? 'Activating…' : 'Activate mapped rooms'}
                    </button>
                    <button type="button" onClick={() => setRoomsCancelConfirm(true)}
                      disabled={!workspace.canCancelMappedRooms || workspace.pendingAction === 'cancel-mapped-rooms'} className={secondaryBtn}>
                      {workspace.pendingAction === 'cancel-mapped-rooms' ? 'Cancelling…' : 'Cancel mapped rooms'}
                    </button>
                    <button type="button" onClick={() => void workspace.runPropertyCheck()}
                      disabled={workspace.pendingAction === 'property-check'} className={secondaryBtn}>
                      {workspace.pendingAction === 'property-check' ? 'Checking…' : 'Run property check'}
                    </button>
                  </div>
                  {setup?.last_check_message && <p className="text-xs text-slate-400">{setup.last_check_message}</p>}
                  {workspace.canMap && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                      <CatalogList emptyText="No room IDs returned." items={workspace.catalogRooms} title="Room type IDs" valueKey="external_room_id" />
                      <CatalogList emptyText="No rate IDs returned." items={workspace.catalogRates} title="Rate plan IDs" valueKey="external_rate_id" />
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Room mappings" badge={`${conn.room_mappings.length} mapped`} accent="#10b981" actionSlotId={roomMappingSaveSlotId} defaultOpen>
                <RoomConnectorMapper key={conn.id} brand={brand} connection={conn} workspace={workspace} />
              </Section>

              <Section title="Rate mappings" badge={`${conn.rate_mappings.length} mapped`} accent="#f59e0b" actionSlotId={rateMappingSaveSlotId} defaultOpen={conn.room_mappings.length > 0}>
                <RateConnectorMapper key={conn.id} brand={brand} connection={conn} workspace={workspace} />
              </Section>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <Section title="Automation" badge={automationSaved ? 'Enabled' : 'Manual'} accent="#8b5cf6">
                  <div className="pt-3">
                    <form onSubmit={workspace.saveAutomationSettings} className="space-y-3">
                      <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${workspace.automationEnabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                        <input checked={workspace.automationEnabled} onChange={e => workspace.setAutomationEnabled(e.target.checked)} type="checkbox" className="w-4 h-4 rounded accent-emerald-600" />
                        <span className="flex-1">
                          <strong className="text-[13px] font-semibold text-slate-900 block">Enable automatic sync</strong>
                          <span className="text-xs text-slate-500">{workspace.automationEnabled ? 'Jobs run on the schedule below.' : 'Manual mode — you control sync timing.'}</span>
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${workspace.automationEnabled ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${workspace.automationEnabled ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                          {workspace.automationEnabled ? 'Live' : 'Off'}
                        </span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {([['Inventory', workspace.inventoryInterval], ['Rates', workspace.ratesInterval], ['Res. import', workspace.reservationImportInterval], ['Sync window', workspace.syncWindowDays]] as [string, string][]).map(([label, val]) => (
                          <StatCard key={label} label={label} value={val || '—'} />
                        ))}
                      </div>
                      <div className="grid grid-cols-1 gap-3 rounded-xl border border-black/[0.06] bg-slate-50/70 p-4 sm:grid-cols-2">
                        {([
                          ['Inventory (min)', workspace.inventoryInterval, workspace.setInventoryInterval],
                          ['Rate (min)', workspace.ratesInterval, workspace.setRatesInterval],
                          ['Res. import (min)', workspace.reservationImportInterval, workspace.setReservationImportInterval],
                          ['Sync window (days)', workspace.syncWindowDays, workspace.setSyncWindowDays],
                        ] as [string, string, (v: string) => void][]).map(([lbl, val, setter]) => (
                          <label key={lbl} className="flex flex-col gap-1">
                            <span className="text-[11px] text-slate-500">{lbl}</span>
                            <input className={inputCls} min="1" onChange={e => setter(e.target.value)} type="number" value={val} />
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <p className={`text-[11px] ${canApplyAuto ? 'text-emerald-600' : 'text-slate-400'}`}>{autoBlocker}</p>
                        <button type="submit" disabled={!canApplyAuto || workspace.pendingAction === 'save-automation'} className={`${primaryBtn} justify-center`}>
                          {workspace.pendingAction === 'save-automation' ? 'Saving…' : 'Apply automation'}
                        </button>
                      </div>
                    </form>
                  </div>
                </Section>

                <Section title="Reservation testing" badge="Admin" accent="#ef4444">
                  <div className="pt-3">
                    <form onSubmit={e => { e.preventDefault(); setEventConfirm(true); }} className="space-y-3">
                      <div className="grid grid-cols-1 gap-3">
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                          <span className="text-[9.5px] font-bold uppercase tracking-wider text-indigo-400 block mb-0.5">Selected event</span>
                          <strong className="text-[14px] font-semibold text-indigo-950 block">{fmtEventLabel(workspace.providerReservationEventStatus)}</strong>
                          <p className="text-xs text-indigo-600 mt-1 leading-relaxed">{describeEvent(workspace.providerReservationEventStatus)}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 rounded-xl border border-black/[0.06] bg-slate-50/70 p-4">
                          <label className={labelCls}>
                            <span>Event</span>
                            <CustomSelect onChange={v => workspace.setProviderReservationEventStatus(v as typeof workspace.providerReservationEventStatus)}
                              options={workspace.providerReservationEventOptions.map(o => ({ label: fmtEventLabel(o), value: o }))}
                              value={workspace.providerReservationEventStatus} />
                          </label>
                          <label className={labelCls}>
                            <span>Reservation ID</span>
                            <input className={inputCls} onChange={e => workspace.setProviderReservationId(e.target.value)}
                              placeholder={workspace.providerReservationEventStatus === 'new' ? 'Optional' : 'Required'} value={workspace.providerReservationId} />
                          </label>
                        </div>
                      </div>
                      <p className={`text-[11px] rounded-xl px-3 py-2 border ${canUseResTools ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>{resBlocker}</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={!canUseResTools || workspace.pendingAction === 'provider-reservation-event'} className={primaryBtn}>
                          {workspace.pendingAction === 'provider-reservation-event' ? 'Sending…' : `Send ${fmtEventLabel(workspace.providerReservationEventStatus)} event`}
                        </button>
                        <button type="button" onClick={() => setBackfillConfirm(true)} disabled={!conn || !setup?.ready || workspace.pendingAction === 'reservations-summary-backfill'} className={secondaryBtn}>
                          {workspace.pendingAction === 'reservations-summary-backfill' ? 'Queueing…' : 'Backfill future reservations'}
                        </button>
                      </div>
                      {eventConfirm && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <p className="text-[12.5px] font-medium leading-relaxed text-amber-900">
                            Send <strong>{fmtEventLabel(workspace.providerReservationEventStatus)}</strong> provider event to {formatConnectionLabel(conn)} for{' '}
                            {workspace.providerReservationId.trim() || 'a new test reservation'}?
                          </p>
                          <div className="mt-3 flex justify-end gap-2">
                            <button className={secondaryBtn} disabled={workspace.pendingAction === 'provider-reservation-event'} onClick={() => setEventConfirm(false)} type="button">Cancel</button>
                            <button type="button" disabled={workspace.pendingAction === 'provider-reservation-event'}
                              onClick={() => { void workspace.submitProviderReservationEvent().then(() => setEventConfirm(false)); }}
                              className={primaryBtn}>
                              {workspace.pendingAction === 'provider-reservation-event' ? 'Sending…' : 'Send event'}
                            </button>
                          </div>
                        </div>
                      )}
                    </form>
                  </div>
                </Section>
              </div>

              <Section title="API checks" badge="Certification" accent="#0ea5e9">
                <div className="pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                    {([
                      ['Get channels', 'provider-channels', () => void workspace.fetchProviderChannels()],
                      ['Get price models', 'provider-price-models', () => void workspace.fetchProviderPriceModels()],
                      ['Check property', 'property-check', () => void workspace.runPropertyCheck()],
                      ['Get room-rates', 'load-provider-catalog', () => void workspace.loadProviderCatalog()],
                      ['Get availability', 'provider-availability', () => void workspace.fetchProviderAvailability()],
                      ['Post availability', 'inventory-sync', () => void workspace.runInventorySync()],
                      ['Post rates', 'rates-sync', () => void workspace.runRatesSync()],
                      ['Availability mult.', 'availability-multiple-sync', () => void workspace.runAvailabilityMultipleSync()],
                      ['Rates multiple', 'rates-multiple-sync', () => void workspace.runRatesMultipleSync()],
                      ['Reservation summary', 'provider-reservations-summary', () => void workspace.fetchReservationSummary()],
                      ['Reservation queue', 'provider-reservations-queue', () => void workspace.fetchReservationQueue()],
                      ['Import bookings sync', 'reservation-import-sync', () => void workspace.runReservationImportSync()],
                    ] as [string, string, () => void][]).map(([label, action, fn]) => (
                      <button key={label} type="button" disabled={!conn || workspace.pendingAction === action} onClick={fn} className={`${secondaryBtn} justify-center px-3`}>
                        {workspace.pendingAction === action ? 'Working…' : label}
                      </button>
                    ))}
                  </div>
                  {isAirbnb && (
                    <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4 space-y-3">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-sky-500">Airbnb only</p>
                      <div className="grid grid-cols-2 gap-2">
                        <label className={labelCls}><span>Airbnb token</span><input className={inputCls} onChange={e => workspace.setAirbnbToken(e.target.value)} placeholder="From host activation" value={workspace.airbnbToken} /></label>
                        <label className={labelCls}><span>Airbnb client ID</span><input className={inputCls} onChange={e => workspace.setAirbnbClientId(e.target.value)} placeholder="From host activation" value={workspace.airbnbClientId} /></label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {([
                          ['Host activation', 'airbnb-host-activation', false, () => void workspace.activateAirbnbHost()],
                          ['Open auth URL', 'airbnb-oauth2-tests', !workspace.airbnbToken.trim() || !workspace.airbnbClientId.trim(), () => void workspace.activateAirbnbOauthTest()],
                          ['Host status', 'airbnb-host-status', !workspace.airbnbToken.trim(), () => void workspace.fetchAirbnbHostStatus()],
                          ['Host listings', 'airbnb-listings', !workspace.airbnbToken.trim(), () => void workspace.fetchAirbnbListings()],
                          ['Re-activate property', 'property-activate', false, () => void workspace.reactivateProperty()],
                          ['Load rooms & rates', 'load-provider-catalog', !workspace.canLoadCatalog, () => void workspace.loadProviderCatalog()],
                        ] as [string, string, boolean, () => void][]).map(([label, action, disabled, fn]) => (
                          <button key={label} type="button" disabled={!conn || disabled || workspace.pendingAction === action} onClick={fn} className={secondaryBtn}>
                            {workspace.pendingAction === action ? 'Working…' : label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 border-t border-black/[0.06] pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                    <label className={`${labelCls} flex-1 min-w-[180px]`}>
                      <span>Reservation ID</span>
                      <input className={inputCls} onChange={e => workspace.setProviderReservationId(e.target.value)} placeholder="From reservation queue" value={workspace.providerReservationId} />
                    </label>
                    <button type="button" disabled={!conn || !workspace.providerReservationId.trim() || workspace.pendingAction === 'provider-reservation-detail'} onClick={() => void workspace.fetchProviderReservationDetail()} className={`${secondaryBtn} justify-center`}>Get reservation</button>
                    <button type="button" disabled={!conn || !workspace.providerReservationId.trim() || workspace.pendingAction === 'provider-reservation-card'} onClick={() => void workspace.fetchProviderReservationCard()} className={`${secondaryBtn} justify-center`}>Get card data</button>
                  </div>
                  {workspace.certificationResponse && (
                    <div className="pt-3 border-t border-black/[0.06] space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Last response</p>
                        <span className="text-xs font-medium text-slate-500">{workspace.certificationResponse.label}</span>
                      </div>
                      {isAuthUrlResponse(workspace.certificationResponse.payload) && (
                        <a href={workspace.certificationResponse.payload.auth_url} target="_blank" rel="noreferrer"
                          className="block break-all rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100">
                          {workspace.certificationResponse.payload.auth_url}
                        </a>
                      )}
                      <pre className="max-h-60 overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200">
                        {JSON.stringify(workspace.certificationResponse.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </Section>

            </div>
          </main>
        </div>

        {/* Rooms cancellation confirm modal */}
        {roomsCancelConfirm && conn && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-rose-500 mb-1">Zodomus room cancellation</p>
                <h3 className="text-base font-bold text-slate-900">Cancel mapped room associations?</h3>
                <p className="text-[13px] text-slate-500 mt-2 leading-relaxed">
                  This will send {mappedExternalRoomIds.length} mapped Zodomus room ID{mappedExternalRoomIds.length === 1 ? '' : 's'} to {formatConnectionLabel(conn)}.
                </p>
                {mappedExternalRoomIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {mappedExternalRoomIds.slice(0, 8).map(roomId => (
                      <span key={roomId} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {roomId}
                      </span>
                    ))}
                    {mappedExternalRoomIds.length > 8 && (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                        +{mappedExternalRoomIds.length - 8} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="p-4 bg-slate-50 flex justify-end gap-2">
                <button className={secondaryBtn} disabled={workspace.pendingAction === 'cancel-mapped-rooms'} onClick={() => setRoomsCancelConfirm(false)} type="button">Cancel</button>
                <button type="button" disabled={workspace.pendingAction === 'cancel-mapped-rooms'}
                  onClick={() => { void workspace.cancelMappedRooms().then(() => setRoomsCancelConfirm(false)); }}
                  className={primaryBtn}>
                  {workspace.pendingAction === 'cancel-mapped-rooms' ? 'Cancelling…' : 'Cancel rooms'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Backfill confirm modal */}
        {backfillConfirm && conn && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-indigo-500 mb-1">Go-live backfill</p>
                <h3 className="text-base font-bold text-slate-900">Backfill future Zodomus reservations?</h3>
                <p className="text-[13px] text-slate-500 mt-2 leading-relaxed">Queues a one-time import of future stays that pre-dated the HMS channel-manager connection.</p>
              </div>
              <div className="p-4 bg-slate-50 flex justify-end gap-2">
                <button className={secondaryBtn} disabled={workspace.pendingAction === 'reservations-summary-backfill'} onClick={() => setBackfillConfirm(false)} type="button">Cancel</button>
                <button type="button" disabled={workspace.pendingAction === 'reservations-summary-backfill'}
                  onClick={() => { void workspace.backfillExistingReservations().then(() => setBackfillConfirm(false)); }}
                  className={primaryBtn}>
                  {workspace.pendingAction === 'reservations-summary-backfill' ? 'Queueing…' : 'Queue backfill'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ══ CHANNEL GRID (Level 1) ══════════════════════════════ */
  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-slate-900">OTA channels</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">Manage distribution channel connections and sync.</p>
        </div>
        <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
          {workspace.zodomusConnections.length > 0 && (
            <div className="grid flex-1 grid-cols-3 overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-sm sm:flex-none">
              {([
                ['Connections', workspace.zodomusConnections.length, 'bg-indigo-500'],
                ['Mapped rooms', totalRooms, 'bg-emerald-500'],
                ['Mapped rates', totalRates, 'bg-amber-500'],
              ] as [string, number, string][]).map(([label, value, dot], index) => (
                <div
                  key={label}
                  className={`min-w-0 px-3 py-2.5 ${index > 0 ? 'border-l border-slate-100' : ''} sm:min-w-[6.5rem]`}
                >
                  <div className="flex items-center justify-center gap-1.5 sm:justify-start">
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} />
                    <p className="truncate text-[9.5px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  </div>
                  <p className="mt-1 text-center text-[18px] font-bold leading-none tracking-tight text-slate-900 sm:text-left">{value}</p>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 active:bg-emerald-50 sm:w-auto"
            onClick={() => openPropertySetupDrawer('property')}
          >
            <span className="text-[16px] font-semibold leading-none text-emerald-700">+</span>
            Add property
          </button>
          <button
            type="button"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:bg-white sm:w-auto"
            onClick={() => openConnectionSetup(getConnectionOtaKey(workspace.selectedConnection))}
          >
            <span className="text-[16px] font-semibold leading-none text-slate-500">+</span>
            Add connection
          </button>
          {workspace.zodomusConnections.length > 0 && (
            <button
              type="button"
              className={`inline-flex h-11 w-full items-center justify-center rounded-xl border px-4 text-[13px] font-semibold shadow-sm transition sm:w-auto ${
                removeMode
                  ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
              onClick={removeMode ? cancelRemoveConnection : beginRemoveConnection}
            >
              {removeMode ? 'Cancel remove' : 'Remove connection'}
            </button>
          )}
        </div>
      </div>

      {workspace.loading && <LoadingMsg>Loading channel data…</LoadingMsg>}
      {workspace.error && <ErrorMsg>{workspace.error}</ErrorMsg>}
      <FloatingSuccessToast message={workspace.status} />
      {propertySetupDrawerOpen && createPortal(
        <PropertySetupDrawer
          activeTab={propertySetupDrawerTab}
          onClose={closePropertySetupDrawer}
          onConfigureOta={() => {
            setPropertySetupDrawerOpen(false);
            setSetupOtaKey(workspace.zodomusOtaKey);
          }}
          onTabChange={setPropertySetupDrawerTab}
        />,
        document.body,
      )}
      {removeMode && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
          Select a channel card to remove. If that channel has multiple saved connections, choose the exact connection next.
        </div>
      )}

      {allCards.length === 0 ? (
        <div className="bg-white border border-black/[0.06] rounded-2xl shadow-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4 text-3xl">🔌</div>
          <p className="text-[14px] font-semibold text-slate-800">No OTA connections yet</p>
          <p className="text-[12px] text-slate-400 mt-1">Add a connection via Channel Manager to get started.</p>
        </div>
      ) : (
        <>
          {/* Card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allCards.map(card => {
              const c = card.connection;
              const cOta = c?.provider_config_summary?.ota_name ?? card.label;
              const brand = otaBrand(cOta);
              const isConf = Boolean(c);
              const status = c?.status ?? '';
              const ready = Boolean(c?.provider_config_summary?.setup_status?.ready);
              const isOpen = Boolean(c && expandedId === c.id);
              const roomsCount = c?.room_mappings.length ?? 0;
              const ratesCount = c?.rate_mappings.length ?? 0;
              const cardChannelId = c?.provider_config_summary?.channel_id;
              const cardIsAirbnb = Boolean(
                cardChannelId === '3' ||
                c?.provider_config_summary?.ota_name?.toLowerCase().includes('airbnb') ||
                cOta.toLowerCase().includes('airbnb'),
              );
              const cardStepDetails = isConf && c
                ? buildOtaSetupSteps({
                    airbnbActions: cardIsAirbnb ? workspace.airbnbActionsForConnection(c.id) : new Set<string>(),
                    catalogLoaded: Boolean(c.provider_config_summary?.setup_status?.catalog_loaded) || (c.id === conn?.id && workspace.canMap),
                    channelId: cardChannelId,
                    otaName: cOta,
                    rateMappingsCount: c.rate_mappings.length,
                    roomMappingsCount: c.room_mappings.length,
                    setupStatus: c.provider_config_summary?.setup_status,
                  })
                : [];
              const cardSteps = cardStepDetails.map(step => step.done);
              const doneCount = cardSteps.filter(Boolean).length;

              const statusMetaByStatus: Record<string, { badge: string; dot: string; label: string }> = {
                ACTIVE: { badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
                PAUSED: { badge: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-400', label: 'Paused' },
                ERROR: { badge: 'bg-rose-50 border-rose-200 text-rose-600', dot: 'bg-rose-500', label: 'Error' },
              };
              const sm = statusMetaByStatus[status] ?? { badge: 'bg-slate-50 border-slate-200 text-slate-500', dot: 'bg-slate-300', label: 'Pending' };

              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => {
                    if (removeMode) {
                      chooseCardForRemoval(card);
                      return;
                    }
                    if (c) handleCardClick(c.id);
                    else openConnectionSetup(card.key as typeof workspace.zodomusOtaKey);
                  }}
                  style={{
                    borderColor: brand.bg,
                  }}
                  className={`text-left rounded-2xl border transition-all duration-200 flex flex-col bg-white group overflow-hidden
                    
                    ${isOpen
                      ? 'border-slate-900 shadow-md ring-1 ring-slate-900/5'
                      : isConf
                        ? removeMode
                          ? 'border-rose-200 hover:border-rose-300 hover:shadow-md hover:ring-2 hover:ring-rose-100'
                          : 'border-black/[0.07] hover:border-slate-300 hover:shadow-md'
                        : 'border-dashed border-slate-200 hover:border-slate-300 opacity-55 hover:opacity-90'}`}
                >
                  {/* Brand accent bar */}
                  {isConf && (
                    <div className="h-1 w-full" style={{ backgroundColor: brand.color }} />
                  )}
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: brand.bg, color: brand.color }}>
                        {brand.abbr}
                      </div>
                      {isConf && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9.5px] font-semibold ${sm.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                          {sm.label}
                        </span>
                      )}
                      {removeMode && isConf && (
                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9.5px] font-bold text-rose-600">
                          Remove
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-[14px] font-bold text-slate-900 leading-tight">{cOta}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{c?.property.name ?? 'Not connected'}</p>
                    </div>
                    {/* Progress dots */}
                    {isConf && (
                      <div className="flex items-center gap-1.5">
                        {cardSteps.map((done, i) => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${done ? '' : 'bg-slate-100'}`}
                            style={done ? { backgroundColor: brand.color + 'aa' } : {}} />
                        ))}
                        <span className="text-[9.5px] text-slate-400 ml-1 flex-shrink-0 font-semibold">{doneCount}/{cardSteps.length}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-black/[0.05]">
                      <span className="min-w-0 text-[11px] font-semibold text-slate-500">
                        {!isConf ? 'Not connected'
                          : status === 'ERROR' ? 'Fix connection'
                            : `${roomsCount} ${roomsCount === 1 ? 'room' : 'rooms'} · ${ratesCount} ${ratesCount === 1 ? 'rate' : 'rates'}`}
                      </span>
                      {isConf && (
                        <span className="text-[10.5px] font-bold text-slate-400 group-hover:text-slate-700 transition-colors">
                          {isOpen ? 'Close ▲' : 'View ▼'}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {setupOtaKey && (
            <OtaConnectionSetup
              workspace={workspace}
              onCancel={() => setSetupOtaKey(null)}
            />
          )}

          {/* Inline panel */}
          {expandedId && (
            <InlinePanel
              workspace={workspace}
              connectionId={expandedId}
              onClose={() => {
                setExpandedId(null);
                persistExpandedOtaCardId(null);
              }}
              onOpenWorkspace={openWorkspace}
            />
          )}

          {removeChoiceIds.length > 0 && createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
              <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-rose-500 mb-1">Choose connection</p>
                  <h3 className="text-base font-bold text-slate-900">Which connection do you want to remove?</h3>
                  <p className="text-[13px] text-slate-500 mt-2 leading-relaxed">This OTA has more than one saved connection.</p>
                  <div className="mt-4 space-y-2">
                    {removeChoiceIds.map(id => {
                      const choice = workspace.zodomusConnections.find(connection => connection.id === id);
                      if (!choice) return null;
                      return (
                        <button
                          key={id}
                          type="button"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-rose-200 hover:bg-rose-50"
                          onClick={() => {
                            setRemoveChoiceIds([]);
                            setRemoveTargetId(id);
                          }}
                        >
                          <span className="block text-[13px] font-semibold text-slate-900">{formatConnectionLabel(choice)}</span>
                          <span className="mt-1 block text-[11px] text-slate-500">
                            Hotel ID {choice.external_hotel_id || '—'} · {choice.room_mappings.length} rooms · {choice.rate_mappings.length} rates
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="p-4 bg-slate-50 flex justify-end">
                  <button className={secondaryBtn} onClick={() => setRemoveChoiceIds([])} type="button">Cancel</button>
                </div>
              </div>
            </div>,
            document.body,
          )}

          {removeTarget && createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
              <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-rose-500 mb-1">Remove connection</p>
                  <h3 className="text-base font-bold text-slate-900">Remove {formatConnectionLabel(removeTarget)}?</h3>
                  <p className="text-[13px] text-slate-500 mt-2 leading-relaxed">
                    This removes the local OTA connection, mappings, sync logs, and imported test reservation data for this channel. It does not call Zodomus.
                  </p>
                </div>
                <div className="p-4 bg-slate-50 flex justify-end gap-2">
                  <button className={secondaryBtn} disabled={workspace.pendingAction === 'delete-connection'} onClick={() => setRemoveTargetId(null)} type="button">Cancel</button>
                  <button
                    type="button"
                    disabled={workspace.pendingAction === 'delete-connection'}
                    onClick={() => {
                      void workspace.deleteConnection(removeTarget.id).then(() => {
                        setRemoveMode(false);
                        setRemoveChoiceIds([]);
                        setRemoveTargetId(null);
                        setDetailId(null);
                        setExpandedId(null);
                        persistExpandedOtaCardId(null);
                      });
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-600 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {workspace.pendingAction === 'delete-connection' ? 'Removing…' : 'Remove connection'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}
