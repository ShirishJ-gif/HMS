export const savedFiltersPrefix = 'hms_saved_filters:v1:';

export function savedFilterKey(userId: string, organizationId: string | null | undefined, scope: string) {
  return `${savedFiltersPrefix}${JSON.stringify([userId, organizationId ?? '', scope])}`;
}

function storage() {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

export function readSavedFilter<T>(key: string, fallback: T, valid: (value: unknown) => value is T, store = storage()): T {
  try {
    const raw = store?.getItem(key);
    if (raw) { const value: unknown = JSON.parse(raw); if (valid(value)) return value; }
  } catch { /* Storage may be unavailable or contain an older invalid value. */ }
  return fallback;
}

export function writeSavedFilter(key: string, value: unknown, store = storage()) {
  try { store?.setItem(key, JSON.stringify(value)); } catch { /* Filters still work in memory. */ }
}

export function clearSavedFilters(store = storage()) {
  if (!store) return;
  try {
    for (let index = store.length - 1; index >= 0; index--) {
      const key = store.key(index);
      if (key?.startsWith(savedFiltersPrefix)) store.removeItem(key);
    }
  } catch { /* Unavailable storage must not prevent logout. */ }
}
