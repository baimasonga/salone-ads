import { randomUUID } from 'node:crypto';
import { sendResendEmail } from './resendProvider.js';

export function emailProvider(): 'resend' | 'cloudflare' {
  const provider = process.env.EMAIL_PROVIDER?.trim() || 'resend';
  if (provider !== 'resend' && provider !== 'cloudflare') throw new Error('Unsupported EMAIL_PROVIDER.');
  return provider;
}
export function supportsEmailRetryDeduplication(): boolean { return emailProvider() === 'resend'; }
export function assertEmailConfigured(): void {
  if (emailProvider() === 'resend') {
    if (!process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM_EMAIL?.trim()) throw new Error('Email delivery requires RESEND_API_KEY and RESEND_FROM_EMAIL.');
  } else {
    if (!process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim() || !/^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim() || '') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.EMAIL_FROM?.trim() || '')) {
      throw new Error('Cloudflare email delivery requires CLOUDFLARE_EMAIL_API_TOKEN, CLOUDFLARE_EMAIL_ACCOUNT_ID and EMAIL_FROM.');
    }
  }
}

export async function sendEmail(input: { to: string; subject: string; html: string; idempotencyKey: string }): Promise<string> {
  assertEmailConfigured();
  if (emailProvider() === 'resend') return sendResendEmail(input);
  // Include a local correlation header; prefer the provider message ID when
  // available. Neither identifier establishes a provider deduplication guarantee.
  const reference = `cloudflare-request:${randomUUID()}`;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID!.trim()}/email/sending/send`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_EMAIL_API_TOKEN!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM!.trim(), to: input.to, subject: input.subject, html: input.html, headers: { 'X-Hyderra-Reference': reference } }),
  });
  const body = await response.json() as { success?: boolean; result?: { message_id?: string; delivered?: string[]; queued?: string[]; permanent_bounces?: string[] } };
  if (!response.ok || body.success !== true) throw new Error(`Cloudflare Email Sending rejected the request (HTTP ${response.status}).`);
  const accepted = [...(body.result?.delivered ?? []), ...(body.result?.queued ?? [])].some(address => address.toLowerCase() === input.to.toLowerCase());
  if (!accepted || body.result?.permanent_bounces?.some(address => address.toLowerCase() === input.to.toLowerCase())) throw new Error('Cloudflare did not accept the recipient.');
  return typeof body.result?.message_id === 'string' && body.result.message_id ? body.result.message_id : reference;
}

// Administrator-only caller; these GET requests do not submit an email. Never
// return token values, full provider response bodies or arbitrary destinations.
export async function inspectEmailProvider(zoneId?: string): Promise<Record<string, unknown>> {
  const provider = emailProvider();
  const config = {
    provider, sender: provider === 'cloudflare' ? process.env.EMAIL_FROM?.trim() : process.env.RESEND_FROM_EMAIL?.trim(),
    accountConfigured: /^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim() || ''),
    tokenConfigured: !!process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim(),
  };
  try { assertEmailConfigured(); } catch (error) { return { ...config, configured: false, error: error instanceof Error ? error.message : 'Missing configuration' }; }
  if (provider !== 'cloudflare') return { ...config, configured: true };
  const headers = { Authorization: `Bearer ${process.env.CLOUDFLARE_EMAIL_API_TOKEN!.trim()}` };
  const get = async (path: string) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const body = await response.json() as {success?: boolean; result?: unknown; errors?: Array<{code?: number}>};
    return { status: response.status, success: body.success === true, codes: body.errors?.map(error => error.code).filter(code => typeof code === 'number'), result: body.result };
  };
  const verification = await get('/user/tokens/verify');
  const tokenResult = verification.result as {status?: string} | undefined;
  const result: Record<string, unknown> = { ...config, configured: true, tokenVerification: {httpStatus: verification.status, success: verification.success, codes: verification.codes, status: tokenResult?.status} };
  if (zoneId && /^[a-f0-9]{32}$/i.test(zoneId)) {
    const domains = await get(`/zones/${zoneId}/email/sending/subdomains`);
    const senderDomain = config.sender?.split('@')[1];
    result.sendingDomain = { httpStatus: domains.status, success: domains.success, codes: domains.codes, enabled: Array.isArray(domains.result) ? domains.result.some(domain => domain.name === senderDomain && domain.enabled === true) : undefined };
  }
  return result;
}
