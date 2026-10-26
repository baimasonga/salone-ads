# Reliability fixes and recommended feature scope

## Changes in this review

- Block backend bundles and source maps from the Express public file handler.
- Route protected uploads through Express. The server validates type/signature,
  obtains a destination authorization using the caller's existing storage RLS,
  scans the bytes, and uploads those same bytes. The server chooses an
  unpredictable object name and never returns its signed upload token.
- Add restrictive storage policies so ordinary clients cannot upload or
  overwrite files in protected buckets without a server-created authorization.
- Execute sensitive commands and cache their results inside one PostgreSQL
  transaction. Failed transactions roll back both. Existing incomplete command
  records require reconciliation rather than automatic replay.
- Ignore workspace results from superseded sessions and organization loads.
- Propagate audience-email database errors; recover recent uncertain sends with
  the same provider idempotency key and require reconciliation for old sends.
- Remove canned Content Studio, content-plan and lead-follow-up generators.
  Without a provider these endpoints return an explicit 503 instead of invented
  content. Retain local document analysis and user-text-only advert drafts.

## Deployment requirements

Apply migrations 96 and 97 from `migrations/manohub-new-project`, OR their
matching timestamped files in `supabase/migrations`, through the project's normal
migration workflow. These are two naming conventions for the same changes;
do not apply both copies to one database. They have not been applied to the
live Supabase project during this task.

Coordinate the database and Express deployment: the new upload policy requires
the new endpoint, and the new command handler requires the transactional RPC.
Protected uploads require `SUPABASE_SERVICE_ROLE_KEY` on the server, plus a
working ClamAV installation and signatures. That key must never use a `VITE_`
prefix. Existing bucket-specific RLS remains authoritative for destination
access; the new authorization is an additional restriction.

The alternative Cloudflare Pages Functions implementation does not implement
these Express upload/command endpoints. Use the existing Express/container
workflow for these features; do not assume the frontend-only deployment is
functionally equivalent.

Older `processing` or `failed` command records may have committed their business
effect under the previous implementation. Inspect the affected business record
and audit trail before resolving them; never automatically retry with a new key.
Older email rows left in `sending` without a trustworthy attempt timestamp, or
outside the safe retry window, also need reconciliation. A campaign's `sent`
status indicates that processing finished; use its sent/failed counters for
actual delivery outcomes.

## Regression checks

`npm test -- --maxWorkers=2` runs HTTP tests for protected public files and
uploads, email persistence failures, and actual React session-race tests, along
with the existing suite. Upload HTTP tests mock the storage provider and scanner;
they do not establish live Supabase Storage or ClamAV readiness.

Database behavior can be tested without touching a remote project:

```sh
npm install --prefix /tmp/hyderra-db-tests --cache /tmp/hyderra-npm @electric-sql/pglite
PGLITE_MODULE_PATH=/tmp/hyderra-db-tests/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/verify-review-migrations.mjs
```

The script uses an isolated in-memory PostgreSQL engine, real transactions and
RLS, and representative auth/storage fixtures. It checks rollback, cached
retries, payload conflicts, MFA, JSON/null parameter casts, storage authorization,
expiry, overwrite prevention, and cross-user isolation. It does not run the full
production schema or the Supabase Storage HTTP service.

## Feature cleanup completed

Tourism management, bespoke events management, and the influencer marketplace
have been removed from the application code, as requested. Their screens, API
modules, shared creator forms, types, navigation entries and obsolete workspace
branches are gone. Business-directory management remains available through its
own lazily loaded component and API. Old duplicate directory screens and their
unused login-time catalog hydration have also been removed.

Public discovery now requests only the six retained result types. It excludes
retired results and suggestions returned by older database deployments, cleans
legacy type filters when reading saved searches, and uses a new cache scope so
old influencer results cannot reappear from an offline cache. Saved-search rows
are not rewritten or deleted.

This cleanup does not change any database migration, table, record or stored
file. Historical schemas and data for managed events, tourism experiences and
influencer profiles remain intact. Database-only preservation tests remain in
the suite. Ordinary event/tourism advert categories and business classifications
remain valid, without the removed specialized management workflows.

## AI and support cleanup completed

Removed the generic campaign/caption/idea, follow-up and content-plan fallback
strings from both Express and Pages Functions. The endpoints return HTTP 503
with `AI_UNAVAILABLE` when a provider is not configured. Users can keep writing
and saving manually. Shared parsing, user-text-only advert drafts and local
procurement assistance now live in one small runtime-independent module instead
of duplicated mock modules. A missing sector match returns General rather than
incorrectly assigning the first sector. Content-plan date ranges are validated
in both runtimes before requesting provider work.

Administrators now have one Customer Support Centre navigation entry. Its
Cases & service requests view opens the existing case inbox by default; the
Operational requests view preserves verification, billing and administrative
shortcuts. These remain distinct workflows and datasets. Support staff keep
their restricted direct case view and do not receive the administrative hub.

## Dead workspace cleanup completed

Removed both disabled campaign-management implementations (the legacy wizard
and the advert-publisher duplicate), their unused form and reach data,
health-check/content-plan
state and effects, and the superseded billing screen and handlers. Removed
service-request branches that were already handled or denied by the route
resolver, along with the unused platform-overview implementation. The active
campaign builder, subscription/payment page, service-request modules and
administrator Control Centre remain in place.

The old billing hooks ran before the resolver returned the current billing
page, causing duplicated plan/subscription requests. A runtime regression test
now mounts the full workspace and verifies one request each. Other runtime
checks verify the campaign-tab alias and support-staff access/ordinary-user
denial through the full workspace. No additional feature or database data was
removed in this pass.

## Remaining recommendation

Use Express/container as the supported full-product deployment. The alternate
Pages AI handlers remain compatible, but the Pages deployment still lacks the
full upload/command backend. Retiring the alternate deployment configuration
requires checking any active deployments; none were inspected or changed here.

Keep opportunity search/detail, buyer submissions, business adverts, subscriber
access, billing, audit logs, security, and essential administration. A further
split of `Workspaces.tsx` by feature would reduce coupling and route-specific
code. Directory data now loads only when its screen opens.

## Release preparation

See [the staging and rollout runbook](release-readiness.md). The release workflow
now has a staging-only mode, requires successful staging before production,
restricts production to main, and requires commit-specific migration verification
and server-only upload credentials. Staging smoke checks require exact release
identity and protected HTTP boundaries. Container identities retain the build
suffix and environment so the final secret-configured release starts separately;
staging refuses to fall back to the production project.

Database regression validation also covers void-returning commands and cached
null results. The Node 22 container build stage and local smoke/performance
checks passed. Final antivirus-image and live staging acceptance remain pending.
No live migrations, project provisioning or deployment have been performed.
