import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryCache, scopedQueryKey } from './query-cache';

test('navigation reuses recent data and simultaneous mounts share a request', async () => {
  const cache = new QueryCache();
  let calls = 0;
  const load = async () => { calls++; return ['room']; };
  const [one, two] = await Promise.all([cache.load('rooms', load), cache.load('rooms', load)]);
  assert.equal(calls, 1);
  assert.equal(one, two);
  assert.equal(await cache.load('rooms', load), one);
  assert.equal(cache.peek<string[]>('rooms')?.data, one);
  assert.equal(calls, 1);
});

test('expired data stays available during a refresh and then updates', async () => {
  let now = 1000;
  const cache = new QueryCache(60_000, () => now);
  await cache.load('report', async () => 10);
  now += 60_000;
  assert.deepEqual(cache.peek('report'), { data: 10, fresh: false });
  await cache.load('report', async () => 20);
  assert.deepEqual(cache.peek('report'), { data: 20, fresh: true });
});

test('sessions, property scopes and date filters do not share results', async () => {
  const cache = new QueryCache();
  const key = (session: string, property: string, date: string) => scopedQueryKey(session, JSON.stringify(['report', property, date]));
  await cache.load(key('alice', 'villa', '2026-10-01'), async () => 100);
  assert.equal(cache.peek(key('bob', 'villa', '2026-10-01')), null);
  assert.equal(cache.peek(key('alice', 'hotel', '2026-10-01')), null);
  assert.equal(cache.peek(key('alice', 'villa', '2026-10-02')), null);
});

test('mutations discard cached results and prevent older in-flight reads from restoring them', async () => {
  const cache = new QueryCache();
  let finish!: (value: string) => void;
  const old = cache.load('bookings', () => new Promise<string>(resolve => { finish = resolve; }));
  await Promise.resolve();
  let notifications = 0;
  const unsubscribe = cache.subscribe(() => notifications++);
  cache.invalidate();
  await cache.load('bookings', async () => 'edited');
  finish('before edit');
  await old;
  assert.equal(cache.peek('bookings')?.data, 'edited');
  assert.equal(notifications, 1);
  unsubscribe();
});

test('manual refresh invalidates only its query; failed reads can be retried', async () => {
  const cache = new QueryCache();
  await cache.load('report', async () => 1);
  await cache.load('properties', async () => ['villa']);
  cache.invalidate('report');
  assert.equal(cache.peek('report'), null);
  assert.equal(cache.peek('properties')?.fresh, true);
  await assert.rejects(cache.load('report', async () => { throw new Error('Offline'); }));
  assert.equal(await cache.load('report', async () => 2), 2);
});

test('memory is bounded and logout clears all results', async () => {
  const cache = new QueryCache(60_000, Date.now, 2);
  for (const key of ['a', 'b', 'c']) await cache.load(key, async () => key);
  assert.equal(cache.peek('a'), null);
  cache.invalidate();
  assert.equal(cache.peek('b'), null);
  assert.equal(cache.peek('c'), null);
});
