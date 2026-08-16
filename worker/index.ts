// Entrypoint Worker for running the existing Express app (server.ts) inside
// Cloudflare Containers, as an alternative to the Pages Functions path in
// /functions (see docs/cloudflare-deployment.md for the tradeoffs). This
// keeps server.ts completely unchanged — the container just runs it as a
// normal Node process, with Cloudflare routing requests to it.
import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  MANOHUB_CONTAINER: DurableObjectNamespace<ManohubContainer>;
  MANOHUB_ENVIRONMENT?: string;
  RELEASE_VERSION?: string;
  GEMINI_API_KEY?: string;
  APP_URL?: string;
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_WEBHOOK_SECRET?: string;
  EMAIL_DISPATCH_SECRET?: string;
}

const productionContainerId = (env: Env) => `production-${(env.RELEASE_VERSION || 'development').slice(0, 16)}`;

// A single routed instance is intentional: server.ts's AI rate limiter
// keeps its counters in in-process memory (express-rate-limit's default
// store), which only behaves correctly with one instance. Don't switch this
// to getRandom()/load balancing without moving the rate limiter to a shared
// store first (e.g. the same KV-based approach functions/api/_lib/shared.ts
// uses for the Pages Functions path).
export class ManohubContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = '30m';

  constructor(ctx: any, env: any) {
    super(ctx, env);
    // server.ts reads these from process.env at runtime (auth check +
    // the Gemini proxy) — forwarded here from the Worker's own bindings/
    // secrets, never hardcoded.
    this.envVars = {
      NODE_ENV: 'production',
      MANOHUB_ENVIRONMENT: env.MANOHUB_ENVIRONMENT ?? 'production',
      RELEASE_VERSION: env.RELEASE_VERSION ?? 'development',
      GEMINI_API_KEY: env.GEMINI_API_KEY ?? '',
      APP_URL: env.APP_URL ?? '',
      // These are public client configuration values (RLS remains the access
      // boundary). Keep explicit fallbacks because a newly-created Container
      // identity can start before Worker vars have propagated to its env.
      VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || 'https://rffjehmbrycztiekcyho.supabase.co',
      VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_HiizVcWA4JQxSoCxO3N6kQ_Ov4hGGmk',
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      RESEND_API_KEY: env.RESEND_API_KEY ?? '',
      RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL ?? '',
      RESEND_WEBHOOK_SECRET: env.RESEND_WEBHOOK_SECRET ?? '',
      EMAIL_DISPATCH_SECRET: env.EMAIL_DISPATCH_SECRET ?? '',
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // A release-scoped identity guarantees requests cannot reuse a dormant
    // Durable Object that still owns the previous container image.
    const container = getContainer(env.MANOHUB_CONTAINER, productionContainerId(env));
    return container.fetch(request);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.EMAIL_DISPATCH_SECRET) return;
    const container = getContainer(env.MANOHUB_CONTAINER, productionContainerId(env));
    ctx.waitUntil(container.fetch(new Request('http://container/api/audience-email/dispatch-due', {
      method: 'POST',
      headers: { 'x-manohub-dispatch-secret': env.EMAIL_DISPATCH_SECRET },
    })));
  },
};

// Deployment marker: roll out tenant authorization assurance.
