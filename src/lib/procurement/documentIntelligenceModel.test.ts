import { describe, expect, it } from 'vitest';
import {
  localTenderDocumentIntelligence,
  normalizeTenderDocumentIntelligence,
} from './documentIntelligenceModel';

describe('tender document intelligence model', () => {
  it('extracts common labelled requirements when the external AI provider is unavailable', () => {
    const result = localTenderDocumentIntelligence(`
      Submission deadline: 30 September 2026 at 14:00 GMT.
      Eligibility: Registered solar suppliers with a valid tax clearance certificate.
      Bidders must include a signed bid, business registration and bid security: SLE 25,000.
      Contact tenders@example.org or +232 76 123456.
    `);
    expect(result.keyDeadlines[0]?.date).toContain('30 September 2026');
    expect(result.eligibilityCriteria[0]?.requirement).toContain('Registered solar suppliers');
    expect(result.submissionChecklist.map((item) => item.item)).toContain('signed bid');
    expect(result.financialRequirements[0]?.type).toBe('Bid security');
    expect(result.contacts[0]?.email).toBe('tenders@example.org');
    expect(result.confidence).toBeGreaterThan(50);
  });

  it('normalizes untrusted provider output and bounds arrays, text and confidence', () => {
    const result = normalizeTenderDocumentIntelligence({
      executiveSummary: 'x'.repeat(4_000),
      keyDeadlines: Array.from({ length: 40 }, () => ({ label: 'Deadline', date: 'Soon', evidence: 'Text' })),
      eligibilityCriteria: 'not-an-array',
      submissionChecklist: [],
      financialRequirements: [],
      risks: [{ severity: 'critical', issue: 'Check the original', action: '', evidence: '' }],
      contacts: [],
      confidence: 500,
      limitations: [],
    });
    expect(result.executiveSummary).toHaveLength(2_500);
    expect(result.keyDeadlines).toHaveLength(30);
    expect(result.eligibilityCriteria).toEqual([]);
    expect(result.risks[0]?.severity).toBe('low');
    expect(result.confidence).toBe(100);
  });

  it('flags a missing deadline rather than inventing one', () => {
    const result = localTenderDocumentIntelligence('Suppliers should submit a technical proposal and tax clearance certificate.');
    expect(result.keyDeadlines).toEqual([]);
    expect(result.risks.some((risk) => risk.severity === 'high' && risk.issue.includes('deadline'))).toBe(true);
  });
});
