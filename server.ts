import { registerAiRoutes } from "./server/ai/routes.js";
import express from "express";
import path from "path";
import fs from "fs";
import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";
import { Resend, type WebhookEventPayload } from "resend";

// Load environment variables
dotenv.config();

// Typed environment configuration audit
const REQUIRED_ENV_VARS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
const MISSING_VARS = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
if (MISSING_VARS.length > 0) {
  console.warn(`[WARN] Missing environment variables in system context: ${MISSING_VARS.join(", ")}`);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Used only to validate the caller's access token (auth.getUser), never to
// bypass RLS — no service-role key is used here.
const supabaseAuthClient =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const supabaseServiceClient =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

async function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || !supabaseAuthClient) {
    res.status(401).json({ error: { message: "Authentication required." } });
    return;
  }

  const { data, error } = await supabaseAuthClient.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: { message: "Invalid or expired session." } });
    return;
  }

  (req as any).userId = data.user.id;
  next();
}

async function requirePlatformAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(401).json({ error: { message: "Authentication required." } });
    return;
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.rpc("is_platform_admin");
  if (error || data !== true) {
    res.status(403).json({ error: { message: "Platform administrator access required." } });
    return;
  }
  next();
}

function userScopedSupabase(req: express.Request) {
  const token = req.headers.authorization?.slice(7);
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) throw Object.assign(new Error("Authentication required."), { status: 401, expose: true });
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9_.]{2,79}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CommandPayload = Record<string, unknown>;
const commandField = (payload: CommandPayload, name: string, maximum = 500, optional = false): string | null => {
  const value = payload[name];
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw Object.assign(new Error(`${name} is invalid.`), { status: 400, expose: true });
  return value.trim();
};
const commandUuid = (payload: CommandPayload, name: string, optional = false): string | null => {
  const value = commandField(payload, name, 64, optional);
  if (value !== null && !UUID_PATTERN.test(value)) throw Object.assign(new Error(`${name} must be a valid identifier.`), { status: 400, expose: true });
  return value;
};
const commandAmount = (payload: CommandPayload, name: string): number => {
  const value = payload[name];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1_000_000_000) throw Object.assign(new Error(`${name} must be a positive amount.`), { status: 400, expose: true });
  return value;
};
const commandBoolean = (payload: CommandPayload, name: string): boolean => {
  if (typeof payload[name] !== 'boolean') throw Object.assign(new Error(`${name} must be true or false.`), { status: 400, expose: true });
  return payload[name] as boolean;
};
const oneOf = (value: string | null, allowed: readonly string[], name: string): string => {
  if (!value || !allowed.includes(value)) throw Object.assign(new Error(`${name} is invalid.`), { status: 400, expose: true });
  return value;
};

const COMMANDS: Record<string, { rpc: string; params: (payload: CommandPayload) => Record<string, unknown> }> = {
  'organization.invite': { rpc: 'invite_team_member', params: p => ({ p_org_id: commandUuid(p, 'orgId'), p_email: commandField(p, 'email', 320), p_role: oneOf(commandField(p, 'role', 20), ['owner','admin','member'], 'role') }) },
  'organization.transition': { rpc: 'admin_transition_organization', params: p => ({ p_org_id: commandUuid(p, 'orgId'), p_action: oneOf(commandField(p, 'action', 20), ['suspend','reactivate','close'], 'action'), p_reason: commandField(p, 'reason', 1000) }) },
  'organization.recovery.decide': { rpc: 'admin_decide_organization_recovery', params: p => ({ p_request_id: commandUuid(p, 'requestId'), p_approve: commandBoolean(p, 'approve'), p_note: commandField(p, 'note', 1000, true) }) },
  'subscription.transition': { rpc: 'transition_subscription', params: p => ({ p_subscription_id: commandUuid(p, 'subscriptionId'), p_action: oneOf(commandField(p, 'action', 30), ['start_trial','activate','renew','mark_past_due','start_grace','suspend','resume','schedule_cancel','cancel','expire'], 'action'), p_reason: commandField(p, 'reason', 1000, true), p_effective_date: commandField(p, 'effectiveDate', 10, true) }) },
  'advertising.order.create': { rpc: 'create_advert_order', params: p => ({ p_org_id: commandUuid(p, 'orgId'), p_campaign_id: commandUuid(p, 'campaignId', true), p_package_id: commandUuid(p, 'packageId'), p_billing_period: oneOf(commandField(p, 'billingPeriod', 20), ['daily','weekly','monthly'], 'billingPeriod'), p_payment_method: commandField(p, 'paymentMethod', 80), p_payment_reference: commandField(p, 'paymentReference', 200, true) }) },
  'organization.verification.approve': { rpc: 'admin_approve_organization_verification', params: p => ({ p_request_id: commandUuid(p, 'requestId'), p_org_id: commandUuid(p, 'orgId'), p_request_type: oneOf(commandField(p, 'requestType', 20), ['supplier','buyer'], 'requestType') }) },
  'procurement.ingestion.promote': { rpc: 'promote_opportunity_ingestion_item', params: p => ({ p_item_id: commandUuid(p, 'itemId') }) },
  'billing.payment.record': { rpc: 'record_commercial_payment', params: p => ({ p_invoice_id: commandUuid(p, 'invoiceId'), p_reference: commandField(p, 'reference', 200), p_method: commandField(p, 'method', 80), p_amount: commandAmount(p, 'amount') }) },
  'billing.credit.issue': { rpc: 'issue_commercial_credit', params: p => ({ p_invoice_id: commandUuid(p, 'invoiceId'), p_credit_number: commandField(p, 'creditNumber', 100), p_amount: commandAmount(p, 'amount'), p_reason: commandField(p, 'reason', 1000) }) },
  'billing.refund.record': { rpc: 'record_commercial_refund', params: p => ({ p_payment_id: commandUuid(p, 'paymentId'), p_refund_reference: commandField(p, 'refundReference', 200), p_amount: commandAmount(p, 'amount'), p_reason: commandField(p, 'reason', 1000) }) },
};


const redirectRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const address = req.get("cf-connecting-ip") || req.ip || "anonymous";
    if (isIP(address) !== 6) return address;
    return address.split(":").slice(0, 4).join(":");
  },
  message: "Too many redirect requests. Please wait a moment and try again.",
});

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

type RequestWithContext = express.Request & {
  requestId?: string;
  requestStartedAt?: number;
  userId?: string;
};

function structuredLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
): void {
  console[level](JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  }));
}

function correlationToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function requestObservability(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const context = req as RequestWithContext;
  const suppliedRequestId = req.get('x-request-id')?.trim();
  const requestId = suppliedRequestId && REQUEST_ID_PATTERN.test(suppliedRequestId)
    ? suppliedRequestId
    : randomUUID();

  context.requestId = requestId;
  context.requestStartedAt = Date.now();
  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - (context.requestStartedAt ?? Date.now());
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    structuredLog(level, 'http.request.completed', {
      request_id: requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status_code: res.statusCode,
      duration_ms: durationMs,
      user_correlation: correlationToken(context.userId),
      user_agent: req.get('user-agent')?.slice(0, 160),
    });
  });

  next();
}

// Central error boundary for synchronous failures and errors forwarded with
// next(error). Expected client errors may expose their message; unexpected
// failures receive a stable generic response while details stay in logs.
// Registered last in startServer so it covers every preceding route.
function requestErrorBoundary(
  error: unknown,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const operationalError = (error ?? {}) as {
    status?: number;
    statusCode?: number;
    code?: string;
    message?: string;
    expose?: boolean;
    name?: string;
  };
  const requestedStatus = operationalError.statusCode ?? operationalError.status ?? 500;
  const statusCode = requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500;
  const requestId = res.locals.requestId || (req as RequestWithContext).requestId;
  const safeCode = typeof operationalError.code === 'string'
    && /^[A-Z][A-Z0-9_]{2,63}$/.test(operationalError.code)
    ? operationalError.code
    : statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED';
  const exposeMessage = statusCode < 500 || operationalError.expose === true;

  structuredLog(statusCode >= 500 ? 'error' : 'warn', 'http.request.failed', {
    request_id: requestId,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    status_code: statusCode,
    error_code: safeCode,
    error_name: operationalError.name || 'Error',
    error_message: operationalError.message || 'Unknown request failure',
  });

  res.status(statusCode).json({
    error: {
      code: safeCode,
      message: exposeMessage
        ? operationalError.message || 'The request could not be completed.'
        : 'An unexpected server error occurred.',
      requestId,
    },
  });
}

