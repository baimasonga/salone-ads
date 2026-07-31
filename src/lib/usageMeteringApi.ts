export interface UsageMeteringSummary {
  organizationId: string;
  organizationName: string;
  meterKey: string;
  totalAmount: number;
  eventCount: number;
  lastEventAt: string;
}

export interface UsageMeteringEvent {
  id: string;
  organizationId: string;
  meterKey: string;
  amount: number;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  source: string;
  createdAt: string;
}

async function getSupabase() {
  return (await import('./supabaseClient')).supabase;
}

export async function fetchUsageMeteringSummary(days = 30): Promise<UsageMeteringSummary[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('admin_get_usage_metering_summary', { p_days: days });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    organizationId: row.org_id,
    organizationName: row.org_name,
    meterKey: row.meter_key,
    totalAmount: Number(row.total_amount),
    eventCount: Number(row.event_count),
    lastEventAt: row.last_event_at,
  }));
}

export async function fetchRecentUsageMeteringEvents(limit = 100): Promise<UsageMeteringEvent[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('organization_usage_events')
    .select('id,org_id,meter_key,amount,event_type,entity_type,entity_id,source,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 200));
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    organizationId: row.org_id,
    meterKey: row.meter_key,
    amount: Number(row.amount),
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    source: row.source,
    createdAt: row.created_at,
  }));
}
