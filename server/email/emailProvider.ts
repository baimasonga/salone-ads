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
  // Cloudflare's REST API documents recipient delivery groups, not a provider
  // message ID or idempotency guarantee. This reference is local correlation.
  const reference = `cloudflare-request:${randomUUID()}`;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID!.trim()}/email/sending/send`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_EMAIL_API_TOKEN!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM!.trim(), to: input.to, subject: input.subject, html: input.html, headers: { 'X-Hyderra-Reference': reference } }),
  });
  const body = await response.json() as { success?: boolean; result?: { delivered?: string[]; queued?: string[]; permanent_bounces?: string[] } };
  if (!response.ok || body.success !== true) throw new Error(`Cloudflare Email Sending rejected the request (HTTP ${response.status}).`);
  const accepted = [...(body.result?.delivered ?? []), ...(body.result?.queued ?? [])].some(address => address.toLowerCase() === input.to.toLowerCase());
  if (!accepted || body.result?.permanent_bounces?.some(address => address.toLowerCase() === input.to.toLowerCase())) throw new Error('Cloudflare did not accept the recipient.');
  return reference;
}
