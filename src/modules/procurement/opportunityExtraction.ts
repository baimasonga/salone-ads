export interface ExtractedOpportunity {
  title: string;
  buyerName: string;
  submissionDeadline: string;
  sourceUrl: string;
  externalReference: string;
  summary: string;
  confidence: number;
  detectedFields: string[];
}

function labelled(text: string, labels: string[]): string {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*[:\\-]\\s*([^\\n]+)`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function deadlineValue(value: string): string {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 16);
}

export function extractOpportunityFromText(rawText: string): ExtractedOpportunity {
  const text = rawText.replace(/\r/g, '').trim();
  const title = labelled(text, ['tender title', 'notice title', 'title', 'subject']);
  const buyerName = labelled(text, [
    'procuring entity', 'contracting authority', 'buyer', 'agency', 'organisation', 'organization',
  ]);
  const deadlineRaw = labelled(text, [
    'submission deadline', 'closing date', 'deadline', 'bid closing date', 'closes',
  ]);
  const externalReference = labelled(text, [
    'tender reference', 'reference number', 'procurement reference', 'reference', 'ref',
  ]);
  const labelledUrl = labelled(text, ['notice url', 'source url', 'url', 'website']);
  const detectedUrl = labelledUrl || text.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.;]+$/, '') || '';
  const summary = labelled(text, ['summary', 'description', 'scope']);
  const submissionDeadline = deadlineValue(deadlineRaw);
  const fields = [
    title && 'title',
    buyerName && 'buyerName',
    submissionDeadline && 'submissionDeadline',
    detectedUrl && 'sourceUrl',
    externalReference && 'externalReference',
    summary && 'summary',
  ].filter(Boolean) as string[];
  const confidence = Math.min(100,
    (title ? 25 : 0)
    + (buyerName ? 20 : 0)
    + (submissionDeadline ? 25 : 0)
    + (detectedUrl ? 10 : 0)
    + (externalReference ? 10 : 0)
    + (summary ? 10 : 0));

  return {
    title,
    buyerName,
    submissionDeadline,
    sourceUrl: detectedUrl,
    externalReference,
    summary,
    confidence,
    detectedFields: fields,
  };
}
