import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, 'migrations/manohub-new-project/87_tender_document_intelligence.sql'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/lib/procurement/documentIntelligenceApi.ts'), 'utf8');
const extractor = fs.readFileSync(path.join(root, 'src/lib/procurement/documentTextExtraction.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/modules/procurement/TenderDocumentIntelligencePanel.tsx'), 'utf8');
const tenderDetail = fs.readFileSync(path.join(root, 'src/components/TenderDetailPage.tsx'), 'utf8');
const serverRoute = fs.readFileSync(path.join(root, 'server/ai/routes.ts'), 'utf8');
const pagesRoute = fs.readFileSync(path.join(root, 'functions/api/gemini/procurement-assist.ts'), 'utf8');

describe('tender document intelligence foundation', () => {
  it('isolates persisted analyses to the requesting subscriber and accessible source document', () => {
    expect(migration).toContain('unique (user_id, document_id)');
    expect(migration).toContain('user_id = (select auth.uid())');
    expect(migration).toContain('can_access_tender_document_intelligence');
    expect(migration).toContain("user_has_tender_feature('tender_alerts_and_details')");
    expect(migration).toContain("user_has_tender_feature('tender_publishing')");
    expect(migration).toContain('Tender document analysis identity is immutable');
    expect(migration).toContain('revoke all on public.tender_document_analyses from public, anon');
  });

  it('extracts supported document formats locally without uploading source files to a new storage service', () => {
    expect(extractor).toContain("fileExtension === 'pdf'");
    expect(extractor).toContain("fileExtension === 'docx'");
    expect(extractor).toContain("crypto.subtle.digest('SHA-256'");
    expect(extractor).toContain('MAX_DOCUMENT_INTELLIGENCE_TEXT');
    expect(extractor).toContain('Scanned image-only PDFs require OCR');
  });

  it('keeps both deployment paths aligned on authenticated structured analysis', () => {
    for (const source of [serverRoute, pagesRoute]) {
      expect(source).toContain('analyze_document');
      expect(source).toContain('normalizeTenderDocumentIntelligence');
      expect(source).toContain('application/json');
      expect(source).toContain('localTenderDocumentIntelligence');
    }
    expect(serverRoute).toContain('requireUser, aiRateLimiter');
    expect(pagesRoute).toContain('requireUserId(request, env)');
  });

  it('persists evidence-backed results and exposes the panel only with full tender access', () => {
    expect(api).toContain("from('tender_document_analyses')");
    expect(api).toContain("onConflict: 'user_id,document_id'");
    expect(panel).toContain('Key deadlines');
    expect(panel).toContain('Eligibility criteria');
    expect(panel).toContain('Submission checklist');
    expect(panel).toContain('Bid risks and actions');
    expect(tenderDetail).toContain('opportunity.hasFullAccess && documents.length > 0');
  });
});
