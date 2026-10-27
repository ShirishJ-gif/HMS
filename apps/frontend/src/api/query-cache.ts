type Entry<T> = { data?: T; updatedAt: number; pending?: Promise<T> };

// Memory only; callers include the signed-in session and every query filter in
// the key. Navigation can share an in-flight read without cancelling it.
export class QueryCache {
  private entries = new Map<string, Entry<unknown>>();
  private listeners = new Set<() => void>();
  private revision = 0;

  constructor(private readonly maxAge = 60_000, private readonly now = Date.now, private readonly maxEntries = 100) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getRevision = () => this.revision;

  peek<T>(key: string) {
    const entry = this.entries.get(key) as Entry<T> | undefined;
    return entry?.data === undefined ? null : {
      data: entry.data,
      fresh: this.now() - entry.updatedAt < this.maxAge,
    };
  }

  load<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.peek<T>(key);
    if (cached?.fresh) return Promise.resolve(cached.data);
    const existing = this.entries.get(key) as Entry<T> | undefined;
    if (existing?.pending) return existing.pending;
    const entry: Entry<T> = { data: existing?.data, updatedAt: existing?.updatedAt ?? 0 };
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    entry.pending = Promise.resolve().then(loader).then(data => {
      // A mutation or a forced refresh may have invalidated this read while it
      // was in flight. Never let it repopulate the cache with an older result.
      if (this.entries.get(key) === entry) {
        entry.data = data;
        entry.updatedAt = this.now();
      }
      return data;
    }).finally(() => { entry.pending = undefined; });
    return entry.pending;
  }

  invalidate(key?: string) {
    if (key === undefined) this.entries.clear();
    else this.entries.delete(key);
    this.revision++;
    this.listeners.forEach(listener => listener());
  }
}

export const queryCache = new QueryCache();
export const scopedQueryKey = (session: string | null, key: string) => JSON.stringify([session, key]);
