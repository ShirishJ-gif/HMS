import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { getStoredAccessToken } from '../api/session';

// Navigation memory only: cleared when the signed-in session changes.
const values = new Map<string, unknown>();
let session: string | null = null;
export function useWorkspaceState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const token = getStoredAccessToken();
  if (session !== token) {
    values.clear();
    session = token;
  }
  const read = () =>
    values.has(key) ? (values.get(key) as T) : typeof initial === 'function' ? (initial as () => T)() : initial;
  const [stored, setStored] = useState(() => ({ key, value: read() }));
  const value = stored.key === key ? stored.value : read();
  useEffect(() => {
    values.set(key, value);
  }, [key, value]);
  return [
    value,
    (next) =>
      setStored((current) => ({
        key,
        value:
          typeof next === 'function' ? (next as (value: T) => T)(current.key === key ? current.value : value) : next,
      })),
  ];
}
