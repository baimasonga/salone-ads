/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lead } from '../types';

export type LeadPriority = 'Hot' | 'Warm' | 'Cold';

// Later pipeline stages get weighted higher (closer to closing = more
// urgent to follow up); Converted/Lost are dead ends and always score 0
// so they sink to the bottom instead of competing for attention.
const STAGE_WEIGHT: Record<Lead['status'], number> = {
  New: 0.5,
  Contacted: 0.7,
  Qualified: 0.9,
  'Proposal Sent': 1,
  Converted: 0,
  Lost: 0,
};

// Deterministic, explainable scoring -- not AI. Blends pipeline stage
// (50%), recency (30%, decaying to ~0 by day 21 since stale leads lose
// urgency), and deal size (20%, log-scaled so one huge lead doesn't
// permanently dominate the list).
export function computeLeadScore(lead: Lead): number {
  if (lead.status === 'Converted' || lead.status === 'Lost') return 0;

  const createdAt = lead.createdAt ? new Date(lead.createdAt).getTime() : NaN;
  const ageDays = Number.isFinite(createdAt) ? Math.max(0, (Date.now() - createdAt) / 86400000) : 21;
  const recencyScore = Math.max(0, 1 - ageDays / 21);

  const valueScore = lead.estimatedValue > 0 ? Math.min(1, Math.log10(lead.estimatedValue + 1) / 7) : 0.15;

  const stageScore = STAGE_WEIGHT[lead.status] ?? 0.5;

  return stageScore * 0.5 + recencyScore * 0.3 + valueScore * 0.2;
}

export function leadPriorityLabel(score: number): LeadPriority {
  if (score >= 0.65) return 'Hot';
  if (score >= 0.35) return 'Warm';
  return 'Cold';
}
