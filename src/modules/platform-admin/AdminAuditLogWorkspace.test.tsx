import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAuditEvents } from '../../lib/auditApi';
import { AdminAuditLogWorkspace } from './AdminAuditLogWorkspace';

vi.mock('../../lib/auditApi', () => ({
  auditActionLabel: (action: string) => action.replace('.', ' · ').replace(/_/g, ' '),
  fetchAuditEvents: vi.fn(),
}));

const event = {
  id: 'audit-1',
  actorId: 'actor-123456789',
  organizationId: 'org-1',
  organizationName: 'Infrastructure Agency',
  action: 'tender.approved',
  entityType: 'opportunity',
  entityId: 'opportunity-1',
  metadata: { reason: 'Verified and complete' },
  createdAt: '2026-07-28T15:00:00.000Z',
};

describe('AdminAuditLogWorkspace', () => {
  beforeEach(() => {
    vi.mocked(fetchAuditEvents).mockResolvedValue([event]);
  });

  it('renders immutable audit events returned by the admin query', async () => {
    render(<AdminAuditLogWorkspace />);

    expect(await screen.findByText('Infrastructure Agency')).toBeInTheDocument();
    expect(screen.getAllByText('tender · approved')).toHaveLength(2);
    expect(screen.getByText('Verified and complete')).toBeInTheDocument();
    expect(fetchAuditEvents).toHaveBeenCalledWith({
      action: undefined,
      entityId: undefined,
      limit: 100,
    });
  });

  it('applies action and entity filters to subsequent queries', async () => {
    const user = userEvent.setup();
    render(<AdminAuditLogWorkspace />);
    await screen.findByText('Infrastructure Agency');

    await user.selectOptions(screen.getByLabelText('Action'), 'tender.rejected');
    await user.type(screen.getByLabelText('Entity ID'), 'opportunity-9{Enter}');

    await waitFor(() => {
      expect(fetchAuditEvents).toHaveBeenLastCalledWith({
        action: 'tender.rejected',
        entityId: 'opportunity-9',
        limit: 100,
      });
    });
  });
});
