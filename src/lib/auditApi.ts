import { supabase } from './supabaseClient';

export interface AuditEvent {
  id: string;
  actorId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditEventFilters {
  action?: string;
  entityType?: string;
  organizationId?: string;
  entityId?: string;
  limit?: number;
}

export async function fetchAuditEvents(filters: AuditEventFilters = {}): Promise<AuditEvent[]> {
  let query = supabase
    .from('audit_logs')
    .select('id, actor_id, org_id, action, entity_type, entity_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(filters.limit ?? 100, 200));

  if (filters.action) query = query.eq('action', filters.action);
  if (filters.entityType) query = query.eq('entity_type', filters.entityType);
  if (filters.organizationId) query = query.eq('org_id', filters.organizationId);
  if (filters.entityId) query = query.ilike('entity_id', `%${filters.entityId}%`);

  const { data, error } = await query;
  if (error) throw error;

  const organizationIds = [...new Set(
    (data ?? [])
      .map((row: any) => row.org_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )];
  const organizationNames = new Map<string, string>();

  if (organizationIds.length > 0) {
    const { data: organizations } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', organizationIds);

    for (const organization of organizations ?? []) {
      organizationNames.set(organization.id, organization.name);
    }
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    actorId: row.actor_id,
    organizationId: row.org_id,
    organizationName: row.org_id ? organizationNames.get(row.org_id) ?? null : null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }));
}

export function auditActionLabel(action: string): string {
  return action
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .join(' · ');
}
