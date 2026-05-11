import { ReactNode } from 'react';
import { ChannelConnection } from '../../api/types';

const istDateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function SummaryTile({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <article className="channel-summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

export function SetupBadge({ done, label }: { done: boolean; label: string }) {
  return <span className={`status-pill ${done ? 'active' : 'pending'}`}>{done ? label : `${label}: pending`}</span>;
}

export function SyncStateCard({
  label,
  state,
}: {
  label: string;
  state: {
    last_status: string | null;
    last_synced_at: string | null;
    last_error: string | null;
    next_due_at: string | null;
  };
}) {
  return (
    <article className="channel-summary-card">
      <p>{label}</p>
      <strong>{state.last_status ?? 'Never run'}</strong>
      <span>{state.last_synced_at ? `Last: ${formatDateTime(state.last_synced_at)}` : 'No sync yet'}</span>
      <span>{state.next_due_at ? `Next: ${formatDateTime(state.next_due_at)}` : 'No next schedule'}</span>
      {state.last_error ? <span>{state.last_error}</span> : null}
    </article>
  );
}

export function CatalogList<
  T extends {
    external_room_id?: string | null;
    external_rate_id?: string | null;
    external_room_name?: string | null;
    external_rate_name?: string | null;
  },
>({
  emptyText,
  items,
  title,
  valueKey,
}: {
  emptyText: string;
  items: T[];
  title: string;
  valueKey: 'external_room_id' | 'external_rate_id';
}) {
  return (
    <div>
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <table className="data-table compact-table">
          <thead>
            <tr>
              {valueKey === 'external_rate_id' ? (
                <>
                  <th>Room ID</th>
                  <th>Rate ID</th>
                  <th>Rate name</th>
                </>
              ) : (
                <>
                  <th>ID</th>
                  <th>Name</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const id = item[valueKey] ?? '';
              const name = item.external_room_name ?? item.external_rate_name ?? '-';
              const roomId = item.external_room_id ?? '-';
              const rowKey =
                valueKey === 'external_rate_id'
                  ? `${roomId}::${id}`
                  : item.external_room_id ?? id;

              return (
                <tr key={rowKey}>
                  {valueKey === 'external_rate_id' ? (
                    <>
                      <td>{roomId}</td>
                      <td>{id}</td>
                      <td>{name}</td>
                    </>
                  ) : (
                    <>
                      <td>{id}</td>
                      <td>{name}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function MappingTable({
  emptyText,
  rows,
  title,
}: {
  emptyText: string;
  rows: Array<{ id: string; internal: string; external: string }>;
  title: string;
}) {
  return (
    <div className="mapping-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Saved mappings</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="mapping-scroll">
        <table>
          <thead>
            <tr>
              <th>HMS item</th>
              <th>Provider ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.internal}</td>
                <td>{row.external}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="empty-cell" colSpan={2}>
                  {emptyText}
                </td>
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

export function formatInventorySnapshot(
  value:
    | {
        total_inventory: number;
        out_of_service: number;
        booked: number;
        available: number;
      }
    | null
    | undefined,
) {
  if (!value) return '-';
  return `avail ${value.available} | booked ${value.booked} | ooo ${value.out_of_service} | total ${value.total_inventory}`;
}

export function formatConnectionLabel(connection: ChannelConnection) {
  const otaName = connection.provider_config_summary?.ota_name ?? connection.provider;
  const externalHotelId = connection.external_hotel_id ? ` • ${connection.external_hotel_id}` : '';
  return `${connection.property.name} • ${otaName}${externalHotelId}`;
}
