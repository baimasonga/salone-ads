import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewQueueItem } from '../../lib/procurementApi';
import { AdminTenderReviewWorkspace } from './AdminTenderReviewWorkspace';
import {
  approveOpportunity,
  fetchOpportunitiesForReview,
  findSimilarTitledOpportunities,
  requestCorrection,
} from '../../lib/procurementApi';

vi.mock('../../lib/procurementApi', () => ({
  approveOpportunity: vi.fn(),
  fetchOpportunitiesForReview: vi.fn(),
  findSimilarTitledOpportunities: vi.fn(),
  rejectOpportunity: vi.fn(),
  requestCorrection: vi.fn(),
  setOpportunityFeatured: vi.fn(),
}));

const reviewItem = {
  id: 'review-1',
  slug: 'bridge-repairs',
  title: 'Bridge repairs',
  buyerName: 'Infrastructure Agency',
  createdAt: '2026-07-28T09:00:00.000Z',
  statusCode: 'awaiting_review',
  statusLabel: 'Awaiting review',
} as ReviewQueueItem;

function renderWorkspace() {
  return render(
    <MemoryRouter>
      <AdminTenderReviewWorkspace />
    </MemoryRouter>,
  );
}

describe('AdminTenderReviewWorkspace', () => {
  beforeEach(() => {
    vi.mocked(fetchOpportunitiesForReview).mockResolvedValue([reviewItem]);
    vi.mocked(findSimilarTitledOpportunities).mockResolvedValue([]);
    vi.mocked(requestCorrection).mockResolvedValue(undefined);
    vi.mocked(approveOpportunity).mockResolvedValue(undefined);
  });

  it('sends a correction request from the branded review dialog', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    expect(await screen.findByText('Bridge repairs')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request Correction' }));
    await user.type(
      screen.getByLabelText('Required corrections'),
      'Attach the signed bidding notice.',
    );
    await user.click(screen.getByRole('button', { name: 'Send correction request' }));

    await waitFor(() => {
      expect(requestCorrection).toHaveBeenCalledWith(
        'review-1',
        'Attach the signed bidding notice.',
      );
    });
    expect(screen.queryByText('Bridge repairs')).not.toBeInTheDocument();
  });

  it('restores a tender and shows the error when approval fails', async () => {
    const user = userEvent.setup();
    vi.mocked(approveOpportunity).mockRejectedValueOnce(new Error('Approval unavailable'));
    renderWorkspace();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Approval unavailable');
    expect(screen.getByText('Bridge repairs')).toBeInTheDocument();
  });

  it('still displays the queue when duplicate detection fails', async () => {
    vi.mocked(findSimilarTitledOpportunities).mockRejectedValueOnce(
      new Error('Similarity service unavailable'),
    );
    renderWorkspace();

    expect(await screen.findByText('Bridge repairs')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
