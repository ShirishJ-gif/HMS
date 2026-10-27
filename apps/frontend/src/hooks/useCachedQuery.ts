import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getApiErrorMessage } from '../api/client';
import { getStoredAccessToken } from '../api/session';
import { queryCache, scopedQueryKey } from '../api/query-cache';

type State<T> = { key: string; data: T | null; loading: boolean; error: string | null };

export function useCachedQuery<T>(key: string, load: () => Promise<T>, enabled = true) {
  const cacheKey = scopedQueryKey(getStoredAccessToken(), key);
  const revision = useSyncExternalStore(queryCache.subscribe, queryCache.getRevision);
  const loader = useRef(load);
  loader.current = load;
  const initial = (): State<T> => {
    const cached = enabled ? queryCache.peek<T>(cacheKey) : null;
    return { key: cacheKey, data: cached?.data ?? null, loading: enabled && !cached?.fresh, error: null };
  };
  const [state, setState] = useState<State<T>>(initial);
  const current = state.key === cacheKey ? state : initial();

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const cached = queryCache.peek<T>(cacheKey);
    if (cached?.fresh) {
      setState({ key: cacheKey, data: cached.data, loading: false, error: null });
      return;
    }
    setState(previous => ({ key: cacheKey, data: previous.key === cacheKey ? previous.data : cached?.data ?? null, loading: true, error: null }));
    const request = loader.current;
    queryCache.load(cacheKey, request)
      .then(data => { if (active && queryCache.getRevision() === revision) setState({ key: cacheKey, data, loading: false, error: null }); })
      .catch(error => { if (active && queryCache.getRevision() === revision) setState(previous => ({ ...previous, loading: false, error: getApiErrorMessage(error) })); });
    return () => { active = false; };
  }, [cacheKey, enabled, revision]);

  return {
    ...(enabled ? current : { data: null, loading: false, error: null }),
    refresh: () => queryCache.invalidate(cacheKey),
  };
}
