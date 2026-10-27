import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { getStoredAuthUser } from '../api/session';
import { readSavedFilter, savedFilterKey, writeSavedFilter } from '../utils/saved-filters';

// Persist only small, validated filter preferences; API results remain in memory.
export function useSavedFilters<T>(scope: string, initial: () => T, valid: (value: unknown) => value is T): [T, Dispatch<SetStateAction<T>>] {
  const user = getStoredAuthUser();
  const key = savedFilterKey(user?.id ?? 'anonymous', user?.organization_id, scope);
  const restored = useMemo(() => readSavedFilter(key, initial(), valid), [key]);
  const [stored, setStored] = useState({ key, value: restored });
  const value = stored.key === key ? stored.value : restored;
  useEffect(() => {
    if (stored.key !== key) setStored({ key, value });
    const current = getStoredAuthUser();
    if (current && savedFilterKey(current.id, current.organization_id, scope) === key) writeSavedFilter(key, value);
  }, [key, value]);
  return [value, next => setStored(current => ({ key, value: typeof next === 'function'
    ? (next as (value: T) => T)(current.key === key ? current.value : value) : next }))];
}
