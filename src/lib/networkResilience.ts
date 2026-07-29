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

export function writeResilienceCache<T>(
  scope: string,
  value: T,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
  now = Date.now(),
): void {
  try {
    storage.setItem(resilienceCacheKey(scope), JSON.stringify({ savedAt: now, value }));
  } catch {
    // Storage can be unavailable or full. Network operations must remain usable.
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

export function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|timeout|timed out|connection|offline|load failed/i.test(message);
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
