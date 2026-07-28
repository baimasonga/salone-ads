import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from './supabaseClient';
import { fetchAuditEvents } from './auditApi';

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

function resolvedQuery<T>(result: T) {
  const query: Record<string, any> = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    eq: vi.fn(() => query),
    ilike: vi.fn(() => query),
    in: vi.fn(() => query),
    then: (resolve: (value: T) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

describe('fetchAuditEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads organization names separately without relying on an audit foreign key', async () => {
    const auditQuery = resolvedQuery({
      data: [{
        id: 'audit-1',
        actor_id: 'actor-1',
        org_id: 'org-1',
        action: 'tender.approved',
        entity_type: 'opportunity',
        entity_id: 'opportunity-1',
        metadata: {},
        created_at: '2026-07-28T15:00:00.000Z',
      }],
      error: null,
    });
    const organizationQuery = resolvedQuery({
      data: [{ id: 'org-1', name: 'Infrastructure Agency' }],
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => (
      table === 'audit_logs' ? auditQuery : organizationQuery
    ) as never);

    const events = await fetchAuditEvents();

    expect(auditQuery.select).toHaveBeenCalledWith(
      'id, actor_id, org_id, action, entity_type, entity_id, metadata, created_at',
    );
    expect(organizationQuery.in).toHaveBeenCalledWith('id', ['org-1']);
    expect(events[0].organizationName).toBe('Infrastructure Agency');
  });

  it('still returns audit evidence when organization enrichment is unavailable', async () => {
    const auditQuery = resolvedQuery({
      data: [{
        id: 'audit-2',
        actor_id: null,
        org_id: 'deleted-org',
        action: 'tender.submitted',
        entity_type: 'opportunity',
        entity_id: 'opportunity-2',
        metadata: {},
        created_at: '2026-07-28T16:00:00.000Z',
      }],
      error: null,
    });
    const organizationQuery = resolvedQuery({ data: null, error: { message: 'Unavailable' } });

    vi.mocked(supabase.from).mockImplementation((table: string) => (
      table === 'audit_logs' ? auditQuery : organizationQuery
    ) as never);

    const events = await fetchAuditEvents();

    expect(events[0]).toMatchObject({
      organizationId: 'deleted-org',
      organizationName: null,
    });
  });
});
