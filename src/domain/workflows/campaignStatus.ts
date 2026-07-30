import type { Campaign } from '../../types';

export type CampaignUiStatus = Campaign['status'];
export type CampaignDbStatus =
  | 'draft' | 'submitted' | 'approved' | 'active' | 'paused' | 'completed' | 'rejected';

// The workspace vocabulary and the ad_campaigns.status vocabulary are a
// bijection. Two labels previously collapsed onto 'approved', so selecting
// "Scheduled" silently converted a paused campaign into an approved one.
const UI_TO_DB: Record<CampaignUiStatus, CampaignDbStatus> = {
  Draft: 'draft',
  Planning: 'submitted',
  Approved: 'approved',
  Scheduled: 'paused',
  Active: 'active',
  Completed: 'completed',
  Failed: 'rejected',
};

const DB_TO_UI = Object.fromEntries(
  Object.entries(UI_TO_DB).map(([ui, db]) => [db, ui as CampaignUiStatus]),
) as Record<CampaignDbStatus, CampaignUiStatus>;

export function campaignStatusToDb(status: CampaignUiStatus): CampaignDbStatus {
  return UI_TO_DB[status];
}

export function campaignStatusFromDb(status: string | null | undefined): CampaignUiStatus {
  return DB_TO_UI[(status ?? '') as CampaignDbStatus] ?? 'Draft';
}

// Mirrors the 'campaign' rows of public.workflow_transition_rules (migrations
// 47 and 51). The database is authoritative and rejects anything absent here,
// so the workspace must not offer transitions the state machine will refuse.
const ALLOWED_DB_TRANSITIONS: Record<CampaignDbStatus, readonly CampaignDbStatus[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected', 'draft'],
  approved: ['active', 'paused', 'completed', 'draft', 'submitted', 'rejected'],
  active: ['paused', 'completed'],
  paused: ['active', 'completed'],
  completed: [],
  rejected: ['draft', 'submitted'],
};

// Transitions the database accepts only when a reason is supplied.
const REASON_REQUIRED_DB_TRANSITIONS: ReadonlySet<string> = new Set([
  'submitted->rejected',
  'approved->rejected',
]);

export function allowedCampaignTransitions(current: CampaignUiStatus): CampaignUiStatus[] {
  return ALLOWED_DB_TRANSITIONS[campaignStatusToDb(current)].map(campaignStatusFromDb);
}

/** The current status plus every status it may legally move to. */
export function campaignStatusOptions(current: CampaignUiStatus): CampaignUiStatus[] {
  return [current, ...allowedCampaignTransitions(current)];
}

export function canTransitionCampaign(from: CampaignUiStatus, to: CampaignUiStatus): boolean {
  return from === to || allowedCampaignTransitions(from).includes(to);
}

export function campaignTransitionRequiresReason(
  from: CampaignUiStatus,
  to: CampaignUiStatus,
): boolean {
  return REASON_REQUIRED_DB_TRANSITIONS.has(
    `${campaignStatusToDb(from)}->${campaignStatusToDb(to)}`,
  );
}
