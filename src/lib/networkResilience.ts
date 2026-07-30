const CACHE_PREFIX = 'manohub:resilience:v1:';

interface CacheEnvelope<T> {
  savedAt: number;
  value: T;
}
export interface CachedValue<T> {
  savedAt: number;
  value: T;
}

export function resilienceCacheKey(scope: string): string {
  return `${CACHE_PREFIX}${scope}`;
}

export function readResilienceCache<T>(
  scope: string,
  maxAgeMs: number,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
  now = Date.now(),
): CachedValue<T> | null {
  try {
    const raw = storage.getItem(resilienceCacheKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (
      typeof parsed.savedAt !== 'number'
      || parsed.savedAt > now
      || now - parsed.savedAt > maxAgeMs
    ) {
      return null;
    }
    return { savedAt: parsed.savedAt, value: parsed.value };
  } catch {
    return null;
  }
}

// Scopes derived from user input (a search filter combination, for example)
// would otherwise mint an unbounded number of keys that are never reclaimed,
// silently exhausting the storage quota. Keep only the newest entries.
const MAX_CACHE_ENTRIES = 40;

type EvictableStorage = Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'getItem' | 'removeItem' | 'key' | 'length'>>;

function cacheKeys(storage: EvictableStorage): string[] {
  if (typeof storage.key !== 'function' || typeof storage.length !== 'number') return [];
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(CACHE_PREFIX)) keys.push(key);
  }
  return keys;
}

function evictOldestEntries(storage: EvictableStorage, keep: number): void {
  if (typeof storage.getItem !== 'function' || typeof storage.removeItem !== 'function') return;
  const entries = cacheKeys(storage).map((key) => {
    let savedAt = 0;
    try {
      savedAt = Number(JSON.parse(storage.getItem!(key) ?? '{}').savedAt) || 0;
    } catch {
      savedAt = 0; // unparseable entries are evicted first
    }
    return { key, savedAt };
  });
  if (entries.length <= keep) return;
  entries.sort((a, b) => a.savedAt - b.savedAt);
  for (const entry of entries.slice(0, entries.length - keep)) {
    try {
      storage.removeItem!(entry.key);
    } catch {
      // Best effort.
    }
  }
}

export function writeResilienceCache<T>(
  scope: string,
  value: T,
  storage: EvictableStorage = window.localStorage,
  now = Date.now(),
): void {
  const payload = JSON.stringify({ savedAt: now, value });
  try {
    evictOldestEntries(storage, MAX_CACHE_ENTRIES - 1);
    storage.setItem(resilienceCacheKey(scope), payload);
  } catch {
    // Quota exhausted or storage unavailable. Drop everything we own and make
    // one more attempt so caching recovers instead of silently staying broken.
    try {
      evictOldestEntries(storage, 0);
      storage.setItem(resilienceCacheKey(scope), payload);
    } catch {
      // Storage is genuinely unusable. Network operations must remain usable.
    }
  }
}

export function removeResilienceCache(
  scope: string,
  storage: Pick<Storage, 'removeItem'> = window.localStorage,
): void {
  try {
    storage.removeItem(resilienceCacheKey(scope));
  } catch {
    // Clearing a draft/cache is best effort.
  }
}

const TRANSIENT_MESSAGE = /network|fetch|timeout|timed out|connection|offline|load failed/i;

/**
 * Drop every cached value this module owns. Call on sign-out so unsubmitted
 * drafts and cached results do not leak to the next person using the browser,
 * which matters on the shared and public devices this product targets.
 */
export function clearAllResilienceCaches(
  storage: EvictableStorage = window.localStorage,
): void {
  try {
    evictOldestEntries(storage, 0);
  } catch {
    // Best effort.
  }
}

export function isTransientNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  // A failed fetch surfaces as a TypeError, but so does an ordinary
  // programming mistake. Only treat it as transient when the message also
  // looks like a network failure, otherwise real bugs get retried and
  // reported to the user as connectivity problems.
  return TRANSIENT_MESSAGE.test(message);
}

export async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; delayMs?: number; online?: () => boolean } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 2);
  const delayMs = Math.max(0, options.delayMs ?? 250);
  const online = options.online ?? (() => typeof navigator === 'undefined' || navigator.onLine);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (!online()) throw new Error('You are offline.');
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientNetworkError(error)) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
}
