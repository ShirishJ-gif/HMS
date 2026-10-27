import assert from 'node:assert/strict';
import test from 'node:test';
import { clearSavedFilters, readSavedFilter, savedFilterKey, writeSavedFilter } from './saved-filters';
import { isReportingSelection, reportingRange } from './reporting-period';
import { clearStoredSession, storeAuthSession, userStorageKey } from '../api/session';
import type { AuthResponse } from '../api/types';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
const initial = { preset: 'today' as const, range: reportingRange('today', '2026-10-09') };
const custom = { preset: 'custom' as const, range: { from: '2026-09-02', to: '2026-09-08' } };

test('saved selections survive reads and are isolated by page, property and account', () => {
  const storage = new MemoryStorage();
  const key = savedFilterKey('alice', 'org', 'dashboard:live:villa:period');
  writeSavedFilter(key, custom, storage);
  assert.deepEqual(readSavedFilter(key, initial, isReportingSelection, storage), custom);
  for (const other of [savedFilterKey('bob', 'org', 'dashboard:live:villa:period'), savedFilterKey('alice', 'other-org', 'dashboard:live:villa:period'), savedFilterKey('alice', 'org', 'dashboard:live:hotel:period'), savedFilterKey('alice', 'org', 'reports:villa:period')]) {
    assert.deepEqual(readSavedFilter(other, initial, isReportingSelection, storage), initial);
  }
});

test('invalid stored periods and unavailable storage fall back safely', () => {
  const storage = new MemoryStorage();
  for (const value of ['broken', JSON.stringify({ preset: 'unsupported', range: custom.range }), JSON.stringify({ preset: 'custom', range: { from: '2026-02-30', to: '2026-03-05' } }), JSON.stringify({ preset: 'custom', range: { from: '2026-10-09', to: '2026-10-08' } }), JSON.stringify({ preset: 'custom', range: { from: '2024-01-01', to: '2026-01-01' } })]) {
    storage.setItem('key', value);
    assert.deepEqual(readSavedFilter('key', initial, isReportingSelection, storage), initial);
  }
  assert.deepEqual(readSavedFilter('key', initial, isReportingSelection, null), initial);
  assert.doesNotThrow(() => writeSavedFilter('key', custom, null));
});

test('logout clears saved filters without removing unrelated preferences', () => {
  const storage = new MemoryStorage();
  writeSavedFilter(savedFilterKey('alice', null, 'dashboard:period'), custom, storage);
  writeSavedFilter(savedFilterKey('alice', null, 'reports:period'), custom, storage);
  storage.setItem('unrelated', 'keep');
  clearSavedFilters(storage);
  assert.deepEqual([...storage.values], [['unrelated', 'keep']]);
});

test('relative periods move across month/year boundaries while custom dates remain fixed', () => {
  assert.deepEqual(reportingRange('today', '2027-01-01'), { from: '2027-01-01', to: '2027-01-01' });
  assert.deepEqual(reportingRange('last_7', '2027-01-01'), { from: '2026-12-26', to: '2027-01-01' });
  assert.deepEqual(reportingRange('last_month', '2027-01-01'), { from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(reportingRange('last_month', '2024-03-01'), { from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(reportingRange('this_month', '2026-11-01'), { from: '2026-11-01', to: '2026-11-01' });
  assert.equal(isReportingSelection(custom), true);
  assert.deepEqual(custom.range, { from: '2026-09-02', to: '2026-09-08' });
});

test('session refresh preserves preferences; logout and account changes clear them', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage, sessionStorage: new MemoryStorage(), dispatchEvent() {} } });
  const auth = { access_token: 'one', refresh_token: 'refresh', user: { id: 'alice', organization_id: 'org' } } as AuthResponse;
  const key = savedFilterKey('alice', 'org', 'reports:villa:period');
  try {
    storeAuthSession(auth);
    writeSavedFilter(key, custom);
    storeAuthSession({ ...auth, access_token: 'renewed' });
    assert.deepEqual(readSavedFilter(key, initial, isReportingSelection), custom);
    storeAuthSession({ ...auth, user: { ...auth.user, id: 'bob' } });
    assert.equal(storage.getItem(key), null);
    writeSavedFilter(key, custom);
    clearStoredSession();
    assert.equal(storage.getItem(key), null);
    assert.equal(storage.getItem(userStorageKey), null);
    storeAuthSession(auth);
    assert.deepEqual(readSavedFilter(key, initial, isReportingSelection), initial);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
