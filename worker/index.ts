// Entrypoint Worker for running the existing Express app (server.ts) inside
// Cloudflare Containers, as an alternative to the Pages Functions path in
// /functions (see docs/cloudflare-deployment.md for the tradeoffs). This
// keeps server.ts completely unchanged — the container just runs it as a
// normal Node process, with Cloudflare routing requests to it.
import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  SALONEREACH_CONTAINER: DurableObjectNamespace<SaloneReachContainer>;
  GEMINI_API_KEY?: string;
  APP_URL?: string;
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
}

// A single always-on instance is intentional: server.ts's AI rate limiter
// keeps its counters in in-process memory (express-rate-limit's default
// store), which only behaves correctly with one instance. Don't switch this
// to getRandom()/load balancing without moving the rate limiter to a shared
// store first (e.g. the same KV-based approach functions/api/_lib/shared.ts
// uses for the Pages Functions path).
export class SaloneReachContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = '30m';

  constructor(ctx: any, env: any) {
    super(ctx, env);
    // server.ts reads these from process.env at runtime (auth check +
    // the Gemini proxy) — forwarded here from the Worker's own bindings/
    // secrets, never hardcoded.
    this.envVars = {
      NODE_ENV: 'production',
      GEMINI_API_KEY: env.GEMINI_API_KEY ?? '',
      APP_URL: env.APP_URL ?? '',
      VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? '',
      VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? '',
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = getContainer(env.SALONEREACH_CONTAINER);
    return container.fetch(request);
  },
};
