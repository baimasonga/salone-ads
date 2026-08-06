import type { SubscriberType } from '../../domain/subscriptions/subscriberTypes';

export type SubscriberLifecycleStatus = 'active' | 'suspended' | 'recovery_pending' | 'closed' | 'purged';

export interface AdminSubscriberRecord {
  id: string;
  name: string;
  organizationType: string;
  subscriberType: SubscriberType;
  status: SubscriberLifecycleStatus;
  statusReason: string | null;
  country: string;
  district: string | null;
  city: string | null;
  website: string | null;
  phone: string | null;
  whatsapp: string | null;
  description: string | null;
  audienceScope: string | null;
  primaryObjective: string | null;
  monthlyBudgetSle: number | null;
  subscriberDetails: Record<string, string>;
  isProtected: boolean;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  memberCount: number;
  subscriptionId: string | null;
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  billingCycle: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  recoverableUntil: string | null;
  purgedAt: string | null;
  recoveryRequestId: string | null;
  recoveryReason: string | null;
  totalCount: number;
}

export interface SubscriberFilters {
  status: SubscriberLifecycleStatus | null;
  subscriberType: SubscriberType | null;
  search: string;
  page: number;
  pageSize: number;
}

async function getSupabase() { return (await import('../../lib/supabaseClient')).supabase; }

export async function fetchAdminSubscribers(filters: SubscriberFilters): Promise<{ items: AdminSubscriberRecord[]; total: number }> {
  const supabase = await getSupabase();
  const [{ data, error }, { data: protectedRows, error: protectedError }] = await Promise.all([
    supabase.rpc('admin_list_subscribers', {
      p_status: filters.status,
      p_subscriber_type: filters.subscriberType,
      p_search: filters.search.trim() || null,
      p_limit: filters.pageSize,
      p_offset: filters.page * filters.pageSize,
    }),
    supabase.rpc('admin_list_protected_organization_ids'),
  ]);
  if (error) throw error;
  if (protectedError) throw protectedError;
  const protectedIds = new Set((protectedRows ?? []).map((row: any) => row.org_id));
  const items = (data ?? []).map((row: any): AdminSubscriberRecord => ({
    id: row.id, name: row.name, organizationType: row.organization_type,
    subscriberType: row.subscriber_type, status: row.status, statusReason: row.status_reason,
    country: row.country, district: row.district, city: row.city, website: row.website,
    phone: row.phone, whatsapp: row.whatsapp, description: row.description,
    audienceScope: row.audience_scope, primaryObjective: row.primary_objective,
    monthlyBudgetSle: row.monthly_budget_sle === null ? null : Number(row.monthly_budget_sle),
    subscriberDetails: row.subscriber_details ?? {}, isProtected: protectedIds.has(row.id), ownerId: row.owner_id,
    ownerName: row.owner_name, ownerEmail: row.owner_email, memberCount: Number(row.member_count),
    subscriptionId: row.subscription_id, planCode: row.plan_code, planName: row.plan_name,
    subscriptionStatus: row.subscription_status, billingCycle: row.billing_cycle,
    currentPeriodEnd: row.current_period_end, createdAt: row.created_at, updatedAt: row.updated_at,
    closedAt: row.closed_at, recoverableUntil: row.recoverable_until, purgedAt: row.purged_at,
    recoveryRequestId: row.recovery_request_id, recoveryReason: row.recovery_reason,
    totalCount: Number(row.total_count),
  }));
  return { items, total: items[0]?.totalCount ?? 0 };
}

export async function transitionOrganization(id: string, action: 'suspend' | 'reactivate' | 'close', reason: string) {
  const { executeBackendCommand } = await import('../../lib/commandApi');
  await executeBackendCommand('organization.transition', { orgId: id, action, reason });
}

export async function purgeSubscriber(id: string, confirmation: string, reason: string) {
  const { executeBackendCommand } = await import('../../lib/commandApi');
  await executeBackendCommand('organization.purge', { orgId: id, confirmation, reason });
}

export async function decideOrganizationRecovery(id: string, approve: boolean, note: string) {
  const { executeBackendCommand } = await import('../../lib/commandApi');
  await executeBackendCommand('organization.recovery.decide', { requestId: id, approve, note });
}

export function exportSubscribersCsv(items: AdminSubscriberRecord[]): string {
  const rows = [
    ['Organization','Subscriber type','Status','Owner','Owner email','Phone','WhatsApp','Country','District','Plan','Subscription status','Registered'],
    ...items.map(item => [item.name,item.subscriberType,item.status,item.ownerName ?? '',item.ownerEmail ?? '',item.phone ?? '',item.whatsapp ?? '',item.country,item.district ?? '',item.planName ?? '',item.subscriptionStatus ?? '',item.createdAt]),
  ];
  return rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
}
