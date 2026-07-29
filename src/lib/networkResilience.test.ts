import { describe, expect, it, vi } from 'vitest';
import {
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
});
