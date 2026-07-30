import { describe, expect, it, vi } from 'vitest';
import {
  clearAllResilienceCaches,
  isTransientNetworkError,
  readResilienceCache,
  resilienceCacheKey,
  withNetworkRetry,
  writeResilienceCache,
} from './networkResilience';

describe('network resilience utilities', () => {
  it('round-trips a bounded cache entry and rejects stale data', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    writeResilienceCache('tenders:test', [{ id: '1' }], storage, 1_000);
    expect(values.has(resilienceCacheKey('tenders:test'))).toBe(true);
    expect(readResilienceCache<{ id: string }[]>('tenders:test', 500, storage, 1_400)?.value).toEqual([{ id: '1' }]);
    expect(readResilienceCache('tenders:test', 500, storage, 1_501)).toBeNull();
  });

  it('retries transient failures but not application failures', async () => {
    vi.useFakeTimers();
    const transient = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue('ok');
    const result = withNetworkRetry(transient, { delayMs: 10, online: () => true });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe('ok');
    expect(transient).toHaveBeenCalledTimes(2);

    const application = vi.fn().mockRejectedValue(new Error('Permission denied'));
    await expect(withNetworkRetry(application, { online: () => true })).rejects.toThrow('Permission denied');
    expect(application).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('recognizes browser-style connection failures', () => {
    expect(isTransientNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransientNetworkError(new Error('request timed out'))).toBe(true);
    expect(isTransientNetworkError(new Error('permission denied'))).toBe(false);
  });

  it('does not treat an ordinary programming TypeError as transient', () => {
    // A genuine bug is a TypeError too; retrying it and calling it a network
    // problem hides the defect and misleads the user.
    expect(isTransientNetworkError(new TypeError("undefined is not a function"))).toBe(false);
    expect(isTransientNetworkError(new TypeError("Cannot read properties of null"))).toBe(false);
  });
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe('resilience cache eviction', () => {
  it('bounds the number of stored entries', () => {
    const storage = memoryStorage();
    for (let i = 0; i < 60; i += 1) {
      writeResilienceCache(`search:${i}`, [i], storage, 1_000 + i);
    }
    expect(storage.values.size).toBeLessThanOrEqual(40);
    // The newest scope must survive.
    expect(readResilienceCache<number[]>('search:59', 10_000, storage, 1_060)?.value).toEqual([59]);
  });

  it('evicts the oldest entries first', () => {
    const storage = memoryStorage();
    for (let i = 0; i < 45; i += 1) {
      writeResilienceCache(`search:${i}`, [i], storage, 1_000 + i);
    }
    expect(readResilienceCache('search:0', 10_000, storage, 1_050)).toBeNull();
    expect(readResilienceCache('search:44', 10_000, storage, 1_050)).not.toBeNull();
  });

  it('recovers when the storage quota is exhausted', () => {
    const storage = memoryStorage();
    let full = true;
    const throwing = {
      ...storage,
      get length() { return storage.length; },
      setItem: (key: string, value: string) => {
        // Fail once while other entries are present, mimicking a quota error.
        if (full && storage.values.size > 0) { full = false; throw new Error('QuotaExceededError'); }
        storage.setItem(key, value);
      },
    };
    writeResilienceCache('first', [1], throwing, 1_000);
    writeResilienceCache('second', [2], throwing, 2_000);
    expect(readResilienceCache<number[]>('second', 10_000, throwing, 2_100)?.value).toEqual([2]);
  });

  it('clears every owned entry on sign-out', () => {
    const storage = memoryStorage();
    storage.setItem('unrelated.key', 'keep me');
    writeResilienceCache('tender-draft:user-1:org-1', { title: 'Private draft' }, storage, 1_000);
    writeResilienceCache('tender-search:{}', [], storage, 1_000);

    clearAllResilienceCaches(storage);

    expect(readResilienceCache('tender-draft:user-1:org-1', 10_000, storage, 1_100)).toBeNull();
    expect(readResilienceCache('tender-search:{}', 10_000, storage, 1_100)).toBeNull();
    expect(storage.values.get('unrelated.key')).toBe('keep me');
  });
});
