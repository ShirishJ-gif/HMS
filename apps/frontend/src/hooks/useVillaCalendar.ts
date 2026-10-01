import { useEffect, useRef, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { InventoryCalendarSummary } from '../api/types';

type MonthEntry = {
  data?: InventoryCalendarSummary;
  revision: number;
  pending: boolean;
  error?: string;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Keep every visited month for this mounted page. A refresh or inventory change
// invalidates the entries, but preserves their rows until fresh data arrives.
export function useVillaCalendar(propertyId: string, month: Date, revision: number) {
  const entries = useRef(new Map<string, MonthEntry>());
  const requests = useRef(new Set<AbortController>());
  const [, render] = useState(0);
  const first = dateKey(month);

  useEffect(() => {
    const activeRequests = requests.current;
    return () => {
      for (const controller of activeRequests) controller.abort();
      activeRequests.clear();
      for (const [key, entry] of entries.current) {
        if (entry.pending) entries.current.set(key, { ...entry, revision: -1, pending: false });
      }
    };
  }, [propertyId, revision]);

  useEffect(() => {
    const [year, monthNumber] = first.split('-').map(Number);
    // Request the visible month first and preload its neighbours. Moving back
    // to any cached month reads it synchronously, without another request.
    for (const offset of [0, -1, 1]) {
      const from = dateKey(new Date(year, monthNumber - 1 + offset, 1));
      const to = dateKey(new Date(year, monthNumber + offset, 0));
      const key = `${propertyId}:${from}`;
      const existing = entries.current.get(key);
      if (existing?.revision === revision) continue;

      const controller = new AbortController();
      requests.current.add(controller);
      entries.current.set(key, { data: existing?.data, revision, pending: true });
      void api.get<InventoryCalendarSummary>('/inventory-calendar', {
        params: { property_id: propertyId, from, to }, signal: controller.signal,
      }).then(({ data }) => {
        if (!controller.signal.aborted) entries.current.set(key, { data, revision, pending: false });
      }).catch(error => {
        if (!controller.signal.aborted) entries.current.set(key, {
          data: existing?.data, revision, pending: false, error: getApiErrorMessage(error),
        });
      }).finally(() => {
        requests.current.delete(controller);
        if (!controller.signal.aborted) render(value => value + 1);
      });
    }
    render(value => value + 1);
  }, [propertyId, first, revision]);

  const entry = entries.current.get(`${propertyId}:${first}`);
  return {
    calendar: entry?.data ?? null,
    loading: !entry || entry.pending,
    error: entry?.error ?? null,
  };
}
