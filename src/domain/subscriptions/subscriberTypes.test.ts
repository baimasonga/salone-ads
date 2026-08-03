import { describe, expect, it } from 'vitest';
import { isSubscriberType, SUBSCRIBER_TYPES } from './subscriberTypes';

describe('registration subscriber types', () => {
  it('maps customer-facing choices to distinct plans', () => {
    expect(Object.fromEntries(SUBSCRIBER_TYPES.map((type) => [type.value, type.planCode]))).toEqual({
      viewer: 'professional', publisher: 'business', advertiser: 'advertiser', free: 'free',
    });
  });

  it('accepts only supported registration values', () => {
    for (const type of SUBSCRIBER_TYPES) expect(isSubscriberType(type.value)).toBe(true);
    expect(isSubscriberType('admin')).toBe(false);
    expect(isSubscriberType('enterprise')).toBe(false);
  });
});
