import { beforeEach, describe, expect, it } from 'vitest';
import {
  getOrCreatePublicVisitorToken,
  getPublicVisitorTokenHash,
} from './publicVisitor';

describe('public visitor identity', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('reuses one opaque browser token', () => {
    const first = getOrCreatePublicVisitorToken();
    const second = getOrCreatePublicVisitorToken();

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('sends only a SHA-256 hash to measurement RPCs', async () => {
    const raw = getOrCreatePublicVisitorToken();
    const hashed = await getPublicVisitorTokenHash();

    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toContain(raw);
  });
});
