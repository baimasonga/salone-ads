# Cloudflare Deployment

Two independent paths exist for previewing/testing this app on Cloudflare. They don't share
config — pick one, or keep both around for comparison.

## Why two paths

The app is a full-stack Node/Express server (`server.ts`), but almost none of its functionality
actually needs a server: every Supabase-backed feature (tenders, suppliers, teams, billing,
pipeline, everything in `src/lib/api.ts` and `src/lib/procurementApi.ts`) talks directly from the
browser to Supabase via `supabase-js`, with Row Level Security as the real access boundary. The
*only* things `server.ts` does that a static host can't are: serve the built SPA, `/api/health`,
and two auth-gated, rate-limited Gemini AI proxy routes (ad copywriter + procurement assist).

That gap between "what the app needs" and "what Express provides" is why two very different-sized
options both make sense:

| | Pages + Functions | Containers |
|---|---|---|
| What changes | 2 small edge functions replace the 2 Express AI routes | Nothing — `server.ts` runs as-is |
| Maturity | Cloudflare's most established product | Newer; some details below are unverified |
| Rate limiting | Reimplemented via Workers KV (`functions/api/_lib/shared.ts`) | Unchanged (in-process, same as local dev) |
| Cost/plan uncertainty | None known | Unconfirmed — see caveats |

## Path 1: Pages + Functions (recommended, already deployable)

- Frontend: `npm run build:pages` (`vite build` only — no server bundle) → static `dist/`.
- Backend: `functions/api/health.ts`, `functions/api/gemini/generate.ts`,
  `functions/api/gemini/procurement-assist.ts`. Auth check is a plain `fetch` to Supabase's
  `/auth/v1/user` (no `supabase-js` dependency in the Function). Gemini calls go straight to the
  REST API via `fetch` (no `@google/genai` SDK) — this sidesteps any question of whether that SDK
  works on the Workers runtime, by just not depending on it. Rate limiting is a KV-backed
  fixed-window counter shared across both AI routes, matching the original Express app's behavior
  (one `express-rate-limit` instance was reused for both routes there too).
- Deploy: `npm run deploy:pages` (`wrangler pages deploy dist --project-name=salonereach`).
- Needs before deploying: a Cloudflare API token (`Pages: Edit`, `Workers KV Storage: Edit`,
  `Account Settings: Read`), account ID, a KV namespace bound as `RATE_LIMIT_KV` in
  `wrangler.toml` (create with `wrangler kv namespace create RATE_LIMIT_KV`, then fill in the id),
  and Pages project environment variables/secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `GEMINI_API_KEY` (optional — falls back to mock responses without it, same as local dev).

**Verification status**: code typechecks (`tsc --noEmit`) and the static build succeeds. Not yet
actually deployed or click-tested live — that's still pending a Cloudflare API token.

## Path 2: Containers (prepared, not yet deployed or build-tested)

- `worker/index.ts`: a `Container` subclass (from `@cloudflare/containers`) wrapping `server.ts`
  unchanged, plus a Worker `fetch` handler that routes every request to it via `getContainer()`.
  **Deliberately a single always-on instance, not load-balanced across many** — `server.ts`'s AI
  rate limiter keeps counters in in-process memory, which only stays correct with exactly one
  instance. Don't switch to `getRandom()`/multi-instance without first moving that rate limiter to
  a shared store (the KV approach in Path 1 would work).
- `Dockerfile`: multi-stage build. Build stage runs the real `npm run build` (needs a real `.env`
  present in the build context — **not excluded from `.dockerignore` on purpose** — since Vite
  bakes `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` into the frontend bundle at this step, same as
  local dev). Runtime stage installs only production dependencies and runs `node dist/server.cjs`,
  matching `npm start` exactly.
- `wrangler.containers.toml`: separate from `wrangler.toml` (Pages config) — different deploy
  target (`wrangler deploy`, not `wrangler pages deploy`).
- Deploy: `npm run deploy:containers`.
- Needs before deploying: same Cloudflare API token plus `Workers Scripts: Edit` and container
  image push permission (exact scope name unconfirmed — Cloudflare's token UI should make this
  clear when creating one scoped to Workers), a real `.env` in the build context, and
  `wrangler secret put GEMINI_API_KEY --config wrangler.containers.toml` for the AI key.

### What's verified vs. not

**Verified directly against the published `@cloudflare/containers` package** (downloaded and
inspected its actual `.d.ts` files and README, not just docs pages, several of which returned
HTTP 403 to this session's fetch tools): the `Container` class API (`defaultPort`, `sleepAfter`,
`envVars`, the `constructor(ctx, env)` override pattern — including that the package's own README
uses loose `any` types for `ctx`/`env`, not full Workers ambient types, when customizing the
constructor), and the `getContainer(binding, name?)` helper (singleton by default, returns a stub
synchronously). `worker/index.ts` typechecks cleanly against real `@cloudflare/workers-types`
(`npm run lint:worker`).

**Not verified — this sandbox's fetches to `developers.cloudflare.com` and `unpkg.com` were
blocked (HTTP 403) for the whole session**, so the exact `[[containers]]` field set in
`wrangler.containers.toml` (particularly `instance_type: "basic"` and whether `image`/`max_instances`
are exactly right) comes from a secondary source (a community gist), not Cloudflare's own
reference. **The Docker build itself has not been run** — this sandbox has the `docker` CLI but no
usable daemon (`dockerd` fails to start: `ulimit: error setting limit (Operation not permitted)`,
a sandbox restriction, not a Dockerfile problem). Before relying on this path, run:

```
wrangler deploy --config wrangler.containers.toml --dry-run
docker build -t salonereach-test .   # needs a real .env in the build context first
```

and fix whatever wrangler's own error messages point at — that will resolve any field-naming gaps
faster than guessing further from here.

## Recommendation

Start with Path 1 (Pages + Functions) for actually clicking through and testing features — it's
the lower-risk, fully-typechecked, already-buildable option. Treat Path 2 (Containers) as prepared
groundwork: the code is real and typechecked, but budget time for a `--dry-run` pass and a local
Docker build to shake out the unverified config details before trusting it for a live preview.
