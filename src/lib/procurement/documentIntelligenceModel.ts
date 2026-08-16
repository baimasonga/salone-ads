export const MAX_DOCUMENT_INTELLIGENCE_TEXT = 30_000;

export type RiskSeverity = 'high' | 'medium' | 'low';

export interface TenderDocumentIntelligence {
  executiveSummary: string;
  keyDeadlines: Array<{ label: string; date: string; evidence: string }>;
  eligibilityCriteria: Array<{ requirement: string; mandatory: boolean; evidence: string }>;
  submissionChecklist: Array<{ item: string; category: string; evidence: string }>;
  financialRequirements: Array<{ type: string; amount: string; currency: string; evidence: string }>;
  risks: Array<{ severity: RiskSeverity; issue: string; action: string; evidence: string }>;
  contacts: Array<{ name: string; role: string; email: string; phone: string }>;
  confidence: number;
  limitations: string[];
}

const text = (value: unknown, limit = 800): string =>
  typeof value === 'string' ? value.trim().slice(0, limit) : '';

const list = (value: unknown): unknown[] => Array.isArray(value) ? value.slice(0, 30) : [];

export function normalizeTenderDocumentIntelligence(value: unknown): TenderDocumentIntelligence {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    executiveSummary: text(source.executiveSummary, 2_500),
    keyDeadlines: list(source.keyDeadlines).map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return { label: text(row.label, 160), date: text(row.date, 100), evidence: text(row.evidence) };
    }).filter((item) => item.label || item.date),
    eligibilityCriteria: list(source.eligibilityCriteria).map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return { requirement: text(row.requirement), mandatory: row.mandatory === true, evidence: text(row.evidence) };
    }).filter((item) => item.requirement),
    submissionChecklist: list(source.submissionChecklist).map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return { item: text(row.item), category: text(row.category, 100) || 'Other', evidence: text(row.evidence) };
    }).filter((item) => item.item),
    financialRequirements: list(source.financialRequirements).map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return { type: text(row.type, 160), amount: text(row.amount, 160), currency: text(row.currency, 30), evidence: text(row.evidence) };
    }).filter((item) => item.type || item.amount),
    risks: list(source.risks).map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const severity: RiskSeverity = row.severity === 'high' || row.severity === 'medium' ? row.severity : 'low';
      return { severity, issue: text(row.issue), action: text(row.action), evidence: text(row.evidence) };
    }).filter((item) => item.issue),
    contacts: list(source.contacts).map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return { name: text(row.name, 160), role: text(row.role, 160), email: text(row.email, 320), phone: text(row.phone, 80) };
    }).filter((item) => item.name || item.email || item.phone),
    confidence: Math.max(0, Math.min(100, Number.isFinite(Number(source.confidence)) ? Math.round(Number(source.confidence)) : 0)),
    limitations: list(source.limitations).map((item) => text(item)).filter(Boolean),
  };
}

export function localTenderDocumentIntelligence(rawText: string): TenderDocumentIntelligence {
  const source = rawText.replace(/\s+/g, ' ').trim();
  const email = source.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? '';
  const phone = source.match(/(?:\+?232|0)\s?\d{2}(?:[\s-]?\d){6,7}/)?.[0] ?? '';
  const deadline = source.match(/(?:deadline|closing date|closes?|submission date)\s*[:\-]?\s*([^.;]{4,100})/i)?.[1]?.trim() ?? '';
  const eligibility = source.match(/(?:eligibility|eligible bidders?|qualification requirements?)\s*[:\-]?\s*([^.;]{10,500})/i)?.[1]?.trim() ?? '';
  const bidSecurity = source.match(/(?:bid security|tender security)\s*[:\-]?\s*([^.;]{2,200})/i)?.[1]?.trim() ?? '';
  const checklist = ['signed bid', 'business registration', 'tax clearance', 'bid security', 'technical proposal', 'financial proposal']
    .filter((term) => source.toLowerCase().includes(term))
    .map((item) => ({ item, category: 'Detected requirement', evidence: `Document mentions “${item}”.` }));
  const limitations = ['AI provider is not configured; this is a deterministic extraction and must be checked against the original document.'];
  if (!deadline) limitations.push('No labelled submission deadline was detected.');
  if (!eligibility) limitations.push('No clearly labelled eligibility section was detected.');
  return normalizeTenderDocumentIntelligence({
    executiveSummary: source.slice(0, 900) || 'No readable document text was extracted.',
    keyDeadlines: deadline ? [{ label: 'Submission deadline', date: deadline, evidence: deadline }] : [],
    eligibilityCriteria: eligibility ? [{ requirement: eligibility, mandatory: true, evidence: eligibility }] : [],
    submissionChecklist: checklist,
    financialRequirements: bidSecurity ? [{ type: 'Bid security', amount: bidSecurity, currency: '', evidence: bidSecurity }] : [],
    risks: deadline ? [] : [{ severity: 'high', issue: 'Submission deadline was not detected.', action: 'Confirm the deadline in the original notice before preparing a bid.', evidence: '' }],
    contacts: email || phone ? [{ name: '', role: 'Tender contact', email, phone }] : [],
    confidence: Math.min(75, 20 + (deadline ? 20 : 0) + (eligibility ? 20 : 0) + (checklist.length ? 10 : 0) + (email || phone ? 5 : 0)),
    limitations,
  });
}
