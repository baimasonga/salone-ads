import { createAudienceEmailModule } from "./server/email/audienceEmail.js";
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
  'organization.purge': { rpc: 'admin_purge_subscriber', params: p => ({ p_org_id: commandUuid(p, 'orgId'), p_confirmation: commandField(p, 'confirmation', 300), p_reason: commandField(p, 'reason', 1000) }) },
  'subscription.transition': { rpc: 'transition_subscription', params: p => ({ p_subscription_id: commandUuid(p, 'subscriptionId'), p_action: oneOf(commandField(p, 'action', 30), ['start_trial','activate','renew','mark_past_due','start_grace','suspend','resume','schedule_cancel','cancel','expire'], 'action'), p_reason: commandField(p, 'reason', 1000, true), p_effective_date: commandField(p, 'effectiveDate', 10, true) }) },
  'advertising.order.create': { rpc: 'create_advert_order', params: p => ({ p_org_id: commandUuid(p, 'orgId'), p_campaign_id: commandUuid(p, 'campaignId', true), p_package_id: commandUuid(p, 'packageId'), p_billing_period: oneOf(commandField(p, 'billingPeriod', 20), ['daily','weekly','monthly'], 'billingPeriod'), p_payment_method: commandField(p, 'paymentMethod', 80), p_payment_reference: commandField(p, 'paymentReference', 200, true) }) },
  'organization.verification.approve': { rpc: 'admin_approve_organization_verification', params: p => ({ p_request_id: commandUuid(p, 'requestId'), p_org_id: commandUuid(p, 'orgId'), p_request_type: oneOf(commandField(p, 'requestType', 20), ['supplier','buyer'], 'requestType') }) },
  'procurement.ingestion.promote': { rpc: 'promote_opportunity_ingestion_item', params: p => ({ p_item_id: commandUuid(p, 'itemId') }) },
  'billing.payment.record': { rpc: 'record_commercial_payment', params: p => ({ p_invoice_id: commandUuid(p, 'invoiceId'), p_reference: commandField(p, 'reference', 200), p_method: commandField(p, 'method', 80), p_amount: commandAmount(p, 'amount') }) },
  'billing.credit.issue': { rpc: 'issue_commercial_credit', params: p => ({ p_invoice_id: commandUuid(p, 'invoiceId'), p_credit_number: commandField(p, 'creditNumber', 100), p_amount: commandAmount(p, 'amount'), p_reason: commandField(p, 'reason', 1000) }) },
  'billing.refund.record': { rpc: 'record_commercial_refund', params: p => ({ p_payment_id: commandUuid(p, 'paymentId'), p_refund_reference: commandField(p, 'refundReference', 200), p_amount: commandAmount(p, 'amount'), p_reason: commandField(p, 'reason', 1000) }) },
  'platform_staff.update': { rpc: 'admin_update_platform_staff', params: p => ({ p_user_id: commandUuid(p, 'userId'), p_action: oneOf(commandField(p, 'action', 30), ['change_role','suspend','reactivate','revoke'], 'action'), p_role: commandField(p, 'role', 30, true), p_reason: commandField(p, 'reason', 1000, true) }) },
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

const audienceEmail = createAudienceEmailModule({
  serviceClient: supabaseServiceClient,
  configuredAppOrigin,
  htmlEscape,
  structuredLog,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.disable('x-powered-by');
  app.use(requestObservability);
  audienceEmail.registerWebhook(app);


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

  app.post('/api/platform-staff/invitations', requireUser, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!supabaseServiceClient) {
        throw Object.assign(new Error('Staff invitations are not configured on this deployment.'), { status: 503, expose: true, code: 'STAFF_INVITES_NOT_CONFIGURED' });
      }
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const role = typeof req.body?.role === 'string' ? req.body.role : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
        throw Object.assign(new Error('A valid work email is required.'), { status: 400, expose: true });
      }
      if (!['administrator','finance','editorial','support','auditor'].includes(role)) {
        throw Object.assign(new Error('A valid staff role is required.'), { status: 400, expose: true });
      }

      let staffUser: { id: string; email?: string } | undefined;
      for (let page = 1; page <= 10 && !staffUser; page += 1) {
        const { data, error } = await supabaseServiceClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        staffUser = data.users.find((user) => user.email?.toLowerCase() === email);
        if (data.users.length < 1000) break;
      }
      let invitationSent = false;
      if (!staffUser) {
        const origin = requestOrigin(req);
        const { data, error } = await supabaseServiceClient.auth.admin.inviteUserByEmail(email, {
          redirectTo: origin ? `${origin}/?auth=signin` : undefined,
          data: { invited_for: 'platform_staff' },
        });
        if (error || !data.user) throw error || new Error('Supabase did not create the invited user.');
        staffUser = data.user;
        invitationSent = true;
      }

      const { error: upsertError } = await supabaseServiceClient.from('platform_staff_members').upsert({
        user_id: staffUser.id,
        email,
        role,
        status: invitationSent ? 'invited' : 'active',
        invited_by: (req as RequestWithContext).userId,
        invited_at: new Date().toISOString(),
        accepted_at: invitationSent ? null : new Date().toISOString(),
        suspended_at: null,
        suspension_reason: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (upsertError) throw upsertError;
      await supabaseServiceClient.from('audit_logs').insert({
        actor_id: (req as RequestWithContext).userId,
        action: invitationSent ? 'platform_staff.invited' : 'platform_staff.access_granted',
        entity_type: 'platform_staff',
        entity_id: staffUser.id,
        metadata: { email, role },
      });
      res.status(invitationSent ? 201 : 200).json({ result: { userId: staffUser.id, invitationSent } });
    } catch (error) {
      next(error);
    }
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
  audienceEmail.registerRoutes(app, requireUser, requirePlatformAdmin);


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
