import { describe, expect, it } from 'vitest';
import { resolveProcurementTier } from './model';

describe('procurement subscription tier resolution', () => {
  it('prioritizes publishing access over viewer access', () => {
    expect(resolveProcurementTier(true, true)).toBe('Publisher');
    expect(resolveProcurementTier(true, false)).toBe('Publisher');
  });

  it('classifies detail-only access as viewer', () => {
    expect(resolveProcurementTier(false, true)).toBe('Viewer');
  });

  it('falls back to the free tier when no entitlement is present', () => {
    expect(resolveProcurementTier(false, false)).toBe('Free');
  });
});