// Escape a string for safe insertion into an HTML attribute / text node.
function htmlEscape(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function configuredAppOrigin(): string | null {
  const value = process.env.APP_URL?.trim();
  if (!value || value.includes('REPLACE_WITH_') || value === 'MY_APP_URL') return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function requestOrigin(req: express.Request): string | null {
  const configured = configuredAppOrigin();
  if (configured) return configured;

  const host = req.get('host');
  if (!host || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return null;
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwardedProtocol === 'http' || forwardedProtocol === 'https' ? forwardedProtocol : req.protocol;
  return `${protocol}://${host}`;
}

function redirectVisitorToken(req: express.Request, res: express.Response): string {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("manohub_redirect_visitor="))
    ?.slice("manohub_redirect_visitor=".length);
  const existing = cookie && /^[0-9a-f-]{36}$/i.test(cookie) ? cookie : null;
  const token = existing || randomUUID();

  if (!existing) {
    res.cookie("manohub_redirect_visitor", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }
  return createHash("sha256").update(token).digest("hex");
}

function safeReferrerHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.hostname.slice(0, 255).toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function renderAudienceEmail(input: {
  subject: string;
  previewText: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  unsubscribeHref?: string;
}): string {
  const paragraphs = input.body.split(/\n{2,}/).map(paragraph =>
    `<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.7">${htmlEscape(paragraph).replace(/\n/g, "<br />")}</p>`
  ).join("");
  let safeCtaHref = "";
  try {
    const parsed = new URL(input.ctaHref);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") safeCtaHref = parsed.toString();
  } catch {
    safeCtaHref = "";
  }
  const cta = input.ctaLabel && safeCtaHref
    ? `<a href="${htmlEscape(safeCtaHref)}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:13px 20px;font-weight:700;font-size:13px;margin:6px 0 24px">${htmlEscape(input.ctaLabel)}</a>`
    : "";
  const unsubscribe = input.unsubscribeHref
    ? `<p style="margin:24px 0 0;color:#94a3b8;font-size:11px;line-height:1.5">You received this because you subscribed to Manohub updates. <a href="${htmlEscape(input.unsubscribeHref)}" style="color:#64748b">Unsubscribe securely</a>.</p>`
    : `<p style="margin:24px 0 0;color:#94a3b8;font-size:11px">This is a Manohub test message.</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(input.subject)}</title></head><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${htmlEscape(input.previewText)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:2px solid #0f172a"><tr><td style="background:#0f172a;padding:22px 28px;color:#fff"><div style="font-size:21px;font-weight:900;letter-spacing:3px">MANO<span style="color:#10b981">HUB</span></div><div style="margin-top:5px;color:#94a3b8;font-size:10px;letter-spacing:2px">OPPORTUNITIES · BUSINESS · AUDIENCE</div></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 20px;color:#0f172a;font-size:28px;line-height:1.2">${htmlEscape(input.subject)}</h1>${paragraphs}${cta}${unsubscribe}</td></tr><tr><td style="background:#f4d35e;border-top:2px solid #0f172a;padding:14px 28px;color:#0f172a;font-size:11px;font-weight:700">Manohub · Built for the Mano River market</td></tr></table></td></tr></table></body></html>`;
}

function renderTenderAlertEmail(input: {
  frequency: 'immediate' | 'daily' | 'weekly';
  opportunities: Array<{
    title: string;
    slug: string;
    buyerName: string;
    deadline: string | null;
    searchName: string;
    matchScore: number;
  }>;
  appOrigin: string;
}): string {
  const label = input.frequency === 'immediate'
    ? 'New tender alert'
    : input.frequency === 'daily' ? 'Daily tender digest' : 'Weekly tender digest';
  const cards = input.opportunities.map((opportunity) => {
    const href = `${input.appOrigin}/tenders/${encodeURIComponent(opportunity.slug)}`;
    const deadline = opportunity.deadline
      ? new Date(opportunity.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
      : 'See notice';
    return `<tr><td style="padding:18px 0;border-bottom:1px solid #cbd5e1"><div style="color:#047857;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">${htmlEscape(opportunity.searchName)} · ${opportunity.matchScore}% match</div><h2 style="margin:7px 0 5px;color:#0f172a;font-size:18px;line-height:1.3">${htmlEscape(opportunity.title)}</h2><p style="margin:0 0 12px;color:#64748b;font-size:13px">${htmlEscape(opportunity.buyerName || 'Buyer not specified')} · Closes ${htmlEscape(deadline)}</p><a href="${htmlEscape(href)}" style="color:#047857;font-size:13px;font-weight:800">View verified tender →</a></td></tr>`;
  }).join('');
  const manageHref = `${input.appOrigin}/tenders`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${label}</title></head><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${input.opportunities.length} matching tender ${input.opportunities.length === 1 ? 'opportunity' : 'opportunities'} from ManoHub</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:650px;background:#fff;border:2px solid #0f172a"><tr><td style="background:#0f172a;padding:22px 28px;color:#fff"><div style="font-size:21px;font-weight:900;letter-spacing:3px">MANO<span style="color:#10b981">HUB</span></div><div style="margin-top:5px;color:#94a3b8;font-size:10px;letter-spacing:2px">${label.toUpperCase()}</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0;color:#0f172a;font-size:26px">${htmlEscape(label)}</h1><p style="margin:8px 0 18px;color:#475569;font-size:14px">These reviewed opportunities match your saved search criteria.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table><p style="margin:24px 0 0;color:#94a3b8;font-size:11px;line-height:1.5">You receive these alerts because you created a saved search on ManoHub. <a href="${htmlEscape(manageHref)}" style="color:#64748b">Manage or pause your alerts</a>.</p></td></tr><tr><td style="background:#f4d35e;border-top:2px solid #0f172a;padding:14px 28px;color:#0f172a;font-size:11px;font-weight:700">ManoHub · Verified opportunities for the Mano River market</td></tr></table></td></tr></table></body></html>`;
}

async function sendResendEmail(input: { to: string; subject: string; html: string; idempotencyKey: string }): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error("Email delivery is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
  });
  const result = await response.json() as any;
  if (!response.ok || !result?.id) throw new Error(result?.message || "Resend rejected the email.");
  return String(result.id);
}

function resendEventMetadata(event: WebhookEventPayload): Record<string, string> {
  if (event.type === "email.clicked") {
    return { link: event.data.click.link };
  }
  if (event.type === "email.bounced") {
    return { reason: event.data.bounce.message, type: event.data.bounce.type, subtype: event.data.bounce.subType };
  }
  if (event.type === "email.failed") {
    return { reason: event.data.failed.reason };
  }
  if (event.type === "email.suppressed") {
    return { reason: event.data.suppressed.message, type: event.data.suppressed.type };
  }
  return {};
}

async function dispatchAudienceCampaign(campaignId: string, force = false): Promise<{ sent: number; failed: number; remaining: number }> {
  if (!supabaseServiceClient) throw new Error("Email delivery requires SUPABASE_SERVICE_ROLE_KEY.");
  if (!process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM_EMAIL?.trim()) {
    throw new Error("Email delivery requires RESEND_API_KEY and RESEND_FROM_EMAIL.");
  }
  const appOrigin = configuredAppOrigin();
  if (!appOrigin) throw new Error("Email delivery requires a valid APP_URL for secure unsubscribe links.");
  const { data: campaign, error: campaignError } = await supabaseServiceClient.from("audience_email_campaigns")
    .select("id, subject, preview_text, body, cta_label, cta_href, status, scheduled_at")
    .eq("id", campaignId).single();
  if (campaignError || !campaign) throw new Error("Email campaign was not found.");
  if (campaign.status === "cancelled" || campaign.status === "sent") return { sent: 0, failed: 0, remaining: 0 };
  if (!force && campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()) return { sent: 0, failed: 0, remaining: 0 };

  await supabaseServiceClient.from("audience_email_campaigns").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", campaignId);
  const { data: deliveries, error: deliveryError } = await supabaseServiceClient.from("audience_email_deliveries")
    .select("id, recipient_email, public_audience_subscribers!inner(full_name, unsubscribe_token, status)")
    .eq("campaign_id", campaignId).eq("status", "queued").order("queued_at").limit(25);
  if (deliveryError) throw deliveryError;

  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries ?? []) {
    const subscriber = (delivery as any).public_audience_subscribers;
    if (subscriber?.status !== "active") {
      await supabaseServiceClient.from("audience_email_deliveries").update({ status: "suppressed", event_at: new Date().toISOString() }).eq("id", delivery.id);
      continue;
    }
    await supabaseServiceClient.from("audience_email_deliveries").update({ status: "sending" }).eq("id", delivery.id);
    try {
      const unsubscribeHref = `${appOrigin}/unsubscribe?token=${subscriber.unsubscribe_token}`;
      const providerId = await sendResendEmail({
        to: delivery.recipient_email,
        subject: campaign.subject,
        html: renderAudienceEmail({
          subject: campaign.subject, previewText: campaign.preview_text, body: campaign.body,
          ctaLabel: campaign.cta_label, ctaHref: campaign.cta_href, unsubscribeHref,
        }),
        idempotencyKey: `manohub-audience-${delivery.id}`,
      });
      await supabaseServiceClient.from("audience_email_deliveries").update({
        status: "sent", provider_message_id: providerId, sent_at: new Date().toISOString(), error_message: null,
      }).eq("id", delivery.id);
      sent += 1;
    } catch (error) {
      await supabaseServiceClient.from("audience_email_deliveries").update({
        status: "failed", error_message: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed", event_at: new Date().toISOString(),
      }).eq("id", delivery.id);
      failed += 1;
    }
  }

  const { data: statuses } = await supabaseServiceClient.from("audience_email_deliveries").select("status").eq("campaign_id", campaignId);
  const allStatuses = statuses ?? [];
  const remaining = allStatuses.filter(row => row.status === "queued" || row.status === "sending").length;
  const sentCount = allStatuses.filter(row => row.status === "sent" || row.status === "delivered").length;
  const failedCount = allStatuses.filter(row => row.status === "failed" || row.status === "bounced" || row.status === "complained").length;
  await supabaseServiceClient.from("audience_email_campaigns").update({
    status: remaining ? "queued" : "sent",
    sent_count: sentCount,
    failed_count: failedCount,
    sent_at: remaining ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId);
  return { sent, failed, remaining };
}

async function dispatchTenderAlertDelivery(deliveryId: string): Promise<void> {
  if (!supabaseServiceClient) throw new Error('Tender alert delivery requires SUPABASE_SERVICE_ROLE_KEY.');
  const appOrigin = configuredAppOrigin();
  if (!appOrigin) throw new Error('Tender alert delivery requires a valid APP_URL.');
  const { data: delivery, error: deliveryError } = await supabaseServiceClient
    .from('tender_alert_deliveries')
    .select('id,user_id,recipient_email,frequency,match_ids,status,attempts')
    .eq('id', deliveryId)
    .single();
  if (deliveryError || !delivery) throw new Error('Tender alert delivery was not found.');
  if (['sent', 'delivered', 'bounced', 'complained', 'suppressed'].includes(delivery.status)) return;

  const { data: suppression } = await supabaseServiceClient
    .from('tender_alert_email_suppressions')
    .select('user_id')
    .eq('user_id', delivery.user_id)
    .maybeSingle();
  if (suppression) {
    await supabaseServiceClient.from('tender_alert_deliveries').update({
      status: 'suppressed', event_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', delivery.id);
    await supabaseServiceClient.from('saved_search_matches').update({ email_status: 'suppressed' })
      .eq('email_delivery_id', delivery.id);
    return;
  }

  const { data: matches, error: matchError } = await supabaseServiceClient
    .from('saved_search_matches')
    .select('id,match_score,saved_searches(name),opportunities(title,slug,buyer_name,submission_deadline)')
    .in('id', delivery.match_ids);
  if (matchError) throw matchError;
  const unique = new Map<string, {
    title: string; slug: string; buyerName: string; deadline: string | null; searchName: string; matchScore: number;
  }>();
  for (const match of matches ?? []) {
    const opportunity = (match as any).opportunities;
    if (!opportunity?.slug || unique.has(opportunity.slug)) continue;
    unique.set(opportunity.slug, {
      title: opportunity.title,
      slug: opportunity.slug,
      buyerName: opportunity.buyer_name,
      deadline: opportunity.submission_deadline,
      searchName: (match as any).saved_searches?.name ?? 'Saved search',
      matchScore: Number(match.match_score),
    });
  }
  const opportunities = [...unique.values()];
  if (opportunities.length === 0) throw new Error('Tender alert delivery contains no readable matches.');

  await supabaseServiceClient.from('tender_alert_deliveries').update({
    status: 'sending', attempts: Number(delivery.attempts ?? 0) + 1, updated_at: new Date().toISOString(),
  }).eq('id', delivery.id);
  const subject = delivery.frequency === 'immediate'
    ? `New tender match: ${opportunities[0].title}`
    : `${delivery.frequency === 'daily' ? 'Daily' : 'Weekly'} ManoHub tender digest · ${opportunities.length} match${opportunities.length === 1 ? '' : 'es'}`;
  const providerId = await sendResendEmail({
    to: delivery.recipient_email,
    subject,
    html: renderTenderAlertEmail({ frequency: delivery.frequency, opportunities, appOrigin }),
    idempotencyKey: `manohub-tender-alert-${delivery.id}`,
  });
  await supabaseServiceClient.from('tender_alert_deliveries').update({
    status: 'sent',
    provider_message_id: providerId,
    sent_at: new Date().toISOString(),
    error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('id', delivery.id);
  await supabaseServiceClient.from('saved_search_matches').update({ email_status: 'sent' })
    .eq('email_delivery_id', delivery.id);
}

type BackgroundJob = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

async function processAudienceEmailJobs(): Promise<{
  enqueued: number;
  recovered: number;
  claimed: number;
  completed: number;
  deferred: number;
  failed: number;
}> {
  if (!supabaseServiceClient) throw new Error("Audience email worker requires SUPABASE_SERVICE_ROLE_KEY.");

  const workerId = `audience-email:${process.pid}:${randomUUID()}`;
  const { data: audienceEnqueued, error: enqueueError } = await supabaseServiceClient
    .rpc("enqueue_due_audience_email_jobs", { p_limit: 20 });
  if (enqueueError) throw enqueueError;
  const { data: tenderEnqueued, error: tenderEnqueueError } = await supabaseServiceClient
    .rpc('enqueue_due_tender_alert_jobs', { p_limit: 50 });
  if (tenderEnqueueError) throw tenderEnqueueError;

  const { data: recovered, error: recoverError } = await supabaseServiceClient
    .rpc("recover_stalled_background_jobs_for_worker", { p_timeout_minutes: 15 });
  if (recoverError) throw recoverError;

  const { data: jobs, error: claimError } = await supabaseServiceClient
    .rpc("claim_background_jobs_for_worker", {
      p_worker_id: workerId,
      p_job_types: ["audience.email.dispatch", "tender.alert.dispatch"],
      p_limit: 10,
    });
  if (claimError) throw claimError;

  let completed = 0;
  let deferred = 0;
  let failed = 0;
  for (const job of (jobs ?? []) as BackgroundJob[]) {
    const campaignId = job.payload?.campaign_id;
    const deliveryId = job.payload?.delivery_id;
    try {
      if (job.job_type === 'tender.alert.dispatch') {
        if (typeof deliveryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deliveryId)) {
          throw new Error('Tender alert job has an invalid delivery_id.');
        }
        await dispatchTenderAlertDelivery(deliveryId);
      } else {
        if (typeof campaignId !== "string" || !/^[0-9a-f-]{36}$/i.test(campaignId)) {
          throw new Error("Audience email job has an invalid campaign_id.");
        }
        const result = await dispatchAudienceCampaign(campaignId);
        if (result.remaining > 0) {
          const { data: didDefer, error: deferError } = await supabaseServiceClient
            .rpc("defer_background_job_for_worker", {
              p_job_id: job.id,
              p_worker_id: workerId,
              p_delay_seconds: 5,
            });
          if (deferError || !didDefer) throw deferError ?? new Error("Worker no longer owns the job.");
          deferred += 1;
          continue;
        }
      }
      const { data: didComplete, error: completeError } = await supabaseServiceClient
        .rpc("complete_background_job_for_worker", {
          p_job_id: job.id,
          p_worker_id: workerId,
        });
      if (completeError || !didComplete) throw completeError ?? new Error("Worker no longer owns the job.");
      completed += 1;

      structuredLog("info", "audience_email.job.processed", {
        job_id: job.id,
        job_type: job.job_type,
        campaign_id: campaignId,
        delivery_id: deliveryId,
        attempt: job.attempts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audience email job failed.";
      const { data: nextStatus, error: failError } = await supabaseServiceClient
        .rpc("fail_background_job_for_worker", {
          p_job_id: job.id,
          p_worker_id: workerId,
          p_error: message,
        });
      if (failError) {
        structuredLog("error", "audience_email.job.fail_transition_failed", {
          job_id: job.id,
          campaign_id: typeof campaignId === "string" ? campaignId : null,
          error_message: failError.message,
        });
      }
      if (job.job_type === 'tender.alert.dispatch' && typeof deliveryId === 'string') {
        await supabaseServiceClient.from('tender_alert_deliveries').update({
          status: 'failed', error_message: message.slice(0, 500), updated_at: new Date().toISOString(),
        }).eq('id', deliveryId);
        if (nextStatus === 'dead_letter') {
          await supabaseServiceClient.from('saved_search_matches').update({ email_status: 'failed' })
            .eq('email_delivery_id', deliveryId);
        }
      }
      failed += 1;
      structuredLog("error", "audience_email.job.failed", {
        job_id: job.id,
        campaign_id: typeof campaignId === "string" ? campaignId : null,
        attempt: job.attempts,
        next_status: nextStatus ?? "unknown",
        error_message: message,
      });
    }
  }

  return {
    enqueued: Number(audienceEnqueued ?? 0) + Number(tenderEnqueued ?? 0),
    recovered: Number(recovered ?? 0),
    claimed: jobs?.length ?? 0,
    completed,
    deferred,
    failed,
  };
}

// Inject Open Graph + Twitter Card meta into the base index.html so a shared
// advert link unfurls as a rich visual ad card in social feeds (WhatsApp,
// Facebook, X, LinkedIn, Telegram). Crawlers don't run JS, so this has to be
// server-rendered; real users still get the SPA that hydrates over it.
function injectAdvertMeta(
  html: string,
  adv: { title: string; business_name: string; summary?: string | null; content?: string | null; category?: string | null; og_image_url?: string | null; creative_url?: string | null; media_url?: string | null },
  url: string,
): string {
  const title = `${adv.title} — ${adv.business_name} · Manohub`;
  const desc = (adv.summary || adv.content || `${adv.business_name} on Manohub`).slice(0, 200);
  const image = adv.og_image_url || adv.creative_url || adv.media_url || "";
  const tags = [
    `<title>${htmlEscape(title)}</title>`,
    `<meta name="description" content="${htmlEscape(desc)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Manohub" />`,
    `<meta property="og:title" content="${htmlEscape(title)}" />`,
    `<meta property="og:description" content="${htmlEscape(desc)}" />`,
    `<meta property="og:url" content="${htmlEscape(url)}" />`,
    image ? `<meta property="og:image" content="${htmlEscape(image)}" />` : "",
    image ? `<meta property="og:image:alt" content="${htmlEscape(adv.title)}" />` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${htmlEscape(title)}" />`,
    `<meta name="twitter:description" content="${htmlEscape(desc)}" />`,
    image ? `<meta name="twitter:image" content="${htmlEscape(image)}" />` : "",
  ].filter(Boolean).join("\n    ");
  // Drop the static <title> from the template, then inject before </head>.
  return html.replace(/<title>[\s\S]*?<\/title>/i, "").replace("</head>", `    ${tags}\n  </head>`);
}

function injectCmsMeta(
  html: string,
  content: {
    slug: string; content_type: string; title: string; excerpt?: string | null; body?: string | null;
    seo_title?: string | null; seo_description?: string | null; social_image_url?: string | null;
    featured_image_url?: string | null; canonical_url?: string | null; author_name?: string | null; published_at?: string | null;
  },
  url: string,
): string {
  const title = content.seo_title || content.title;
  const description = (content.seo_description || content.excerpt || content.body || "").slice(0, 200);
  const image = content.social_image_url || content.featured_image_url || "";
  const canonical = content.canonical_url || url;
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": content.content_type === "post" ? "Article" : "WebPage",
    headline: content.title,
    description,
    url: canonical,
    ...(image ? { image: [image] } : {}),
    ...(content.author_name ? { author: { "@type": "Organization", name: content.author_name } } : {}),
    ...(content.published_at ? { datePublished: content.published_at } : {}),
    publisher: { "@type": "Organization", name: "Manohub" },
  }).replace(/</g, "\\u003c");
  const tags = [
    `<title>${htmlEscape(title)} · Manohub</title>`,
    `<meta name="description" content="${htmlEscape(description)}" />`,
    `<link rel="canonical" href="${htmlEscape(canonical)}" />`,
    `<meta property="og:type" content="${content.content_type === "post" ? "article" : "website"}" />`,
    `<meta property="og:site_name" content="Manohub" />`,
    `<meta property="og:title" content="${htmlEscape(title)}" />`,
    `<meta property="og:description" content="${htmlEscape(description)}" />`,
    `<meta property="og:url" content="${htmlEscape(url)}" />`,
    image ? `<meta property="og:image" content="${htmlEscape(image)}" />` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${htmlEscape(title)}" />`,
    `<meta name="twitter:description" content="${htmlEscape(description)}" />`,
    image ? `<meta name="twitter:image" content="${htmlEscape(image)}" />` : "",
    `<script type="application/ld+json">${structuredData}</script>`,
  ].filter(Boolean).join("\n    ");
  return html.replace(/<title>[\s\S]*?<\/title>/i, "").replace("</head>", `    ${tags}\n  </head>`);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.disable('x-powered-by');
  app.use(requestObservability);

  // This route must receive the untouched request bytes: parsing or
  // re-serialising the body before verification invalidates the signature.
  app.post("/api/webhooks/resend", express.raw({ type: "application/json", limit: "250kb" }), async (req, res) => {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    const eventId = req.get("svix-id") || "";
    const timestamp = req.get("svix-timestamp") || "";
    const signature = req.get("svix-signature") || "";
    if (!webhookSecret || !supabaseServiceClient) {
      res.status(503).json({ error: { message: "Email event processing is not configured." } });
      return;
    }
    if (!Buffer.isBuffer(req.body) || !eventId || !timestamp || !signature) {
      res.status(400).json({ error: { message: "Invalid webhook request." } });
      return;
    }

    let event: WebhookEventPayload;
    try {
      event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
        payload: req.body.toString("utf8"),
        headers: { id: eventId, timestamp, signature },
        webhookSecret,
      });
    } catch {
      res.status(400).json({ error: { message: "Webhook signature verification failed." } });
      return;
    }

    if (!event.type.startsWith("email.") || event.type === "email.received" || !("email_id" in event.data)) {
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const { data: delivery, error: deliveryError } = await supabaseServiceClient
      .from("audience_email_deliveries")
      .select("id, campaign_id")
      .eq("provider_message_id", event.data.email_id)
      .maybeSingle();
    if (deliveryError) {
      res.status(500).json({ error: { message: "Email event lookup failed." } });
      return;
    }
    if (delivery) {
      const { error: insertError } = await supabaseServiceClient.from("audience_email_events").insert({
        provider_event_id: eventId,
        delivery_id: delivery.id,
        campaign_id: delivery.campaign_id,
        event_type: event.type,
        occurred_at: event.created_at,
        metadata: resendEventMetadata(event),
      });
      if (insertError && insertError.code !== "23505") {
        res.status(500).json({ error: { message: "Email event could not be recorded." } });
        return;
      }
      res.status(200).json({ received: true, duplicate: insertError?.code === "23505" });
      return;
    }

    const { data: tenderDelivery, error: tenderLookupError } = await supabaseServiceClient
      .from("tender_alert_deliveries")
      .select("id,user_id,recipient_email,status")
      .eq("provider_message_id", event.data.email_id)
      .maybeSingle();
    if (tenderLookupError) {
      res.status(500).json({ error: { message: "Tender email event lookup failed." } });
      return;
    }
    if (!tenderDelivery) {
      // Valid events for test emails or another Resend stream are acknowledged
      // so the provider does not retry them indefinitely.
      res.status(202).json({ received: true, matched: false });
      return;
    }

    const { error: tenderEventError } = await supabaseServiceClient
      .from("tender_alert_email_events")
      .insert({
        provider_event_id: eventId,
        delivery_id: tenderDelivery.id,
        event_type: event.type,
        occurred_at: event.created_at,
        metadata: resendEventMetadata(event),
      });
    if (tenderEventError?.code === "23505") {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    if (tenderEventError) {
      res.status(500).json({ error: { message: "Tender email event could not be recorded." } });
      return;
    }

    const tenderStatus = event.type === "email.delivered" ? "delivered"
      : event.type === "email.bounced" ? "bounced"
      : event.type === "email.complained" ? "complained"
      : event.type === "email.suppressed" ? "suppressed"
      : event.type === "email.failed" ? "failed"
      : null;
    if (tenderStatus) {
      const occurredAt = event.created_at || new Date().toISOString();
      const { error: statusError } = await supabaseServiceClient
        .from("tender_alert_deliveries")
        .update({ status: tenderStatus, event_at: occurredAt, updated_at: new Date().toISOString() })
        .eq("id", tenderDelivery.id);
      if (statusError) {
        res.status(500).json({ error: { message: "Tender delivery status could not be updated." } });
        return;
      }
      const matchStatus = tenderStatus === "delivered" ? "delivered"
        : ["bounced", "failed"].includes(tenderStatus) ? "failed" : "suppressed";
      await supabaseServiceClient.from("saved_search_matches").update({ email_status: matchStatus })
        .eq("email_delivery_id", tenderDelivery.id);

      const suppressionReason = tenderStatus === "bounced" ? "bounced"
        : tenderStatus === "complained" ? "complained"
        : tenderStatus === "suppressed" ? "suppressed"
        : null;
      if (suppressionReason) {
        await supabaseServiceClient.from("tender_alert_email_suppressions").upsert({
          user_id: tenderDelivery.user_id,
          email: tenderDelivery.recipient_email,
          reason: suppressionReason,
          provider_event_id: eventId,
          suppressed_at: occurredAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
    }
    res.status(200).json({ received: true, duplicate: false });
  });

  app.use(express.json({ limit: "100kb" }));

  // Tracking link redirect — resolves a short code via the SECURITY DEFINER
  // resolve_tracking_link() RPC (which also logs the click), then issues a
  // real HTTP redirect. A server route rather than a client-side SPA route
  // so it works as a real, fast, share-preview-friendly short link.
  app.get("/r/:code", redirectRateLimiter, async (req, res) => {
    if (!supabaseAuthClient) {
      res.status(503).send("Tracking links are not configured.");
      return;
    }
    const { data, error } = await supabaseAuthClient.rpc("resolve_tracking_link", {
      p_code: req.params.code,
      p_referrer_host: safeReferrerHost(req.get("referer")),
      p_visitor_token_hash: redirectVisitorToken(req, res),
    });
    if (error || !data) {
      res.status(404).send("This link is invalid or has expired.");
      return;
    }
    res.redirect(302, data);
  });

  // API Health Endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.MANOHUB_ENVIRONMENT || process.env.NODE_ENV || "development",
      version: "1.0.0",
      measurementProtection: "visitor-dedupe-v1",
      requestId: res.locals.requestId,
    });
  });

  // Sensitive state changes enter through one authenticated, validated and
  // idempotent command envelope. The caller's JWT remains attached to every
  // RPC, so existing authorization, entitlements and RLS stay authoritative.
  app.post("/api/commands", requireUser, async (req, res, next) => {
    const command = typeof req.body?.command === 'string' ? req.body.command : '';
    const payload = req.body?.payload;
    const idempotencyKey = req.get('x-idempotency-key')?.trim() || '';
    if (!COMMAND_NAME_PATTERN.test(command) || !COMMANDS[command]) {
      res.status(400).json({ error: { message: 'Unsupported command.' } }); return;
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      res.status(400).json({ error: { message: 'A valid idempotency key is required.' } }); return;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      res.status(400).json({ error: { message: 'Command payload must be an object.' } }); return;
    }

    let commandId: string | undefined;
    const client = userScopedSupabase(req);
    try {
      const definition = COMMANDS[command];
      const params = definition.params(payload as CommandPayload);
      const payloadHash = createHash('sha256').update(JSON.stringify(params)).digest('hex');
      const { data: claim, error: claimError } = await client.rpc('claim_backend_command', {
        p_command_name: command,
        p_idempotency_key: idempotencyKey,
        p_payload_hash: payloadHash,
        p_request_id: (req as RequestWithContext).requestId || randomUUID(),
      });
      if (claimError) {
        const conflict = /already processing|already used/i.test(claimError.message);
        throw Object.assign(new Error(claimError.message), { status: conflict ? 409 : 400, expose: true, code: conflict ? 'COMMAND_CONFLICT' : 'COMMAND_REJECTED' });
      }
      commandId = claim?.commandId;
      if (claim?.cached) {
        res.json({ result: claim.result, cached: true, commandId }); return;
      }

      const { data, error } = await client.rpc(definition.rpc, params);
      if (error) throw Object.assign(new Error(error.message), { status: 400, expose: true, code: 'COMMAND_REJECTED' });
      const result = data ?? null;
      const { error: completionError } = await client.rpc('complete_backend_command', { p_command_id: commandId, p_result: result });
      if (completionError) throw completionError;
      res.json({ result, cached: false, commandId });
    } catch (error) {
      if (commandId) {
        const code = typeof (error as any)?.code === 'string' ? (error as any).code : 'COMMAND_FAILED';
        await client.rpc('fail_backend_command', { p_command_id: commandId, p_error_code: code });
      }
      next(error);
    }
  });

  // Server-Side Gemini Completion Handler
  registerAiRoutes(app, requireUser);

  app.post("/api/audience-email/test", requireUser, requirePlatformAdmin, async (req, res) => {
    const { to, subject, previewText = "", body, ctaLabel = "", ctaHref = "" } = req.body ?? {};
    if (typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) {
      res.status(400).json({ error: { message: "Enter a valid test email address." } });
      return;
    }
    if (typeof subject !== "string" || !subject.trim() || subject.length > 180 || typeof body !== "string" || !body.trim() || body.length > 12000) {
      res.status(400).json({ error: { message: "A valid subject and message body are required." } });
      return;
    }
    try {
      const providerId = await sendResendEmail({
        to: to.trim().toLowerCase(),
        subject: subject.trim(),
        html: renderAudienceEmail({
          subject: subject.trim(),
          previewText: String(previewText).slice(0, 220),
          body,
          ctaLabel: String(ctaLabel).slice(0, 80),
          ctaHref: String(ctaHref).slice(0, 1000),
        }),
        idempotencyKey: `manohub-test-${(req as any).userId}-${Date.now()}`,
      });
      res.json({ id: providerId });
    } catch (error) {
      res.status(503).json({ error: { message: error instanceof Error ? error.message : "Test delivery failed." } });
    }
  });

  app.post("/api/audience-email/dispatch/:campaignId", requireUser, requirePlatformAdmin, async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.campaignId)) {
      res.status(400).json({ error: { message: "Invalid campaign identifier." } });
      return;
    }
    try {
      res.json(await dispatchAudienceCampaign(req.params.campaignId, true));
    } catch (error) {
      res.status(503).json({ error: { message: error instanceof Error ? error.message : "Campaign delivery failed." } });
    }
  });

  app.post("/api/audience-email/dispatch-due", async (req, res) => {
    const expectedSecret = process.env.EMAIL_DISPATCH_SECRET?.trim();
    const suppliedSecret = req.get("x-manohub-dispatch-secret")?.trim();
    if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret || !supabaseServiceClient) {
      res.status(403).json({ error: { message: "Dispatch authorization failed." } });
      return;
    }
    try {
      res.json(await processAudienceEmailJobs());
    } catch (error) {
      structuredLog("error", "audience_email.worker.failed", {
        error_message: error instanceof Error ? error.message : "Audience email worker failed.",
      });
      res.status(503).json({
        error: { message: error instanceof Error ? error.message : "Audience email worker failed." },
      });
    }
  });

  // API requests must always receive a JSON error contract. Without this
  // boundary, unknown /api paths fall through to the SPA and return HTML.
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: {
        code: 'API_ROUTE_NOT_FOUND',
        message: 'The requested API endpoint does not exist.',
        requestId: res.locals.requestId,
      },
    });
  });

  // Vite Middleware Setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const indexHtml = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
    app.use(express.static(distPath));

    // Rich social unfurl: serve advert detail pages with injected OG/Twitter
    // meta so a shared link renders as a visual ad card in feeds. Falls back to
    // the plain SPA shell for unknown/not-live slugs.
    app.get("/adverts/:slug", async (req, res) => {
      let out = indexHtml;
      try {
        if (supabaseAuthClient) {
          const { data } = await supabaseAuthClient
            .from("adverts")
            .select("slug, title, business_name, summary, content, category, og_image_url, creative_url, media_url, status")
            .eq("slug", req.params.slug)
            .maybeSingle();
          if (data && data.status === "live") {
            const base = requestOrigin(req);
            if (base) out = injectAdvertMeta(indexHtml, data, `${base}/adverts/${data.slug}`);
          }
        }
      } catch {
        /* fall back to the default shell */
      }
      res.set("Content-Type", "text/html; charset=utf-8").send(out);
    });

    app.get(["/insights/:slug", "/pages/:slug"], async (req, res) => {
      let out = indexHtml;
      try {
        if (supabaseAuthClient) {
          const { data } = await supabaseAuthClient.from("cms_content")
            .select("slug, content_type, title, excerpt, body, seo_title, seo_description, social_image_url, featured_image_url, canonical_url, author_name, published_at")
            .eq("slug", req.params.slug)
            .eq("content_type", req.path.startsWith("/insights/") ? "post" : "page")
            .maybeSingle();
          const base = requestOrigin(req);
          if (data && base) out = injectCmsMeta(indexHtml, data, `${base}${req.path}`);
        }
      } catch {
        /* fall back to the default shell */
      }
      res.set("Content-Type", "text/html; charset=utf-8").send(out);
    });

    app.get("/sitemap.xml", async (req, res) => {
      const base = requestOrigin(req);
      if (!base || !supabaseAuthClient) {
        res.status(503).type("text/plain").send("Sitemap is not configured.");
        return;
      }
      const { data } = await supabaseAuthClient.from("cms_content")
        .select("content_type, slug, updated_at")
        .order("updated_at", { ascending: false });
      const urls = [
        { loc: base, lastmod: null },
        { loc: `${base}/tenders`, lastmod: null },
        { loc: `${base}/adverts`, lastmod: null },
        { loc: `${base}/insights`, lastmod: null },
        ...(data ?? []).map(item => ({
          loc: `${base}/${item.content_type === "post" ? "insights" : "pages"}/${item.slug}`,
          lastmod: item.updated_at,
        })),
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(item => `  <url><loc>${htmlEscape(item.loc)}</loc>${item.lastmod ? `<lastmod>${htmlEscape(item.lastmod)}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>`;
      res.set("Content-Type", "application/xml; charset=utf-8").send(xml);
    });

    app.get("/robots.txt", (req, res) => {
      const base = requestOrigin(req);
      res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /cms-preview/\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ""}`);
    });

    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Express only routes an error to a handler registered after the middleware
  // that threw, so the boundary has to come last — after the API routes, the
  // Vite middleware and the SPA fallback.
  app.use(requestErrorBoundary);

  app.listen(PORT, "0.0.0.0", () => {
    structuredLog('info', 'server.started', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
    });
  });
}

process.on('unhandledRejection', (reason) => {
  structuredLog('error', 'process.unhandled_rejection', {
    error_name: reason instanceof Error ? reason.name : 'UnhandledRejection',
    error_message: reason instanceof Error ? reason.message : String(reason).slice(0, 500),
  });
});

process.on('uncaughtExceptionMonitor', (error, origin) => {
  structuredLog('error', 'process.uncaught_exception', {
    error_name: error.name,
    error_message: error.message,
    origin,
  });
});

startServer().catch((error) => {
  structuredLog('error', 'server.startup.failed', {
    error_name: error instanceof Error ? error.name : 'UnknownError',
    error_message: error instanceof Error ? error.message : 'Unknown startup failure',
  });
  process.exit(1);
});
