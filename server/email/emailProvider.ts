import { randomUUID } from 'node:crypto';
import { sendResendEmail } from './resendProvider.js';

export function emailProvider(): 'resend' | 'cloudflare' | 'cloudflare-worker' {
  const provider = process.env.EMAIL_PROVIDER?.trim() || 'resend';
  if (provider !== 'resend' && provider !== 'cloudflare' && provider !== 'cloudflare-worker') throw new Error('Unsupported EMAIL_PROVIDER.');
  return provider;
}
export function supportsEmailRetryDeduplication(): boolean { return emailProvider() === 'resend'; }
export function assertEmailConfigured(): void {
  if (emailProvider() === 'resend') {
    if (!process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM_EMAIL?.trim()) throw new Error('Email delivery requires RESEND_API_KEY and RESEND_FROM_EMAIL.');
  } else if (emailProvider() === 'cloudflare-worker') {
    if (!process.env.EMAIL_FROM?.trim() || (process.env.EMAIL_BRIDGE_SECRET?.length ?? 0) < 32) throw new Error('Cloudflare native email requires EMAIL_FROM and EMAIL_BRIDGE_SECRET.');
    emailRelayUrl();
  } else {
    if (!process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim() || !/^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim() || '') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.EMAIL_FROM?.trim() || '')) {
      throw new Error('Cloudflare email delivery requires CLOUDFLARE_EMAIL_API_TOKEN, CLOUDFLARE_EMAIL_ACCOUNT_ID and EMAIL_FROM.');
    }
  }
}

function emailRelayUrl(): string {
  const origin=new URL(process.env.EMAIL_RELAY_URL || '');
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash) throw new Error('Email relay must be an HTTPS origin.');
  return new URL('/api/internal/email/send',origin).href;
}

export async function sendEmail(input: { to: string; subject: string; html: string; idempotencyKey: string }): Promise<string> {
  assertEmailConfigured();
  if (emailProvider() === 'resend') return sendResendEmail(input);
  if (emailProvider() === 'cloudflare-worker') {
    const response=await fetch(emailRelayUrl(),{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','x-email-bridge-key':process.env.EMAIL_BRIDGE_SECRET!},body:JSON.stringify({to:input.to,subject:input.subject,html:input.html})});
    if(!response.ok)throw new Error(`Cloudflare native email bridge rejected the request (HTTP ${response.status}).`);
    const result=await response.json() as {id?:string};
    if(!result.id)throw new Error('Cloudflare native email acceptance could not be confirmed.');
    return result.id;
  }
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
    provider, sender: provider !== 'resend' ? process.env.EMAIL_FROM?.trim() : process.env.RESEND_FROM_EMAIL?.trim(),
    apiTokenRequired: provider === 'cloudflare',
    accountConfigured: provider === 'cloudflare' ? /^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim() || '') : undefined,
    tokenConfigured: provider === 'cloudflare' ? !!process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim() : undefined,
  };
  try { assertEmailConfigured(); } catch (error) { return { ...config, configured: false, error: error instanceof Error ? error.message : 'Missing configuration' }; }
  if(provider==='cloudflare-worker'){
    const r=await fetch(emailRelayUrl(),{headers:{'x-email-bridge-key':process.env.EMAIL_BRIDGE_SECRET!},redirect:'error',signal:AbortSignal.timeout(15000)});
    return {...config,configured:r.ok,nativeBinding:{httpStatus:r.status,available:r.ok}};
  }
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
