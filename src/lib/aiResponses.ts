export function parseJsonArrayLoose(raw: string): any[] | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseJsonObjectLoose(raw: string): Record<string, any> | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Local fallback advert copy when no Gemini key is configured -- a light
// cleanup of the subject/description into headline + body.
export function buildAdvertCopyDraft(subject: string, description?: string): { headline: string; body: string } {
  const headline = subject.trim().replace(/\.$/, "").slice(0, 60) || "Now available";
  const body = (description || subject).trim().replace(/\s+/g, " ").slice(0, 140);
  return { headline, body };
}

export function localProcurementAssist(mode: string, text: string, sectorNames?: string[]): string {
  if (mode === "suggest_sector") {
    const lower = text.toLowerCase();
    const match = (sectorNames || []).find((s) => lower.includes(s.toLowerCase()));
    return match || "General";
  }
  return `[LOCAL GUIDANCE] This tender is asking qualified businesses to submit a bid. Read the deadline, eligibility, and submission instructions carefully, and reach out to the buyer's contact if anything is unclear before you apply. (AI summary unavailable — configure GEMINI_API_KEY for full explanations.)`;
}


export function validCampaignDateRange(start: string, end: string): boolean {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
  return validDate(start) && validDate(end) && start <= end;
}
