import { describe, expect, it, vi } from 'vitest';
import {
  partitionTenderDocuments,
  submitTenderWithDocuments,
  tenderSubmissionFeedback,
} from './tenderSubmission';
import type { OpportunityDocument, OpportunityListItem } from '../../lib/procurement/opportunityApi';

const opportunity = { id: 'opportunity-1', title: 'Road works' } as OpportunityListItem;
const uploaded = { id: 'document-1', fileName: 'notice.pdf' } as OpportunityDocument;

describe('tender document selection', () => {
  it('separates accepted and oversized documents without discarding valid files', () => {
    const result = partitionTenderDocuments([
      { name: 'notice.pdf', size: 500 },
      { name: 'large.zip', size: 2_000 },
    ], 1_000);

    expect(result.accepted.map((file) => file.name)).toEqual(['notice.pdf']);
    expect(result.rejected.map((file) => file.name)).toEqual(['large.zip']);
  });
});

describe('tender submission orchestration', () => {
  it('creates the tender before uploading its documents', async () => {
    const events: string[] = [];
    const result = await submitTenderWithDocuments({
      organizationId: 'org-1',
      organizationName: 'Buyer',
      input: { title: 'Road works' } as never,
      documents: [{ name: 'notice.pdf' } as File],
      documentsArePublic: true,
    }, {
      createOpportunity: vi.fn(async () => {
        events.push('created');
        return opportunity;
      }),
      uploadDocument: vi.fn(async () => {
        events.push('uploaded');
        return uploaded;
      }),
    });

    expect(events).toEqual(['created', 'uploaded']);
    expect(result.uploadedDocuments).toEqual([uploaded]);
    expect(result.failedDocumentCount).toBe(0);
  });

  it('preserves a successful tender when one document upload fails', async () => {
    const result = await submitTenderWithDocuments({
      organizationId: 'org-1',
      organizationName: 'Buyer',
      input: { title: 'Road works' } as never,
      documents: [{ name: 'one.pdf' } as File, { name: 'two.pdf' } as File],
      documentsArePublic: false,
    }, {
      createOpportunity: vi.fn(async () => opportunity),
      uploadDocument: vi.fn()
        .mockResolvedValueOnce(uploaded)
        .mockRejectedValueOnce(new Error('Storage unavailable')),
    });

    expect(result.opportunity).toBe(opportunity);
    expect(result.uploadedDocuments).toEqual([uploaded]);
    expect(result.failedDocumentCount).toBe(1);
  });
});

describe('tender submission feedback', () => {
  it('reports complete success and partial upload failure clearly', () => {
    expect(tenderSubmissionFeedback(0)).toContain('will go live once approved');
    expect(tenderSubmissionFeedback(1)).toContain('1 document failed');
    expect(tenderSubmissionFeedback(2)).toContain('2 documents failed');
  });
});
