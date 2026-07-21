// Shared helpers for Cloudflare Pages Functions. Files under an "_"-prefixed
// path are excluded from Pages' file-based routing, so this is safe to import
// from the actual route handlers without becoming a route itself.

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  GEMINI_API_KEY?: string;
  RATE_LIMIT_KV: KVNamespaceLike;
}

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: { message } }, status);
}

// Mirrors server.ts's requireUser middleware, but via a plain fetch to
// Supabase's auth endpoint instead of the supabase-js client — avoids any
// Node-vs-Workers runtime compatibility question entirely.
export async function requireUserId(request: Request, env: Env): Promise<string | null> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

// Fixed-window counter in KV. Both AI routes share one budget per user,
// matching the original express-rate-limit middleware instance being reused
// across both Express routes.
export async function checkRateLimit(env: Env, userId: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
  const key = `ratelimit:${userId}:${bucket}`;
  const current = Number((await env.RATE_LIMIT_KV.get(key)) ?? '0');
  if (current >= RATE_LIMIT) return false;
  await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS * 2 });
  return true;
}

function hasRealGeminiKey(env: Env): boolean {
  return !!env.GEMINI_API_KEY && env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' && env.GEMINI_API_KEY.trim() !== '';
}

// Plain REST call to the Gemini API — deliberately not the @google/genai
// Node SDK, so this has no dependency on Node-specific runtime behavior.
export async function callGemini(
  env: Env,
  systemInstruction: string,
  contents: string,
  temperature: number
): Promise<string> {
  if (!hasRealGeminiKey(env)) {
    throw new Error('NO_KEY');
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: contents }] }],
        generationConfig: { temperature },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status}`);
  }
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  return text;
}

export const MAX_PROMPT_LENGTH = 2000;
export const MAX_FIELD_LENGTH = 300;
