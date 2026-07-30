import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  allowedCampaignTransitions,
  campaignStatusFromDb,
  campaignStatusOptions,
  campaignStatusToDb,
  campaignTransitionRequiresReason,
  canTransitionCampaign,
  type CampaignDbStatus,
  type CampaignUiStatus,
} from './campaignStatus';

// Parse the authoritative catalogue straight out of the migrations so the
// client-side table cannot drift away from what the database will accept.
function catalogueFromMigrations(): Map<string, boolean> {
  const rules = new Map<string, boolean>();
  for (const file of [
    'migrations/manohub-new-project/47_central_workflow_state_machines.sql',
    'migrations/manohub-new-project/51_lifecycle_and_quota_correctness.sql',
  ]) {
    const sql = readFileSync(resolve(process.cwd(), file), 'utf8');
    const row = /\('campaign','([a-z_]+)','([a-z_]+)',(true|false),(?:true|false),'[^']*'\)/g;
    for (const match of sql.matchAll(row)) {
      rules.set(`${match[1]}->${match[2]}`, match[3] === 'true');
    }
  }
  return rules;
}

const catalogue = catalogueFromMigrations();
const UI_STATUSES: CampaignUiStatus[] = [
  'Draft', 'Planning', 'Approved', 'Scheduled', 'Active', 'Completed', 'Failed',
];

describe('campaign status mapping', () => {
  it('maps every workspace label onto a distinct database status', () => {
    const dbStatuses = UI_STATUSES.map(campaignStatusToDb);
    expect(new Set(dbStatuses).size).toBe(UI_STATUSES.length);
  });

  it('round-trips through the database vocabulary', () => {
    for (const status of UI_STATUSES) {
      expect(campaignStatusFromDb(campaignStatusToDb(status))).toBe(status);
    }
  });

  it('falls back to Draft for an unknown database status', () => {
    expect(campaignStatusFromDb('something_else')).toBe('Draft');
    expect(campaignStatusFromDb(null)).toBe('Draft');
  });
});

describe('campaign transition catalogue', () => {
  it('parsed the migration catalogue', () => {
    expect(catalogue.size).toBeGreaterThan(10);
  });

  it('never offers a transition the database would reject', () => {
    for (const from of UI_STATUSES) {
      for (const to of allowedCampaignTransitions(from)) {
        const key = `${campaignStatusToDb(from)}->${campaignStatusToDb(to)}`;
        expect(catalogue.has(key), `${key} is offered but absent from the migrations`).toBe(true);
      }
    }
  });

  it('offers every transition the database allows', () => {
    for (const key of catalogue.keys()) {
      const [from, to] = key.split('->') as [CampaignDbStatus, CampaignDbStatus];
      const offered = allowedCampaignTransitions(campaignStatusFromDb(from));
      expect(offered, `${key} is allowed by the migrations but never offered`)
        .toContain(campaignStatusFromDb(to));
    }
  });

  it('agrees with the migrations about which transitions need a reason', () => {
    for (const [key, requiresReason] of catalogue) {
      const [from, to] = key.split('->') as [CampaignDbStatus, CampaignDbStatus];
      expect(
        campaignTransitionRequiresReason(campaignStatusFromDb(from), campaignStatusFromDb(to)),
        `${key} reason requirement disagrees with the migrations`,
      ).toBe(requiresReason);
    }
  });

  it('treats Completed as terminal', () => {
    expect(allowedCampaignTransitions('Completed')).toEqual([]);
    expect(campaignStatusOptions('Completed')).toEqual(['Completed']);
  });

  it('always includes the current status in the option list exactly once', () => {
    for (const status of UI_STATUSES) {
      const options = campaignStatusOptions(status);
      expect(options[0]).toBe(status);
      expect(options.filter((option) => option === status)).toHaveLength(1);
    }
  });

  it('rejects the transitions that used to fail at the trigger', () => {
    // Every one of these was selectable in the workspace dropdown and raised
    // "Invalid campaign transition" once migration 47 began enforcing.
    expect(canTransitionCampaign('Draft', 'Active')).toBe(false);
    expect(canTransitionCampaign('Draft', 'Approved')).toBe(false);
    expect(canTransitionCampaign('Active', 'Draft')).toBe(false);
    expect(canTransitionCampaign('Completed', 'Active')).toBe(false);
    expect(canTransitionCampaign('Failed', 'Active')).toBe(false);
  });

  it('allows the ordinary review-queue moves', () => {
    expect(canTransitionCampaign('Draft', 'Planning')).toBe(true);
    expect(canTransitionCampaign('Planning', 'Approved')).toBe(true);
    expect(canTransitionCampaign('Approved', 'Active')).toBe(true);
    expect(canTransitionCampaign('Active', 'Scheduled')).toBe(true);
    expect(canTransitionCampaign('Scheduled', 'Active')).toBe(true);
  });
});
