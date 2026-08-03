import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('secure bid document submission boundary', () => {
  const migration = read('migrations/manohub-new-project/67_secure_bid_document_submissions.sql');
  const api = read('src/lib/procurement/bidSubmissionApi.ts');

  it('separates confidential bid storage from tender notice documents', () => {
    expect(migration).toContain("'bid-submissions'");
    expect(migration).toContain('bid_storage_authorized_read');
    expect(migration).toContain('public.is_org_member(o.buyer_org_id)');
    expect(migration).toContain('alter table public.bid_submission_documents enable row level security');
  });

  it('requires an active intent-to-bid response before a draft can be created', () => {
    expect(migration).toContain("r.kind = 'intent_to_bid'");
    expect(migration).toContain("r.status = 'active'");
    expect(migration).toContain("s.code in ('published', 'amended', 'deadline_extended')");
    expect(migration).toContain('guard_bid_submission_transition');
    expect(migration).toContain('Bid submission identity and version are immutable');
  });

  it('supports versioned upload, submission, withdrawal and buyer downloads', () => {
    for (const operation of ['createBidDraft', 'uploadBidDocument', 'submitBid', 'withdrawBid', 'fetchTenderBidSubmissions', 'getBidDocumentUrl']) expect(api).toContain(`function ${operation}`);
    expect(read('src/components/TenderDetailPage.tsx')).toContain('<BidSubmissionPanel');
    expect(read('src/modules/procurement/TenderManagementPanel.tsx')).toContain('fetchTenderBidSubmissions');
  });
});
