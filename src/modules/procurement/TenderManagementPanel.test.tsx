import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpportunityListItem } from '../../lib/procurement/opportunityApi';
import { TenderManagementPanel } from './TenderManagementPanel';
import {
  cancelOpportunity,
  closeOpportunity,
  fetchMyOpportunities,
} from '../../lib/procurement/opportunityApi';

vi.mock('../../lib/procurement/opportunityApi', () => ({
  cancelOpportunity: vi.fn(),
  closeOpportunity: vi.fn(),
  deleteOpportunityDocument: vi.fn(),
  extendDeadline: vi.fn(),
  fetchMyOpportunities: vi.fn(),
  fetchOpportunityDocuments: vi.fn(async () => []),
  getOpportunityDocumentUrl: vi.fn(),
  recordAward: vi.fn(),
  resubmitForReview: vi.fn(),
  uploadOpportunityDocument: vi.fn(),
}));

vi.mock('../../lib/procurement/responseApi', () => ({ fetchOpportunityResponses: vi.fn(async () => []) }));

const publishedOpportunity = {
  id: 'opportunity-1',
  slug: 'road-works',
  title: 'Road works',
  submissionDeadline: '2026-08-31T17:00:00.000Z',
  statusCode: 'published',
  statusLabel: 'Published',
} as OpportunityListItem;

function PanelHarness({ onFeedback = vi.fn() }: { onFeedback?: (message: string) => void }) {
  const [opportunities, setOpportunities] = useState([publishedOpportunity]);
  return (
    <MemoryRouter>
      <TenderManagementPanel
        organizationId="org-1"
        opportunities={opportunities}
        setOpportunities={setOpportunities}
        loading={false}
        onFeedback={onFeedback}
      />
    </MemoryRouter>
  );
}

describe('TenderManagementPanel actions', () => {
  beforeEach(() => {
    vi.mocked(fetchMyOpportunities).mockResolvedValue([]);
    vi.mocked(cancelOpportunity).mockResolvedValue(undefined);
    vi.mocked(closeOpportunity).mockResolvedValue(undefined);
  });

  it('collects a cancellation reason in a dialog and refreshes the list', async () => {
    const user = userEvent.setup();
    render(<PanelHarness />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Cancel tender' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Cancellation reason'), 'Procurement requirements changed.');
    await user.click(screen.getByRole('button', { name: 'Cancel tender' }));

    await waitFor(() => {
      expect(cancelOpportunity).toHaveBeenCalledWith(
        'opportunity-1',
        'Procurement requirements changed.',
      );
    });
    expect(fetchMyOpportunities).toHaveBeenCalledWith('org-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the tender open and reports an error when close fails', async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn();
    vi.mocked(closeOpportunity).mockRejectedValueOnce(new Error('Service unavailable'));
    render(<PanelHarness onFeedback={onFeedback} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Close tender' }));

    await waitFor(() => {
      expect(onFeedback).toHaveBeenCalledWith('Error: Service unavailable');
    });
    expect(screen.getByRole('dialog', { name: 'Close tender' })).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
  });
});
