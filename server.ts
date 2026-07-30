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

const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).userId || req.ip || "anonymous",
  message: { error: { message: "Too many AI requests. Please wait a moment and try again." } },
});

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

const MAX_PROMPT_LENGTH = 2000;
const MAX_FIELD_LENGTH = 300;
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

  // Server-Side Gemini Completion Handler
  app.post("/api/gemini/generate", requireUser, aiRateLimiter, async (req, res) => {
    const { prompt, option, toneOfVoice, brandName, tagline, mission } = req.body;

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      res.status(400).json({ error: { message: "Prompt is required" } });
      return;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({ error: { message: `Prompt must be under ${MAX_PROMPT_LENGTH} characters.` } });
      return;
    }
    for (const [key, value] of Object.entries({ toneOfVoice, brandName, tagline, mission })) {
      if (value !== undefined && (typeof value !== "string" || value.length > MAX_FIELD_LENGTH)) {
        res.status(400).json({ error: { message: `${key} must be a string under ${MAX_FIELD_LENGTH} characters.` } });
        return;
      }
    }

    // 'captions'/'copy' and 'ideas' generate multiple discrete variants that
    // become individual Content Studio drafts -- ask Gemini for structured
    // JSON so the client can render one card per variant instead of a single
    // blob of text the admin has to hand-parse. 'script' and 'brief' are
    // each naturally a single block of prose, so they stay plain text.
    const structuredFormat: "captions" | "ideas" | null =
      option === "captions" || option === "copy" ? "captions" : option === "ideas" ? "ideas" : null;

    try {
      // Lazy check and fallback to local interactive completion model if no custom key exists
      const hasKey = process.env.GEMINI_API_KEY &&
                     process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" &&
                     process.env.GEMINI_API_KEY.trim() !== "";

      if (!hasKey) {
        if (structuredFormat) {
          res.json({ format: structuredFormat, items: getMockAIVariants(structuredFormat, prompt, toneOfVoice, brandName) });
        } else {
          res.json({ format: "text", text: getMockAIResponse(prompt, option, toneOfVoice, brandName) });
        }
        return;
      }

      // Initialize the official GoogleGenAI client (ESM lazy import)
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Craft tailored system instructions based on Brand Tone of Voice
      let systemInstruction = "You are an expert advertising copywriter and content strategist specializing in Sierra Leone and West African markets, as well as the global diaspora.";

      if (brandName) {
        systemInstruction += ` You are generating content for the brand: "${brandName}".`;
      }
      if (tagline) {
        systemInstruction += ` Brand tagline: "${tagline}".`;
      }
      if (mission) {
        systemInstruction += ` Brand mission/goal: "${mission}".`;
      }
      if (toneOfVoice) {
        systemInstruction += ` You MUST write strictly in this tone of voice: "${toneOfVoice}". Make sure the generated copy sounds natural, authentic, and adheres perfectly to these tone parameters.`;
      } else {
        systemInstruction += ` Write in a Warm, Honest, Proudly Leonean tone of voice.`;
      }

      // Tailor instructions based on selected option
      let targetedPrompt = prompt;
      if (structuredFormat === "captions") {
        targetedPrompt = `Generate exactly 3 high-converting social media post caption variants based on this topic or objective: "${prompt}".
Respond with ONLY a valid JSON array (no markdown, no commentary, no code fences) of exactly 3 objects, each shaped exactly like:
{"headline": "a short catchy headline/hook", "body": "the full caption text, including appropriate local emojis and a call-to-action such as WhatsApp ordering info or local delivery highlights", "hashtags": ["#Tag1", "#Tag2", "#Tag3"]}`;
      } else if (structuredFormat === "ideas") {
        targetedPrompt = `Generate exactly 4 highly creative and actionable social media content ideas based on this brand goal or topic: "${prompt}".
Respond with ONLY a valid JSON array (no markdown, no commentary, no code fences) of exactly 4 objects, each shaped exactly like:
{"title": "idea title", "concept": "brief concept detail, why it works for this audience", "platform": "recommended platform, e.g. Facebook, WhatsApp, TikTok, Instagram", "executionStep": "one concrete step to launch it"}`;
      } else if (option === 'script') {
        targetedPrompt = `Generate a professional radio or television advertisement script based on this product/goal: "${prompt}". Include character directions, sound effect cues [SFX], and a strong Leonean call to action.`;
      } else if (option === 'brief') {
        targetedPrompt = `Generate a comprehensive campaign brief based on: "${prompt}". Include key objectives, target audience description (local vs diaspora), recommended channel breakdown, and risk mitigations.`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: targetedPrompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.75,
          ...(structuredFormat ? { responseMimeType: "application/json" } : {}),
        }
      });

      const rawText = response.text || "";

      if (structuredFormat) {
        const items = parseJsonArrayLoose(rawText);
        if (items) {
          res.json({ format: structuredFormat, items });
          return;
        }
        // Gemini didn't return parseable JSON despite the instruction -- fall
        // back to showing the raw text rather than erroring the whole request.
        res.json({ format: "text", text: rawText || "No content returned." });
        return;
      }

      res.json({ format: "text", text: rawText || "No content returned." });
    } catch (err: any) {
      console.error("Gemini Server Error:", err);
      res.status(500).json({
        error: {
          code: "GEMINI_ERROR",
          message: "An error occurred calling the Gemini AI service. Please try again shortly."
        }
      });
    }
  });

  // Procurement AI Assist Handler (separate from the ad-copywriting endpoint
  // above — different domain, different system instruction, same auth +
  // rate-limit pattern).
  app.post("/api/gemini/procurement-assist", requireUser, aiRateLimiter, async (req, res) => {
    const { mode, text, sectorNames } = req.body;

    if (typeof mode !== "string" || !["suggest_sector", "explain_tender"].includes(mode)) {
      res.status(400).json({ error: { message: "mode must be 'suggest_sector' or 'explain_tender'." } });
      return;
    }
    if (typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({ error: { message: "text is required" } });
      return;
    }
    if (text.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({ error: { message: `text must be under ${MAX_PROMPT_LENGTH} characters.` } });
      return;
    }
    if (mode === "suggest_sector" && (!Array.isArray(sectorNames) || sectorNames.length === 0)) {
      res.status(400).json({ error: { message: "sectorNames is required for suggest_sector" } });
      return;
    }

    try {
      const hasKey = process.env.GEMINI_API_KEY &&
                     process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" &&
                     process.env.GEMINI_API_KEY.trim() !== "";

      if (!hasKey) {
        res.json({ text: getMockProcurementAIResponse(mode, text, sectorNames) });
        return;
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      let systemInstruction: string;
      let targetedPrompt: string;

      if (mode === "suggest_sector") {
        systemInstruction = "You are a procurement classification assistant. Given a tender title and description, respond with ONLY the single best-matching sector name from the provided list, and nothing else.";
        targetedPrompt = `Sectors: ${(sectorNames as string[]).join(", ")}\n\nTender: "${text}"\n\nWhich single sector from the list best matches? Reply with only the sector name, exactly as given.`;
      } else {
        systemInstruction = "You are a plain-language assistant explaining government and NGO procurement tenders to small business owners in Sierra Leone who may not be familiar with procurement jargon. Be concise, concrete, and avoid legal/technical terms where possible. Never claim that following your explanation guarantees winning the tender.";
        targetedPrompt = `Explain this tender in simple, plain language (3-5 short sentences, no jargon):\n\n"${text}"`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: targetedPrompt,
        config: { systemInstruction, temperature: mode === "suggest_sector" ? 0.1 : 0.5 }
      });

      res.json({ text: response.text });
    } catch (err: any) {
      console.error("Gemini Procurement Assist Error:", err);
      res.status(500).json({
        error: { code: "GEMINI_ERROR", message: "An error occurred calling the AI assist service. Please try again shortly." }
      });
    }
  });

  // Drafts a follow-up message for a single CRM lead. Suggest-only: this
  // never sends anything itself -- the client turns the drafted text into a
  // real wa.me/mailto deep link so the actual send is a genuine admin action
  // through their own WhatsApp/email client, not an automated dispatch.
  app.post("/api/gemini/lead-followup", requireUser, aiRateLimiter, async (req, res) => {
    const { leadName, leadSource, leadDistrict, estimatedValue, channel, toneOfVoice, brandName } = req.body;

    if (typeof leadName !== "string" || leadName.trim().length === 0) {
      res.status(400).json({ error: { message: "leadName is required" } });
      return;
    }
    if (channel !== "whatsapp" && channel !== "email") {
      res.status(400).json({ error: { message: "channel must be 'whatsapp' or 'email'." } });
      return;
    }
    for (const [key, value] of Object.entries({ leadSource, leadDistrict, toneOfVoice, brandName })) {
      if (value !== undefined && value !== null && (typeof value !== "string" || value.length > MAX_FIELD_LENGTH)) {
        res.status(400).json({ error: { message: `${key} must be a string under ${MAX_FIELD_LENGTH} characters.` } });
        return;
      }
    }
    if (estimatedValue !== undefined && estimatedValue !== null && typeof estimatedValue !== "number") {
      res.status(400).json({ error: { message: "estimatedValue must be a number." } });
      return;
    }

    try {
      const hasKey = process.env.GEMINI_API_KEY &&
                     process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" &&
                     process.env.GEMINI_API_KEY.trim() !== "";

      if (!hasKey) {
        res.json({ text: getMockLeadFollowup(leadName, leadSource, channel, brandName) });
        return;
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const name = (brandName as string) || "our team";
      const tone = (toneOfVoice as string) || "Warm, Honest, Proudly Leonean";
      const channelNote = channel === "whatsapp"
        ? "Write it for WhatsApp: short (under 400 characters), conversational, light emoji use is fine, end with a clear question or call to action."
        : "Write it as a short email body (no more than 5 short paragraphs), slightly more formal, no emoji, end with a clear call to action.";

      const systemInstruction = `You are a friendly sales follow-up writer for "${name}", a business in Sierra Leone. You MUST write in this tone of voice: "${tone}". Never fabricate promises, discounts, or guarantees that weren't stated.`;
      const targetedPrompt = `Draft a follow-up message to a sales lead named "${leadName}"${leadSource ? `, who came in through "${leadSource}"` : ""}${leadDistrict ? `, based in ${leadDistrict}` : ""}${estimatedValue ? `, with an estimated deal value of Le ${Number(estimatedValue).toLocaleString()}` : ""}. The goal is to re-engage them and move the conversation forward. ${channelNote}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: targetedPrompt,
        config: { systemInstruction, temperature: 0.6 }
      });

      res.json({ text: response.text || "" });
    } catch (err: any) {
      console.error("Gemini Lead Follow-up Error:", err);
      res.status(500).json({
        error: { code: "GEMINI_ERROR", message: "An error occurred calling the AI assist service. Please try again shortly." }
      });
    }
  });

  // Proposes a spread of content drafts for a campaign's date range. Returns
  // suggestions only -- nothing is written to content_items here; the client
  // shows them as a preview and the admin picks which ones to actually create
  // (via the existing createContentItem path), same suggest-only contract as
  // the rest of the Content Studio AI panel.
  app.post("/api/gemini/content-plan", requireUser, aiRateLimiter, async (req, res) => {
    const { campaignName, campaignObjective, campaignDescription, startDate, endDate, toneOfVoice, brandName, tagline, mission } = req.body;

    if (typeof campaignName !== "string" || campaignName.trim().length === 0) {
      res.status(400).json({ error: { message: "campaignName is required" } });
      return;
    }
    if (typeof startDate !== "string" || typeof endDate !== "string") {
      res.status(400).json({ error: { message: "startDate and endDate are required" } });
      return;
    }
    for (const [key, value] of Object.entries({ campaignObjective, campaignDescription, toneOfVoice, brandName, tagline, mission })) {
      if (value !== undefined && value !== null && (typeof value !== "string" || value.length > MAX_FIELD_LENGTH)) {
        res.status(400).json({ error: { message: `${key} must be a string under ${MAX_FIELD_LENGTH} characters.` } });
        return;
      }
    }

    try {
      const hasKey = process.env.GEMINI_API_KEY &&
                     process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" &&
                     process.env.GEMINI_API_KEY.trim() !== "";

      if (!hasKey) {
        res.json({ items: getMockContentPlan(campaignName, startDate, endDate, brandName) });
        return;
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const name = (brandName as string) || "our team";
      const tone = (toneOfVoice as string) || "Warm, Honest, Proudly Leonean";

      const systemInstruction = `You are a social media content planner for "${name}", a business in Sierra Leone. Write in this tone of voice: "${tone}".`;
      const targetedPrompt = `Propose a content plan for this campaign, spreading posts evenly across the date range:
Campaign: "${campaignName}"
Objective: ${campaignObjective || "not specified"}
Description: ${campaignDescription || "not specified"}
Date range: ${startDate} to ${endDate}

Respond with ONLY a valid JSON array (no markdown, no commentary, no code fences) of 3 to 6 objects, each shaped exactly like:
{"title": "internal draft title", "contentType": "Social Post" | "WhatsApp Promo" | "Video Script" | "Radio Brief" | "Email News", "platform": "e.g. Facebook, WhatsApp, Instagram", "headline": "short hook", "body": "the full caption/script text", "hashtags": ["#Tag1", "#Tag2"], "scheduledDate": "YYYY-MM-DD within the given range"}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: targetedPrompt,
        config: { systemInstruction, temperature: 0.7, responseMimeType: "application/json" }
      });

      const items = parseJsonArrayLoose(response.text || "");
      res.json({ items: items || [] });
    } catch (err: any) {
      console.error("Gemini Content Plan Error:", err);
      res.status(500).json({
        error: { code: "GEMINI_ERROR", message: "An error occurred calling the AI assist service. Please try again shortly." }
      });
    }
  });

  app.post("/api/gemini/advert-copy", requireUser, aiRateLimiter, async (req, res) => {
    const { businessName, category, subject, description, toneOfVoice } = req.body;
    if (typeof subject !== "string" || subject.trim().length === 0) {
      res.status(400).json({ error: { message: "subject is required" } });
      return;
    }
    for (const [key, value] of Object.entries({ businessName, category, description, toneOfVoice })) {
      if (value !== undefined && value !== null && (typeof value !== "string" || value.length > MAX_FIELD_LENGTH)) {
        res.status(400).json({ error: { message: `${key} must be a string under ${MAX_FIELD_LENGTH} characters.` } });
        return;
      }
    }

    try {
      const hasKey = process.env.GEMINI_API_KEY &&
                     process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" &&
                     process.env.GEMINI_API_KEY.trim() !== "";
      if (!hasKey) {
        res.json(getMockAdvertCopy(subject, description));
        return;
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const tone = (toneOfVoice as string) || "Confident, warm, plain-spoken";
      const systemInstruction = `You are an advertising copywriter for a Sierra Leone / Liberia marketplace. Write short, punchy, honest ad copy in this tone: "${tone}". No emojis, no hype words like "revolutionary".`;
      const prompt = `Tighten this into advert copy for "${businessName || "a local business"}"${category ? ` (category: ${category})` : ""}.
Subject: ${subject}
Details: ${description || "not specified"}

Respond with ONLY a valid JSON object (no markdown, no code fences) shaped exactly like:
{"headline": "punchy headline, max ~7 words", "body": "1-2 sentence advert body, max ~30 words"}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { systemInstruction, temperature: 0.7, responseMimeType: "application/json" }
      });

      const parsed = parseJsonObjectLoose(response.text || "");
      res.json(parsed && parsed.headline ? { headline: String(parsed.headline), body: String(parsed.body || "") } : getMockAdvertCopy(subject, description));
    } catch (err: any) {
      console.error("Gemini Advert Copy Error:", err);
      res.status(500).json({
        error: { code: "GEMINI_ERROR", message: "An error occurred calling the AI assist service. Please try again shortly." }
      });
    }
  });

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

// Gemini is instructed to return raw JSON, but models occasionally wrap it in
// a markdown code fence despite that instruction -- strip one if present
// before parsing, and return null (never throw) so the caller can fall back
// to plain text instead of failing the whole request.
function parseJsonArrayLoose(raw: string): any[] | null {
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

function parseJsonObjectLoose(raw: string): Record<string, any> | null {
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
function getMockAdvertCopy(subject: string, description?: string): { headline: string; body: string } {
  const headline = subject.trim().replace(/\.$/, "").slice(0, 60) || "Now available";
  const body = (description || subject).trim().replace(/\s+/g, " ").slice(0, 140);
  return { headline, body };
}

// Structured local fallback for 'captions'/'ideas' when no Gemini key is
// configured -- mirrors getMockAIResponse's flavor text below, but shaped as
// discrete items instead of one text blob, matching what the real Gemini
// call returns for these two modes.
function getMockAIVariants(
  format: "captions" | "ideas",
  prompt: string,
  toneOfVoice?: string,
  brandName?: string
): any[] {
  const tone = toneOfVoice || "Warm, Honest, Proudly Leonean";
  const name = brandName || "Sierra Organic";

  if (format === "ideas") {
    return [
      {
        title: "Our Farmers, Our Heroes Video Series",
        concept: `Short video profiles highlighting smallholder farmers sourcing for ${name}, in a "${tone}" tone.`,
        platform: "Facebook & TikTok",
        executionStep: "Post a 30-second clip of a farmer sharing their harvest story with a warm, personal caption.",
      },
      {
        title: "Taste of Home Diaspora Giveaway",
        concept: "Encourage diaspora followers to share their favorite home memory for a chance to gift goods to their family.",
        platform: "WhatsApp & Facebook",
        executionStep: "Create an eye-catching graphic asking for stories in the comments.",
      },
      {
        title: "Behind-the-Scenes Packing Day",
        concept: "Real-time, transparent showcase of quality control and safe shipping of goods.",
        platform: "Facebook Stories",
        executionStep: "Take vertical snapshot photos showing neat packaging and happy drivers.",
      },
      {
        title: "Weekly Interactive Polls",
        concept: `Ask customers what local recipes they want tips on, tied to this goal: "${prompt}".`,
        platform: "WhatsApp Business Status",
        executionStep: "Post a status update poll using standard Leonean culinary favorites.",
      },
    ];
  }

  return [
    {
      headline: "Pure, Fresh, Proudly Local",
      body: `Pure, fresh, and harvested directly from our rich soils by ${name}. Bring genuine home flavor back to your dinner table! Order local, support local farmers, and feel Salone pride. 🌾💚`,
      hashtags: ["#Manohub", "#EatSalone", "#ProudlyLeonean"],
    },
    {
      headline: "Home, Delivered",
      body: `Send premium local products from ${name} directly to your family in Freetown with zero hassle. Safe, local, and empowering. Sponsored with love. 🇸🇱`,
      hashtags: ["#Manohub", "#DiasporaLove"],
    },
    {
      headline: "Taste You Trust",
      body: `Feed your family with the finest organic quality from ${name}. Taste you remember, standards you trust. Delivered in 48 hours.`,
      hashtags: ["#EatSalone", "#Manohub"],
    },
  ];
}

// Multi-template local simulated responses for low-bandwidth / offline or local key fallback
function getMockAIResponse(prompt: string, option: string, toneOfVoice?: string, brandName?: string): string {
  const tone = toneOfVoice || "Warm, Honest, Proudly Leonean";
  const name = brandName || "Sierra Organic";

  if (option === "brief") {
    return `[LOCAL BACKUP AI BRIEF GENERATION]
Brand Context: ${name}
Target Tone: ${tone}

### Campaign Setup ("${prompt}")
- Structured for organic Facebook and direct WhatsApp outreach.
- High impact visual layout optimized for standard smartphones.
- Campaign tagline: "Harvested with pride, shared with love."
- Focuses on the core mission of "${name}" in a "${tone}" tone of voice.

**Audience Profile:**
- Sierra Leonean diaspora sponsoring local goods for parents back home.

**Recommended Channels:**
- WhatsApp Business, Facebook Videos, and local radio broadcasts.`;
  } else if (option === "copy" || option === "captions") {
    return `[LOCAL BACKUP AI SOCIAL CAPTION GENERATION]
Brand Context: ${name}
Target Tone: ${tone}

Variant 1 (Proud & Local):
"Pure, fresh, and harvested directly from our rich soils by ${name}. Bring genuine home flavor back to your dinner table! Order local, support local farmers, and feel Salone pride. 🌾💚"

Variant 2 (Diaspora Connection):
"Send premium local products from ${name} directly to your family in Freetown with zero hassle. Safe, local, and empowering. Sponsored with love. 🇸🇱"

Variant 3 (Modern / Everyday):
"Feed your family with the finest organic quality from ${name}. Taste you remember, standards you trust. Delivered in 48 hours. #EatSalone #Manohub"`;
  } else if (option === "ideas") {
    return `[LOCAL BACKUP AI CONTENT IDEAS GENERATION]
Brand Context: ${name}
Target Tone: ${tone}

Idea 1: "Our Farmers, Our Heroes" Video Series
- Platform: Facebook & TikTok
- Concept: Short video profiles highlighting smallholder farmers in Bo or Kenema sourcing for ${name}.
- Action: Post a 30-second clip of a farmer sharing their harvest story with a warm, personal caption.

Idea 2: "Taste of Home" Diaspora Giveaway
- Platform: WhatsApp & Facebook
- Concept: Encourage diaspora followers to share their favorite home memory for a chance to gift a bag of goods to their family.
- Action: Create an eye-catching graphic with a "${tone}" caption asking for stories in the comments.

Idea 3: Behind-the-Scenes Packing Day
- Platform: Facebook Stories
- Concept: Real-time, transparent showcase of quality control and safe shipping of goods.
- Action: Take vertical snapshot photos showing neat packaging and happy drivers.

Idea 4: Weekly Interactive Polls
- Platform: WhatsApp Business Status
- Concept: Ask customers what local recipes they want tips on.
- Action: Post a status update poll using standard Leonean culinary favorites.`;
  } else if (option === "script") {
    return `[LOCAL BACKUP AI RADIO SCRIPT GENERATION]
Brand Context: ${name}
Target Tone: ${tone}

[SOUND EFFECT: Acoustic drums, lively but warm Leonean beat plays softly in the background]

NARRATOR (Expressive, warm Sierra Leonean accent matching a "${tone}" vibe):
"Wetin sweeter pass we own local flavor? Nothing! ${name} brings you our very own organic native foods, harvested with pride."

[SOUND EFFECT: Sound of packaging, laughter of family in a cozy kitchen]

NARRATOR:
"Support our local farmers, feed your family with real nutrition. Easy to order from UK, USA, or right here in Sierra Leone. Connecting our growth, together."

CTA (Call To Action):
"WhatsApp us at +232 76 000 000. ${name}: Connecting our growth."`;
  }
  return `### ${name} Brand Campaign Setup ("${prompt}")
- Styled with a "${tone}" tone of voice.
- Campaign tagline: "Harvested with pride, shared with love."`;
}

// Local fallback for procurement AI assist when no Gemini key is configured.
function getMockProcurementAIResponse(mode: string, text: string, sectorNames?: string[]): string {
  if (mode === "suggest_sector") {
    const lower = text.toLowerCase();
    const match = (sectorNames || []).find((s) => lower.includes(s.toLowerCase()));
    return match || (sectorNames && sectorNames[0]) || "General";
  }
  return `[LOCAL BACKUP SUMMARY] This tender is asking qualified businesses to submit a bid. Read the deadline, eligibility, and submission instructions carefully, and reach out to the buyer's contact if anything is unclear before you apply. (AI summary unavailable — configure GEMINI_API_KEY for full explanations.)`;
}

// Local fallback for lead follow-up drafting when no Gemini key is configured.
function getMockLeadFollowup(leadName: string, leadSource: string | undefined, channel: string, brandName?: string): string {
  const name = brandName || "our team";
  if (channel === "whatsapp") {
    return `Hi ${leadName}! 👋 This is ${name} following up on your enquiry${leadSource ? ` via ${leadSource}` : ""}. Are you still interested in moving forward? Happy to answer any questions here on WhatsApp.`;
  }
  return `Hi ${leadName},\n\nI wanted to follow up on your recent enquiry with ${name}${leadSource ? ` via ${leadSource}` : ""}. Please let me know if you have any questions or would like to move forward — happy to help.\n\nBest regards,\n${name}`;
}

// Local fallback for content-plan suggestions when no Gemini key is configured.
function getMockContentPlan(campaignName: string, startDate: string, endDate: string, brandName?: string): any[] {
  const name = brandName || "Sierra Organic";
  const start = new Date(startDate);
  const end = new Date(endDate);
  const spanMs = Math.max(0, end.getTime() - start.getTime());
  const dateAt = (fraction: number) => new Date(start.getTime() + spanMs * fraction).toISOString().split("T")[0];

  return [
    {
      title: `${campaignName} — Announcement`,
      contentType: "Social Post",
      platform: "Facebook",
      headline: `Introducing: ${campaignName}`,
      body: `[LOCAL BACKUP CONTENT PLAN] ${name} is excited to launch "${campaignName}"! Stay tuned for more details. 🌾`,
      hashtags: ["#Manohub", "#EatSalone"],
      scheduledDate: dateAt(0),
    },
    {
      title: `${campaignName} — Mid-campaign reminder`,
      contentType: "WhatsApp Promo",
      platform: "WhatsApp",
      headline: `Don't miss out — ${campaignName}`,
      body: `[LOCAL BACKUP CONTENT PLAN] Reminder from ${name}: "${campaignName}" is still going strong. Message us to find out more.`,
      hashtags: ["#Manohub"],
      scheduledDate: dateAt(0.5),
    },
    {
      title: `${campaignName} — Closing push`,
      contentType: "Social Post",
      platform: "Facebook & Instagram",
      headline: `Last chance: ${campaignName}`,
      body: `[LOCAL BACKUP CONTENT PLAN] ${name} wraps up "${campaignName}" soon — don't miss your chance to get involved.`,
      hashtags: ["#Manohub", "#EatSalone"],
      scheduledDate: dateAt(0.9),
    },
  ];
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
