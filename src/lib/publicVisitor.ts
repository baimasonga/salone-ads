const VISITOR_TOKEN_KEY = 'manohub.analytics.visitor';

export function isLikelyAutomatedBrowser(): boolean {
  if (typeof navigator === 'undefined') return true;
  if (navigator.webdriver) return true;

  const agent = navigator.userAgent.toLowerCase();
  return /(^|[^a-z])(bot|crawler|spider|slurp)([^a-z]|$)|headlesschrome|phantomjs|selenium|playwright|lighthouse|pagespeed/.test(
    agent,
  );
}

export function getOrCreatePublicVisitorToken(): string {
  if (typeof window === 'undefined') return crypto.randomUUID();

  try {
    const existing = window.localStorage.getItem(VISITOR_TOKEN_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_TOKEN_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function getPublicVisitorTokenHash(): Promise<string> {
  return sha256(getOrCreatePublicVisitorToken());
}
