import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpportunityListItem } from '../../lib/procurementApi';
import { TenderCreationForm } from './TenderCreationForm';
import { submitTenderWithDocuments } from './tenderSubmission';

vi.mock('../../lib/procurementApi', () => ({
  MAX_DOCUMENT_SIZE_BYTES: 10 * 1024 * 1024,
  aiSuggestSector: vi.fn(),
  createOpportunity: vi.fn(),
  uploadOpportunityDocument: vi.fn(),
}));

vi.mock('./tenderSubmission', async (importOriginal) => {
  const original = await importOriginal<typeof import('./tenderSubmission')>();
  return {
    ...original,
    submitTenderWithDocuments: vi.fn(),
  };
});

const opportunity = {
  id: 'new-opportunity',
  title: 'Hospital supplies',
} as OpportunityListItem;

function renderForm(overrides: {
  onCreated?: ReturnType<typeof vi.fn>;
  onFeedback?: ReturnType<typeof vi.fn>;
} = {}) {
  const onCreated = overrides.onCreated ?? vi.fn();
  const onFeedback = overrides.onFeedback ?? vi.fn();
  render(
    <TenderCreationForm
      organizationId="org-1"
      organizationName="Health Agency"
      sectors={[{ id: 'health', name: 'Health' }]}
      countries={[{ id: 'sl', name: 'Sierra Leone' }]}
      districts={[{ id: 'western', name: 'Western Area' }]}
      currencies={[{ code: 'SLE', name: 'Sierra Leonean Leone', symbol: 'Le' }]}
      opportunityTypes={[{ id: 'rfp', name: 'Request for Proposal' }]}
      countryId="sl"
      onCountryChange={vi.fn()}
      districtId=""
      onDistrictChange={vi.fn()}
      onCreated={onCreated}
      onFeedback={onFeedback}
    />,
  );
  return { onCreated, onFeedback };
}

describe('TenderCreationForm', () => {
  beforeEach(() => {
    vi.mocked(submitTenderWithDocuments).mockResolvedValue({
      opportunity,
      uploadedDocuments: [],
      failedDocumentCount: 0,
    });
  });

  it('rejects oversized documents while keeping the form usable', async () => {
    const user = userEvent.setup();
    renderForm();
    const oversized = new File(
      [new Uint8Array(10 * 1024 * 1024 + 1)],
      'large-notice.pdf',
      { type: 'application/pdf' },
    );

    await user.upload(screen.getByLabelText('Tender Documents'), oversized);

    expect(screen.getByText(/large-notice\.pdf exceeds the 10MB limit/)).toBeInTheDocument();
    expect(screen.queryByText('10.0 MB')).not.toBeInTheDocument();
  });

  it('maps required fields into the submission service and returns the created tender', async () => {
    const user = userEvent.setup();
    const { onCreated } = renderForm();

    await user.type(screen.getByLabelText('Tender Title'), 'Hospital supplies');
    await user.type(screen.getByLabelText('Summary'), 'Supply essential hospital materials.');
    await user.type(screen.getByLabelText('Submission Deadline'), '2026-09-30T17:00');
    await user.selectOptions(screen.getByLabelText('Sector'), 'health');
    await user.selectOptions(screen.getByLabelText('Notice Type'), 'rfp');
    await user.click(screen.getByRole('button', { name: 'Publish Tender' }));

    await waitFor(() => expect(submitTenderWithDocuments).toHaveBeenCalledOnce());
    expect(submitTenderWithDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        organizationName: 'Health Agency',
        input: expect.objectContaining({
          title: 'Hospital supplies',
          sectorId: 'health',
          opportunityTypeId: 'rfp',
          submissionDeadline: '2026-09-30T17:00',
        }),
      }),
      expect.objectContaining({
        createOpportunity: expect.any(Function),
        uploadDocument: expect.any(Function),
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ opportunity }));
  });
});
