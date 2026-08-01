import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createServiceRequest,
  fetchAllServiceRequests,
  fetchMyServiceRequests,
  updateServiceRequestStatus,
} from '../../lib/procurement/serviceRequestApi';
import { AdminServiceRequestsWorkspace } from './AdminServiceRequestsWorkspace';
import { SubscriberServiceRequestsWorkspace } from './SubscriberServiceRequestsWorkspace';

vi.mock('../../lib/procurement/serviceRequestApi', () => ({
  addServiceRequestNote: vi.fn(),
  createServiceRequest: vi.fn(),
  fetchAllServiceRequests: vi.fn(),
  fetchMyServiceRequests: vi.fn(),
  fetchServiceRequestActivities: vi.fn().mockResolvedValue([]),
  quoteServiceRequest: vi.fn(),
  updateServiceRequestStatus: vi.fn(),
}));

const request = {
  id: 'request-1',
  orgId: 'org-1',
  orgName: 'Kambia Supplies',
  serviceType: 'bid_readiness_review' as const,
  description: 'Review our bid package before submission.',
  status: 'submitted',
  quoteAmount: null,
  quoteCurrency: null,
  createdAt: '2026-08-01T12:00:00.000Z',
};

describe('service request workspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchMyServiceRequests).mockResolvedValue([request]);
    vi.mocked(fetchAllServiceRequests).mockResolvedValue([request]);
    vi.mocked(createServiceRequest).mockResolvedValue();
    vi.mocked(updateServiceRequestStatus).mockResolvedValue();
  });

  it('loads and submits subscriber requests through the focused service API', async () => {
    const user = userEvent.setup();
    render(<SubscriberServiceRequestsWorkspace orgId="org-1" isPlatformAdmin={false} />);

    expect(await screen.findByText('Bid-Readiness Review')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox'), 'proposal_review');
    await user.type(screen.getByRole('textbox'), 'Please review our technical proposal.');
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));

    await waitFor(() => {
      expect(createServiceRequest).toHaveBeenCalledWith(
        'org-1',
        'proposal_review',
        'Please review our technical proposal.',
      );
      expect(fetchMyServiceRequests).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Request submitted. Our team will follow up shortly.')).toBeInTheDocument();
  });

  it('loads the admin queue and persists status changes through the focused service API', async () => {
    const user = userEvent.setup();
    render(<AdminServiceRequestsWorkspace isPlatformAdmin />);

    expect(await screen.findByText(/Bid-Readiness Review — Kambia Supplies/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox'), 'in_progress');

    await waitFor(() => {
      expect(updateServiceRequestStatus).toHaveBeenCalledWith('request-1', 'in_progress');
      expect(fetchAllServiceRequests).toHaveBeenCalledTimes(2);
    });
  });
});
