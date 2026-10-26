# Cloudflare deployment

The complete application uses Express through **Cloudflare Containers**:

- `worker/index.ts` routes to a release-scoped container and forwards server-only
  configuration without exposing it to the browser.
- `Dockerfile` builds the React/Vite frontend and Express backend with Node 22,
  and installs ClamAV plus signatures in the runtime image.
- `wrangler.containers.toml` selects production.
- `wrangler.staging.toml` selects a separate staging Worker and Supabase project.
- `.github/workflows/deploy-containers.yml` validates, deploys staging and gates
  production promotion. Manual dispatch defaults to validation; an explicit
  `staging_only` mode prevents production promotion.

Follow [the staging and rollout runbook](release-readiness.md) for required
settings, backup verification, migrations 96–97, live acceptance and recovery.
Production promotion requires `main`, successful staging and a commit-specific
migration acknowledgement. Do not merge or dispatch a production release until
the schema and rollback requirements in that runbook are satisfied.

## Configuration

The frontend needs public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at
build time. The Worker forwards those values separately to Express at runtime.
The workflow writes a public-only build `.env`; never put server credentials in
that file or a `VITE_` variable. In a managed cloud environment, preserve the
provided proxy and CA verification when validating Docker builds.

Protected uploads require the server-only `SUPABASE_SERVICE_ROLE_KEY`, ClamAV
and current signatures. Email additionally needs server-only Resend and worker
dispatch bindings. Gemini generation is optional and returns an explicit
unavailable response when it has no provider; manual drafting and deterministic
local document analysis remain available.

Container routing intentionally selects one release-scoped identity because
API limiters keep in-process counters. Do not introduce random load balancing
without providing shared rate-limit state. Live processes and credentials must
be recreated after a new environment or container starts.

## Compatibility path

`wrangler.toml`, `functions/api/*` and `npm run deploy:pages` retain the legacy
Pages + Functions path. The AI handlers use the same small parsing/local-helper
module and authentication contracts as Express, but this path does not provide
the full protected-upload, transactional-command or email backend. It is not the
supported full-product deployment. No active Pages deployment was inspected,
removed or migrated by this work.
