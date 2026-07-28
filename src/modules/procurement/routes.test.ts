import { describe, expect, it } from 'vitest';
import { isProcurementTab } from './routes';

describe('procurement workspace routing', () => {
  it.each(['overview', 'tenders', 'pipeline', 'supplier-profile', 'services'])('owns the %s subscriber tab', (tab) => {
    expect(isProcurementTab(tab)).toBe(true);
  });

  it.each(['admin-tender-review', 'campaign-builder', 'content-cms', 'billing'])('does not claim the %s tab', (tab) => {
    expect(isProcurementTab(tab)).toBe(false);
  });
});

