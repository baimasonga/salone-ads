import { fetchMyOrganization } from '../api';
import { supabase } from '../supabaseClient';

export type ResponseKind = 'interest' | 'intent_to_bid';

export interface OpportunityResponse {
  id: string;
  opportunityId: string;
  orgId: string;
  orgName?: string;
  kind: ResponseKind;
  note: string | null;
  status: 'active' | 'withdrawn';
  createdAt: string;
}

function mapResponse(row: any): OpportunityResponse {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    orgId: row.org_id,
    orgName: row.organizations?.name,
    kind: row.kind,
    note: row.note ?? null,
    status: row.status,
    createdAt: row.created_at,
  };
}

// Use the same verified, persisted organization context as the dashboard.
// fetchMyOrganization validates the stored id against the current user's
// visible memberships before returning it.
export async function fetchMyOrgId(): Promise<string | null> {
  const organization = await fetchMyOrganization();
  return organization?.id ?? null;
}

export async function fetchResponseCount(opportunityId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_opportunity_response_count', { p_opportunity_id: opportunityId });
  if (error) return 0;
  return Number(data ?? 0);
}

export async function fetchMyResponse(opportunityId: string, orgId: string): Promise<OpportunityResponse | null> {
  const { data, error } = await supabase
    .from('opportunity_responses')
    .select('id, opportunity_id, org_id, kind, note, status, created_at')
    .eq('opportunity_id', opportunityId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapResponse(data) : null;
}

export async function submitResponse(input: { opportunityId: string; orgId: string; kind: ResponseKind; note?: string | null }): Promise<OpportunityResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('opportunity_responses')
    .upsert(
      {
        opportunity_id: input.opportunityId,
        org_id: input.orgId,
        user_id: user?.id ?? null,
        kind: input.kind,
        note: input.note ?? null,
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'opportunity_id,org_id' },
    )
    .select('id, opportunity_id, org_id, kind, note, status, created_at')
    .single();
  if (error) throw error;
  return mapResponse(data);
}

export async function withdrawResponse(id: string): Promise<void> {
  const { error } = await supabase.from('opportunity_responses').update({ status: 'withdrawn', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function fetchOpportunityResponses(opportunityId: string): Promise<OpportunityResponse[]> {
  const { data, error } = await supabase
    .from('opportunity_responses')
    .select('id, opportunity_id, org_id, kind, note, status, created_at, organizations(name)')
    .eq('opportunity_id', opportunityId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapResponse);
}
