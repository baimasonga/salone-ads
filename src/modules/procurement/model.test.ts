import { describe, expect, it } from 'vitest';
import { resolveProcurementTier, retainValidTaxonomySelection } from './model';

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

describe('dependent taxonomy selection', () => {
  const districts = [{ id: 'western-area' }, { id: 'bo' }];

  it('retains a selection that belongs to the refreshed options', () => {
    expect(retainValidTaxonomySelection('bo', districts)).toBe('bo');
  });

  it('clears a selection that does not belong to the refreshed options', () => {
    expect(retainValidTaxonomySelection('kenema', districts)).toBe('');
  });
});
