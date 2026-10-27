type Entry<T> = { value: T; expiresAt: number };
const store = new Map<string, Entry<unknown>>();
export const memoryCache = {
  get<T>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry.value as T;
  },
  set<T>(key: string, value: T, ttlMs: number) {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  },
  clearByPrefix(prefix: string) {
    for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
  },
};
