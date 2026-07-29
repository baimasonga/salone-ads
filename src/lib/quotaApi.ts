import { supabase } from './supabaseClient';

export interface QuotaSnapshot {
  featureKey: string; featureLabel: string; limitValue: number;
  currentValue: number; remainingValue: number; usagePercent: number; isOverride: boolean;
}

export async function fetchQuotaSnapshot(orgId: string): Promise<QuotaSnapshot[]> {
  const { data, error } = await supabase.rpc('get_org_quota_snapshot', { p_org_id: orgId });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    featureKey: row.feature_key, featureLabel: row.feature_label, limitValue: Number(row.limit_value),
    currentValue: Number(row.current_value), remainingValue: Number(row.remaining_value),
    usagePercent: Number(row.usage_percent), isOverride: row.is_override,
  }));
}

export async function setQuotaOverride(orgId: string, featureKey: string, limitValue: number, reason: string): Promise<void> {
  const { error } = await supabase.rpc('set_org_quota_override', {
    p_org_id: orgId, p_feature_key: featureKey, p_limit_value: limitValue, p_reason: reason,
  });
  if (error) throw error;
}

