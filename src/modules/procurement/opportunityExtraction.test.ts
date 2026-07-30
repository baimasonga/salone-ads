import { describe, expect, it } from 'vitest';
import { extractOpportunityFromText } from './opportunityExtraction';

describe('deterministic opportunity extraction', () => {
  it('extracts labelled procurement fields without an external service', () => {
    const result = extractOpportunityFromText(`
Tender Title: Supply and installation of solar equipment
Procuring Entity: Ministry of Energy
Tender Reference: MOE/NCB/2026/014
Submission Deadline: 30 September 2026 14:00 GMT
Notice URL: https://procurement.example/notices/14
Summary: Supply, installation and commissioning across district facilities.
    `);

    expect(result.title).toBe('Supply and installation of solar equipment');
    expect(result.buyerName).toBe('Ministry of Energy');
    expect(result.externalReference).toBe('MOE/NCB/2026/014');
    expect(result.sourceUrl).toBe('https://procurement.example/notices/14');
    expect(result.submissionDeadline).toContain('2026-09-30');
    expect(result.confidence).toBe(100);
  });

  it('returns an honest low-confidence result for unstructured text', () => {
    const result = extractOpportunityFromText('A short notice without labelled procurement fields.');
    expect(result.detectedFields).toEqual([]);
    expect(result.confidence).toBe(0);
  });
});
