import { ReactNode } from 'react';
import { ChannelConnection } from '../../api/types';
import { StatusBadge, Th, Td } from '../ui';

const istDateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

export function SummaryTile({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <strong className="text-2xl font-extrabold text-slate-900 block tracking-tight">{value}</strong>
      <span className="text-xs text-slate-500 leading-relaxed">{detail}</span>
    </div>
  );
}

export function SetupBadge({ done, label }: { done: boolean; label: string }) {
  return <StatusBadge label={done ? label : `${label}: pending`} tone={done ? 'green' : 'gold'} />;
}

export function SyncStateCard({ label, state }: {
  label: string;
  state: { last_status: string | null; last_synced_at: string | null; last_error: string | null; next_due_at: string | null };
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <strong className={`text-base font-bold block ${state.last_status === 'SUCCEEDED' ? 'text-emerald-700' : state.last_status ? 'text-rose-600' : 'text-slate-500'}`}>{state.last_status ?? 'Never run'}</strong>
      <span className="text-xs text-slate-500 block">{state.last_synced_at ? `Last: ${formatDateTime(state.last_synced_at)}` : 'No sync yet'}</span>
      <span className="text-xs text-slate-400 block">{state.next_due_at ? `Next: ${formatDateTime(state.next_due_at)}` : 'No next schedule'}</span>
      {state.last_error && <span className="text-xs text-rose-500 block truncate">{state.last_error}</span>}
    </div>
  );
}

export function CatalogList<T extends {
  external_room_id?: string | null; external_rate_id?: string | null;
  external_room_name?: string | null; external_rate_name?: string | null;
}>({
  emptyText, items, title, valueKey,
}: {
  emptyText: string; items: T[]; title: string; valueKey: 'external_room_id' | 'external_rate_id';
}) {
  return (
    <div className="flex-1 min-w-0">
      <h4 className="text-sm font-bold text-slate-800 mb-2">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {valueKey === 'external_rate_id' ? (
                  <><Th className="!text-[10px] !py-2">Room ID</Th><Th className="!text-[10px] !py-2">Rate ID</Th><Th className="!text-[10px] !py-2">Rate name</Th></>
                ) : (
                  <><Th className="!text-[10px] !py-2">ID</Th><Th className="!text-[10px] !py-2">Name</Th></>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const id = item[valueKey] ?? '';
                const name = item.external_room_name ?? item.external_rate_name ?? '—';
                const roomId = item.external_room_id ?? '—';
                const rowKey = valueKey === 'external_rate_id' ? `${roomId}::${id}` : item.external_room_id ?? id;
                return (
                  <tr key={rowKey} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    {valueKey === 'external_rate_id' ? (
                      <><Td className="!py-2 font-mono !text-[11px]">{roomId}</Td><Td className="!py-2 font-mono !text-[11px]">{id}</Td><Td className="!py-2">{name}</Td></>
                    ) : (
                      <><Td className="!py-2 font-mono !text-[11px]">{id}</Td><Td className="!py-2">{name}</Td></>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MappingTable({ emptyText, rows, title }: {
  emptyText: string;
  rows: Array<{ id: string; internal: string; external: string }>;
  title: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Saved mappings</p>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
      </div>
      <div className="overflow-x-auto max-h-64 overflow-y-auto scrollbar-none">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <Th>HMS item</Th>
              <Th>Provider ID</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <Td className="font-medium text-slate-800">{row.internal}</Td>
                <Td className="font-mono text-xs text-slate-500">{row.external}</Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-4 text-center text-xs text-slate-400">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${istDateTimeFormatter.format(date)} IST`;
}

export function formatSignedNumber(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function formatInventorySnapshot(value: { total_inventory: number; out_of_service: number; booked: number; available: number } | null | undefined) {
  if (!value) return '—';
  return `avail ${value.available} | booked ${value.booked} | ooo ${value.out_of_service} | total ${value.total_inventory}`;
}

export function formatConnectionLabel(connection: ChannelConnection) {
  const otaName = connection.provider_config_summary?.ota_name ?? connection.provider;
  const externalHotelId = connection.external_hotel_id ? ` • ${connection.external_hotel_id}` : '';
  return `${connection.property.name} • ${otaName}${externalHotelId}`;
}
