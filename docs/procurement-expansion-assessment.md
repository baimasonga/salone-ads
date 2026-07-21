# Procurement & Supplier-Intelligence Expansion — Existing System Assessment & Gap Analysis

Source brief: two attached specs describing a DGMarket/TenderSoko/BidDetail-style procurement opportunity and
supplier-intelligence platform for Sierra Leone (with a West Africa expansion path), to be built as an
**expansion of the existing SaloneReach platform**, not a rewrite. Both source documents explicitly require
inspection + gap analysis + open questions before implementation begins — this document is that step.

---

## 1. Existing System Assessment

### Technology stack
- **Frontend**: React 19 + TypeScript (strict), Vite 6, Tailwind CSS v4, Lucide icons, Framer Motion (`motion`).
- **Server**: Single Express 4 process — Vite middleware in dev, static file serving + SPA catch-all in prod.
  esbuild bundles `server.ts` to `dist/server.cjs`. No Docker.
- **Database & Auth**: Supabase (Postgres 17, project `SaloneReach`, `eu-west-1`) — email/password auth (Google
  OAuth button wired but provider not configured in Supabase), Row Level Security for tenant isolation.
- **AI**: `@google/genai` (Gemini) via a server-side proxy (`/api/gemini/generate`) that requires an authenticated
  Supabase session and is rate-limited per user.
- **CI**: GitHub Actions — typecheck + build only. **No test suite exists.**

### Current functionality
Public landing page → email/password sign up (Supabase Auth, real) → onboarding form creates **exactly one
organization per user** (via a `create_organization` RPC, user becomes `owner`) → dashboard with 17 sidebar tabs:

| Tab | Status |
|---|---|
| Overview | Static metrics + real lead/campaign counts |
| Campaigns | Real CRUD (create + list; no edit/delete yet), Supabase-backed |
| Content Studio | Real AI-assisted copy generation + saved drafts, Supabase-backed |
| Calendar, Media Library, Audiences, Analytics, Event Promotion, Tourism | **Static/simulated UI only** — no backing data model |
| Social Accounts | Real toggle, Supabase-backed |
| CRM Leads | Real status pipeline updates, Supabase-backed |
| Influencer Market | Real, but **read-only global marketplace** table |
| Business Directory | Real, global claimable listings — **claim = instant self-verify, no review step** |
| Brand Kit | Real, editable, Supabase-backed |
| Team Roles, Billing Invoices, Super Admin Safety Board | **Local component state only — not persisted, not real** |

### Current data model (Postgres, all RLS-protected)
`profiles`, `organizations`, `organization_members` (role: owner/admin/member), `brand_kits` (1:1 org),
`campaigns`, `content_items`, `leads`, `social_connections` — all scoped via an `is_org_member(org_id)` helper
used in every policy. `directory_profiles` and `influencer_profiles` are **global, non-org-scoped** marketplace
tables.

### Authentication & roles
Supabase Auth handles identity. The only "roles" that exist are **org-membership roles** (owner/admin/member) —
there is no platform-level role concept (administrator, researcher, buyer, supplier) distinct from org
membership, and no subscription/entitlement system at all.

### UI architecture
No client-side router — a single 1,500+ line `Workspaces.tsx` switches on an `activeTab` string. No URL-based
filter/deep-link state anywhere. Design system is a deliberate sharp/geometric "Emerald Sky" Tailwind theme with
global CSS overrides (zero border-radius, JetBrains Mono labels).

### Deployment
Single Node process serves both API and built SPA — no Docker, no separate services, designed for a
single-container host (Cloud Run–style).

### Technical risks relative to the procurement-platform vision
- No test suite.
- No client-side routing or shareable URL search state — the spec requires this for SEO and saved searches.
- No file storage (Media Library is 100% simulated — no Supabase Storage buckets exist).
- No subscription/billing/payment infrastructure of any kind.
- No notification engine (email/SMS/WhatsApp) beyond the AI-copy feature.
- No audit logging.
- "Verification" as currently implemented (Business Directory claim) is a single self-service boolean flip with
  no reviewer step — the opposite of what supplier/buyer verification requires.
- One organization per user today; the spec implies an org may need to act as both a **buyer** (publishing
  tenders) and a **supplier** (bidding) — the current schema doesn't distinguish org capabilities.

---

## 2. Gap Analysis

### Reusable as-is
- Supabase Auth + `organizations`/`organization_members`/`is_org_member()` RLS pattern — this is exactly the
  multi-tenancy foundation the spec's `organizations`, `organization_members`, `buyer_profiles`,
  `supplier_profiles` entities need.
- The authenticated, rate-limited AI proxy pattern — reusable for tender summarization/extraction, just needs
  new prompt logic and a review-queue table, not new plumbing.
- Express/Vite hybrid server and Tailwind design system/shell (sidebar, header, dashboard chrome).
- The `directory_profiles` "claimable listing" *concept* — but the claim mechanism itself must be rebuilt (see
  below), not reused verbatim.

### Needs modification
- **Directory claim flow**: today, claiming instantly sets `is_verified = true`. The spec requires a real
  `verification_requests` → reviewer-approval workflow with expiry and status history. This is a security-shaped
  change, not a cosmetic one.
- **Organization model**: needs an explicit capability/type distinction (can act as Buyer, Supplier, or both) —
  currently just a free-text `type` field with no permission meaning.
- **Navigation/IA**: the current 17-tab flat sidebar is entirely ad-platform-shaped; tender search, publishing,
  supplier directory, alerts, and subscriptions need their own information architecture — see open question #1
  below before I design this.

### Missing entirely (net-new)
- Opportunities/tenders domain model (the ~30-field entity, 16 opportunity types, 12+ statuses from the spec).
- Public tender search & discovery with URL-state filters and indexable SEO pages (no router exists today).
- Buyer publishing workflow (draft → review → publish → amend → award → cancel).
- Admin/researcher ingestion tooling (manual entry, document-assisted extraction, duplicate detection).
- Real supplier/buyer verification workflow (review queue, not self-claim).
- Alerts/notification engine (saved searches/follows → email, later WhatsApp/SMS) — nothing like this exists.
- Subscriptions & billing (plans, prices, feature entitlements, payments, invoices, refunds) — zero billing
  infrastructure exists today.
- Document storage (Supabase Storage: private buckets, signed URLs, public vs. restricted access).
- A real admin dashboard (operational queues: review, duplicates, payment problems) — today's Admin tab is a
  static, unpersisted stub.
- Audit logging.
- Reporting/intelligence module.

### Data migration
None required — there's no production data yet. This should be built as **new, additive tables** alongside the
existing ad-platform tables (not a repurposing of `campaigns`/`content_items`), since those remain in active use
for the existing marketing features per the "preserve existing functionality" rule in both source documents.

---

## 3. Decisions confirmed (2026-07-21)

| Question | Decision |
|---|---|
| Relationship to existing ad-campaign product | **Additive** — same app/account, new nav sections alongside the existing 17 tabs. Not a pivot, not a separate product. |
| Starting phase | **Phase 1: Foundations only** — no visible tender UI yet. |
| Billing | **Manual only** — plans/entitlements are real and enforced; payment collection is bank-transfer + admin approval. No payment gateway wired yet. |
| Notifications | **Email + in-app only** for now, built on an adapter-friendly schema so WhatsApp/SMS can be added later without a redesign. |

## 4. Phase 1: Foundations — implemented

All additive, backend-only, non-breaking (`tsc --noEmit` and `npm run build` both verified clean after applying).
No opportunities/tender UI yet — that's Phase 2, pending a separate go-ahead.

**Platform-level roles** (distinct from org-membership roles): `profiles.platform_role` (`user` / `researcher` /
`admin`), guarded by an `is_platform_admin()` helper and a trigger that blocks self-escalation — a user can never
promote themselves via the existing "update own profile" path; only an existing admin can change another user's
role. **No account has been promoted to admin yet** — nobody currently has platform-admin access. Tell me which
account should be first and I'll do it via SQL, since I won't invent that decision for you.

**Configurable taxonomies** (admin-writable, publicly readable when active): `currencies`, `countries`,
`districts` (all 16 Sierra Leone districts seeded), `sectors` (12 starter sectors), `categories`,
`funding_agencies`, `opportunity_types` (16 types per the spec), `procurement_methods`, `opportunity_statuses`
(13 statuses per the spec). Nothing is hard-coded in application logic — all of it is admin-manageable data.

**Organization capabilities**: `organizations.is_buyer` / `is_supplier` boolean flags (not mutually exclusive —
one org can be both). Existing organizations default to neither, so current ad-platform orgs are unaffected.

**Audit logging**: `audit_logs` table + a `log_audit_event()` RPC (the only write path — `actor_id` is always
`auth.uid()`, never client-supplied). Org members can see their own org's log; admins see everything. Not yet
wired to any actions — Phase 2+ features will call it as they're built.

**Subscriptions/billing (manual)**: `plans` (Free/Professional/Business/Enterprise seeded, prices left
unset for you to configure), `plan_features`, `subscriptions`. An org can self-request a plan change, but a
trigger forces `status = 'pending'` and clears approval fields unless the actor is a platform admin — a paid
subscription can never go `active` from a client-side action alone, only admin approval.

**Notifications (email + in-app adapter shape)**: `notification_preferences` (per user/org/category/channel,
with immediate/daily/weekly/disabled frequency) and `notifications` (row-level read state). Row creation is
server-side only — no dispatch logic exists yet, that arrives with Phase 4 alerting.

**Document storage**: two Supabase Storage buckets — `public-assets` (public read) and `private-documents`
(no public access). Both use an `{org_id}/...` path convention enforced by RLS via `is_org_member()`, so an org
can only read/write its own folder in either bucket.

## 5. Phase 2: Tender Discovery — implemented (2026-07-21)

Admin: `baimasonga@gmail.com` had no account yet as of this pass, so platform-admin promotion is still pending —
sign up with that email and let me know, and I'll flip `platform_role` immediately.

**Database**: `opportunities` (the full entity from the spec), `opportunity_categories` (multi-tagging),
`opportunity_documents`, `saved_opportunities`, `buyer_profiles`. RLS verified end-to-end with real
insert/select probes: a non-buyer org is rejected from inserting an opportunity; once `is_buyer = true`, it can
create one (defaults to `draft`); an unrelated user cannot see the draft; once the buyer transitions it to
`published`, the same unrelated user can see it. Draft-vs-published visibility, not just table access, is what's
enforced.

**Routing**: added `react-router-dom` (justified: the app had no client-side router at all, and public,
shareable, SEO-indexable tender URLs are a hard requirement — this is a pure addition, nothing existing was
replaced). The existing landing/auth/dashboard flow is unchanged, now mounted at a catch-all route; two new
public routes were added: `/tenders` and `/tenders/:slug`.

**Public pages** (`src/components/TenderSearchPage.tsx`, `TenderDetailPage.tsx`): keyword + sector + district +
notice-type search with URL query-param state (shareable/bookmarkable searches), a detail page with full
opportunity info, documents list, and a save/bookmark toggle for signed-in users. Linked from the landing page
nav ("Tenders").

**Buyer publishing** (new "Tenders" dashboard tab, `Procurement` nav group): an org must explicitly "Enable
Buyer Mode" (self-service, sets `organizations.is_buyer = true`) before it can publish. Once enabled, a buyer
creates and **self-publishes** tenders directly (no admin review gate yet — that's explicitly a Phase 3 item per
the spec's own phasing, so this is a deliberate simplification, not an oversight) and can close its own listings.

**Known simplifications, to revisit in later phases**:
- No admin review queue yet (Phase 3) — buyers self-publish directly.
- No document upload UI yet — the `opportunity_documents` table and the `private-documents`/`public-assets`
  storage buckets exist, but nothing writes to them yet.
- `buyer_profiles` table exists but has no editor UI yet — the detail page shows the buyer's org name only.
- Keyword search matches tender title only (`ilike`), not full-text across description/buyer — fine for the
  current data volume, will need a proper search index once volume grows.
- Search results are capped at 50, no pagination yet.

**Verification**: `tsc --noEmit` and `npm run build` both clean. Live browser click-through is still blocked in
this sandbox by the same `*.supabase.co` egress policy noted in the Phase 0 pass — verified correctness instead
via direct RLS probes against the real schema (see above) and by cross-checking every column name the frontend
queries against `information_schema.columns` for the actual tables.

## 6. Phase 3: Publishing and Administration — implemented (2026-07-21)

Admin: `baimasonga@gmail.com` still has no account as of this pass. Sign up with that email and let me know —
I'll promote it. (Side note for future reference: `profiles.platform_role` is guarded by a trigger that blocks
self-escalation, which turned out to also block a plain `UPDATE` run outside of a real user session — even
project-owner SQL access has no `auth.uid()` context. Promoting the first admin requires briefly disabling that
one trigger, updating the row, and re-enabling it — not a bug, just the bootstrap cost of the safeguard working
as designed.)

**The core gap from Phase 2 is closed**: buyer submissions no longer publish directly. A `protect_opportunity_transition`
trigger enforces the status state machine at the database layer — verified with real probes: a buyer inserting
with `status = published` is silently forced to `awaiting_review`; a buyer attempting to update their own
`awaiting_review` tender to `published` is reverted; an admin performing the same update succeeds. This is
enforced independently of any UI — it cannot be bypassed by calling the API directly.

**Buyer self-service transitions** (no review needed, since the buyer already owns an approved notice):
extend deadline, amend content, close, cancel, record a contract award. Each of these is a specific allowed edge
in the trigger's state machine; anything else a non-admin attempts is silently reverted rather than erroring.

**Admin Tender Review** (new "Platform Admin" nav section, visible only when `profiles.platform_role = 'admin'`):
a queue of `awaiting_review`/`needs_correction` tenders, a lightweight duplicate warning (title-similarity check
against other opportunities), and Approve / Request Correction / Reject actions. Rejection and correction
requests carry a note the buyer sees on their own Tenders tab, with a "Resubmit for Review" action once fixed.

**Public detail page** now shows contract award info and amendment history when present.

**Known simplifications, to revisit later**: no dedicated "edit tender content" form yet (the `amendOpportunity`
API function exists but isn't wired to a UI — buyers can extend deadlines and record awards, but not yet edit
title/description through a form); duplicate detection is a simple title-keyword match, not fuzzy/semantic;
no researcher role UI yet (researchers can be assigned `platform_role = 'researcher'` in the data model, but
there's no admin-entry-from-external-source form for them to use — buyer-submitted tenders are the only
ingestion path so far).

**Verification**: `tsc --noEmit` and `npm run build` clean. Full lifecycle verified via direct SQL probes against
the real schema: draft → awaiting_review → published (admin-only) → deadline_extended → awarded, with amendment
logging and award upsert behaving exactly as the client code expects. Live browser testing remains blocked by
this sandbox's `*.supabase.co` egress policy.

## 7. Phase 4: Suppliers and Alerts — implemented (2026-07-21)

Admin: `baimasonga@gmail.com` still hasn't signed up. Same offer stands — sign up and tell me, I'll promote it.

**Supplier profiles & verification**: new "Supplier Profile" dashboard tab — enable supplier mode, fill in
company details (registration number, tax ID, certifications, geographic coverage, etc.), and apply for
verification. New Admin "Verification Requests" tab reviews and approves/rejects supplier or buyer verification
applications. Verified suppliers get a `supplier_verified_until` timestamp (1 year); buyers get a
`buyer_verified` flag — neither is set just by registering, matching the spec's explicit rule.

**A real bug found and fixed during verification**: the first version of `approveVerification` tried to update
`organizations.supplier_verified_until` directly from the client. That table's RLS only allows the org's own
owner/admin members to update it — platform admins aren't members of every org, so the write silently affected
zero rows. Caught by testing the actual approval path end-to-end rather than trusting the code read-through.
Fixed with a scoped `admin_set_organization_verification()` RPC (admin-gated, touches only the verification
columns) rather than broadening the general update policy, which would have let admins edit arbitrary org
fields from the client. Verified the fix with the same probe that caught the bug.

**Alerts — the real notification pipeline**: a database trigger (`notify_matching_users_on_publish`) fires
whenever an opportunity newly becomes `published`/`amended`, and creates in-app notification rows for (a) users
whose saved search matches its sector/district/type, and (b) users following the buyer. Verified end-to-end: a
user with a saved "Health sector" search and a different user following the buyer org both received exactly the
right notification when a matching tender was approved; a third user saw only their own notifications, never
the others'. A `generate_deadline_reminders()` function (admin-callable, verified to reject non-admins) creates
reminders for saved opportunities nearing their deadline — this needs a real scheduler to run automatically,
which isn't set up yet (see below).

**New UI**: "Save this search & get alerts" on the public tender search page (saved searches shown as
removable chips, click to re-apply); "Follow Buyer" toggle on the tender detail page; a notification bell in
the dashboard header (unread badge, dropdown, polls every 60s, click marks read and opens the linked tender).

**Known simplifications / explicit non-goals**:
- **No outbound email is actually sent.** There's no email provider configured (no Resend/Postmark/SES
  credentials), so "email" as a channel exists in the schema (`notifications.channel`) but nothing dispatches to
  it — only in-app notifications are live. Sending real email requires you to choose and provide credentials for
  a provider; I won't fabricate that.
- **No cron scheduler wired up yet** for `generate_deadline_reminders()` — it works and is tested, but currently
  needs to be called manually (e.g., by an admin, or via `pg_cron`/a scheduled Edge Function once you want it
  automatic). Flagging as infrastructure to decide on rather than adding silently.
- Followed sectors (`followed_sectors` table) exists in the schema but has no UI yet — only followed buyers and
  saved searches are wired up.
- Saved-search matching is exact-match on sector/district/type only, not keyword — a saved search with a
  keyword won't yet trigger alerts on keyword matches, only on the structured filters.

**Verification**: `tsc --noEmit` and `npm run build` clean. Full alert pipeline (saved search match + buyer
follow + RLS cross-user isolation) and the supplier verification approval path (including the bug fix above)
verified against the real schema with real probes, then cleaned up.

## 8. Phase 5: Commercial Features — implemented (2026-07-21)

Admin: `baimasonga@gmail.com` still hasn't signed up. Same offer stands.

**Two long-standing fake stubs are now real.** Team Roles previously had a hard-coded fake member
("Alhassan Kamara") and stored invites only in local component state (lost on refresh). Billing Invoices had a
fake invoice row and a "record payment" button that did nothing. Both now run on real tables from earlier
phases (`organization_members`, `subscriptions`, `plans`).

**Feature entitlements — actually enforced, not decorative**: `plan_features` now has real limits
(`max_team_members`: Free=1, Professional=3, Business=10, Enterprise=unlimited). A `get_org_feature_limit()`
function checks the org's active subscription, falling back to Free if none. `invite_team_member()` enforces
this server-side — verified with a real probe: invite #2 on the Free plan was rejected, then succeeded
immediately after the org's subscription was activated on Professional. This is the first entitlement actually
wired to a real limit; others (document access, WhatsApp alerts) remain aspirational until those features exist.

**Team accounts**: invite works only for emails with an existing SaloneReach account (via a `find_user_id_by_email`
lookup) — inviting a non-existent email fails with a clear message rather than pretending to send an email
nobody configured. Owners can remove members (not themselves, not via admins to avoid a demotion vector).

**Subscriptions/billing**: org requests a plan + submits a payment reference; a new Admin "Subscription Requests"
tab lets admins activate (sets real period dates) or decline. The Phase 1 `protect_subscription_fields` trigger
still guarantees a non-admin can never self-activate — reconfirmed while testing this phase.

**Featured tender placement**: `is_featured` (added in Phase 2, unused until now) gets a real toggle via
"Approve & Feature" in the admin tender review queue.

**Service requests**: buyers/suppliers submit requests (document retrieval, bid-readiness review, etc.) from a
new "Bid Support Services" tab; a new Admin "Service Requests" tab lets staff message the customer, add
**internal-only** notes, quote, and update status. The internal/customer note split is enforced by RLS on a
separate `service_request_activities` table (not a column-level check, since Postgres can't do per-row
column-level security the way RLS does) — verified with a real probe: an org member saw only the
customer-visible note, never the internal one added by an admin on the same request.

**Two real bugs found and fixed while verifying this phase:**
1. `fetchTeamMembers` tried to embed `profiles(full_name, email)` directly off `organization_members` in one
   PostgREST query. `organization_members.user_id` and `profiles.id` are sibling foreign keys to `auth.users` —
   there's no direct FK between the two tables, so PostgREST can't auto-join them. Fixed with two round trips
   (fetch members, then fetch matching profiles, merge client-side) rather than a broken single query.
2. That fix also surfaced a real RLS gap: **no policy let an org member view a teammate's profile at all** —
   only their own. Added a policy scoped to "shares an organization with me." Without it, the team roster would
   have silently rendered blank names for everyone but yourself.
   Both were caught by testing the actual code path end-to-end against the real schema, not by reading it.

**Verification**: `tsc --noEmit` and `npm run build` clean. Entitlement enforcement, the subscription
activation → invite unlock sequence, the fixed team-roster query, and the internal/customer note RLS split were
all verified against the real schema with real probes, then cleaned up.

## 9. Phase 6: Intelligence — implemented (2026-07-21)

Admin: `baimasonga@gmail.com` still hasn't signed up. Same offer stands.

**Supplier opportunity pipeline — the strictest privacy rule in the whole spec, and the only table with no
admin bypass.** `pipeline_records`/`pipeline_tasks` track a supplier's private bid strategy (stage, bid value,
probability, notes) per tender. Every other table in this schema gives platform admins a support-access
carve-out; these two deliberately don't, because the spec is explicit that pipeline data "must never be visible
to buyers, other suppliers, or public users." Verified directly: a platform admin querying another org's
pipeline record by its exact ID gets zero rows back, not a permission error — the row simply isn't there as far
as their session is concerned.

**Sector-based matching — real, not AI-flavored guessing.** The `supplier_sectors` table has existed since
Phase 4 with no UI ever wired to it. Suppliers now tag sectors on their profile, and a "Recommended For You"
list on the Pipeline tab is a plain structured query (opportunities whose sector matches the supplier's tagged
sectors) — not a Gemini call. Deliberately: this is a case where AI would add cost and unreliability to
something a database query already does correctly and cheaply. Verified end-to-end with real data: a supplier
tagged "Mining & Extractives," a matching tender appeared in their recommendations, and adding it to their
pipeline worked through the same upsert path the UI uses.

**Admin analytics dashboard**: opportunities by status/sector/district, most-viewed and most-saved tenders,
most-followed buyers, active subscriptions by plan, and contract awards by sector — all from a single
`get_admin_analytics_summary()` RPC, admin-gated (verified: rejected for a non-admin caller). View counts are
now real — `opportunities.view_count` existed since Phase 2 but nothing incremented it until now; every detail
page load calls a public, RLS-respecting `increment_opportunity_view()` (verified it only affects publicly
visible tenders, never drafts).

**Two disclosed AI features**, both on a new `/api/gemini/procurement-assist` endpoint (separate system
instruction and separate route from the ad-copywriting endpoint, same auth+rate-limit pattern, same mock
fallback when no `GEMINI_API_KEY` is configured):
- "Suggest sector" during tender creation — buyer types a title, AI matches it to one of the configured
  sectors.
- "Explain this tender in simple language" on the public detail page — plainly labeled AI-generated, with a
  visible disclaimer that it may contain errors, per the spec's AI rules.

**Data export**: CSV export of a supplier's pipeline, gated behind a new `data_export` plan feature (Free/
Professional: off, Business/Enterprise: on) using the same entitlement pattern from Phase 5.

**Explicitly deferred, not attempted**: real API-key/external-access management for the Enterprise "API access"
feature. Issuing and validating API keys, rate-limiting external callers, and scoping what an API key can touch
is a distinct security surface — building it in the time remaining in this pass would mean rushing exactly the
kind of access-control code that has needed the most scrutiny in every phase so far (see the Phase 4 and Phase
5 bugs below). It deserves its own pass. Also deferred: historical trend/competitor analysis (not enough data
volume yet to be meaningful, and the spec explicitly warns against presenting predictions as fact) and document
AI extraction (no document upload pipeline exists to feed it).

**Verification**: `tsc --noEmit` and `npm run build` clean. Pipeline privacy (including the no-admin-bypass
design), sector matching end-to-end, the view counter's visibility guard, and the analytics RPC's admin gate
were all verified against the real schema with real probes, then cleaned up. No bugs found this phase —
likely because the sibling-FK lesson from Phase 5 was applied proactively (`fetchPipeline`'s embed uses
`opportunities(...)`, a genuine direct FK, not another `organization_members`-style sibling-FK mistake).

## 10. Phase 7: Regional Expansion — implemented (partial, 2026-07-21)

Admin: `baimasonga@gmail.com` still hasn't signed up. Same offer stands.

**Decisions confirmed for this pass**: add **Liberia** as the second country (Sierra Leone remains the only
other one seeded); French-language support scoped to **public tender pages only** (search + detail), not the
authenticated dashboard; full West-Africa-wide source ingestion and additional countries (Guinea, Ghana,
Nigeria) explicitly left for a future pass.

**What this closed, that wasn't actually built before**: the `opportunities` table has had `country_id` and
`currency_code` columns since Phase 1/2, but nothing ever wrote to them — every tender published so far has a
`null` country and `null` currency, and the buyer publishing form never collected a currency or estimated value
at all. That's fixed now, not just extended for Liberia: buyers pick a country (cascading the district/county
list), enter an estimated value, and pick a currency when publishing.

**Database**: seeded `countries` (Liberia, code `LR`), `currencies` (Liberian Dollar, `LRD`), and `districts`
(Liberia's 15 counties, scoped to Liberia's `country_id` — confirmed with a real count query: 16 Sierra Leone
districts, 15 Liberia counties, no cross-contamination). Purely additive data via `on conflict do nothing`
seeding, no schema or RLS changes — the existing `Public can view active countries/districts/currencies`
policies already cover the new rows.

**API** (`procurementApi.ts`): `fetchCountries()` and `fetchCurrencies()` are new. `fetchDistricts()` now takes
an optional `countryId` to scope the list (previously returned every district regardless of country, which
would have silently mixed Sierra Leone and Liberia locations together in one flat dropdown). `searchOpportunities`
gained a `countryId` filter. `CreateOpportunityInput`/`createOpportunity` now actually set `country_id`,
`estimated_value`, and `currency_code` on insert — previously silently omitted.

**Buyer publishing form** (Workspaces.tsx Tenders tab): added Country (cascades District/County options),
Estimated Value, and Currency fields, defaulting to the first configured country.

**Public tender pages**: `TenderSearchPage` gained a Country filter (cascades the district dropdown, mirrors
the buyer form) and now shows estimated value (currency-symbol formatted) and country in results. `TenderDetailPage`
shows estimated value the same way, and the contract-award currency display now resolves a real symbol via
`fetchCurrencies()` instead of printing the raw currency code.

**French-language support** (`src/lib/i18n.ts`): a small hand-rolled dictionary + `useLanguage()` hook
(localStorage-persisted, no new dependency — consistent with how `react-router-dom` was the only prior
justified addition) wired into `TenderSearchPage` and `TenderDetailPage` via an EN/FR toggle in each page's
header. Covers all static UI strings on both pages (labels, buttons, empty/loading states, AI-explanation
disclaimer). **Does not** translate database content — sector names, district/county names, opportunity types,
and buyer-entered titles/descriptions stay in whatever language they were entered in, since translating
taxonomy and free-text tender content would require either translated columns or a live translation call per
tender, neither of which was in scope for this pass. The dashboard (Workspaces.tsx) remains English-only, per
the confirmed decision.

**Known simplifications / explicitly deferred**:
- Only Liberia added, not Guinea/Ghana/Nigeria — French support exists as infrastructure but Liberia itself is
  English-speaking, so there's no French-speaking country's tenders to actually exercise it against yet.
- `organizations.country` (used by the ad-platform onboarding flow for diaspora ad targeting) is untouched —
  buyers pick a tender's country explicitly on the publish form rather than inheriting it from org profile,
  keeping this change additive and isolated from the unrelated ad-platform code path.
- Saved searches (`saved_searches` table) don't have a `country_id` column, so "save this search & get alerts"
  doesn't capture the new country filter — adding that would mean touching the Phase 4 alert-matching trigger
  too, which felt like scope creep for a data-seeding-plus-UI pass.
- Region-specific *source ingestion* (the other half of the Phase 7 spec item) still has no tooling behind it —
  this was already true before this pass (no admin/researcher ingestion UI exists at all, per Phase 3's notes)
  and adding it per-country doesn't change that gap.
- No currency conversion/exchange-rate logic — each tender's value displays in whatever currency it was
  entered in, with no cross-currency comparison.

**Verification**: `tsc --noEmit` and `npm run build` both clean. Liberia seed data verified with a real count
query against the schema (16 SL districts / 15 Liberia counties, correctly scoped by `country_id`). No RLS or
trigger changes were made this phase, so no new security-boundary probes were needed — verification for this
pass was correctness of the new data and the read/write paths that consume it.

## 11. Document upload/extraction (upload half) — implemented (2026-07-21)

Closes one of the deferred items from Phase 2/3: the `opportunity_documents` table and the `public-assets`/
`private-documents` storage buckets have existed since Phase 1, with RLS already scoped correctly
(`{org_id}/...` path convention, buyer-org-member-or-admin write access, public read gated on both `is_public`
and the opportunity's own visibility) — but nothing ever wrote to them. This pass wires up the write and read
paths against that existing, unchanged RLS; no new policies or triggers were added.

**API** (`procurementApi.ts`): `uploadOpportunityDocument()` uploads to whichever bucket matches the document's
`is_public` flag (public docs → `public-assets`, restricted docs → `private-documents`), then inserts the
`opportunity_documents` row, rolling back the storage object if the insert fails. `deleteOpportunityDocument()`
removes storage first, then the DB row (so a partial failure never leaves a DB row pointing at a deleted file).
`getOpportunityDocumentUrl()` returns a plain public URL for public documents or a 5-minute signed URL for
restricted ones — signed-URL creation itself is RLS-gated, so a non-member can't mint one even if they had a
document's ID. Client-side 10MB cap on uploads, matching the PRD's low-bandwidth guidance.

**Buyer UI** (Workspaces.tsx Tenders tab): each of a buyer's own tenders now has a "Documents" toggle that
loads/uploads/deletes files for that tender, with a Public/Private checkbox per upload.

**Public UI** (TenderDetailPage.tsx): the existing (previously inert) documents list is now clickable — resolves
a real (public or signed) URL on click and opens it.

**Known simplifications / deferred**: this is the *upload* half of "document upload/extraction" only — no AI
document-content extraction (e.g. auto-filling tender fields from an uploaded notice) was attempted, consistent
with Phase 6's note that this needs an upload pipeline to exist first, which it now does, but extraction itself
is separate scope. No file-type restriction beyond the size cap (no virus/malware scanning — mirrors the trust
boundary of every other user-supplied text field in this schema, not a new gap). No thumbnail/preview generation.

**Verification**: `tsc --noEmit` and `npm run build` both clean. No new RLS or triggers were introduced, so the
existing Phase 1 storage/table policies (re-read and confirmed unchanged: bucket path-convention enforcement,
`is_public`-plus-opportunity-visibility gating on `opportunity_documents` SELECT) are what's actually being
exercised for the first time here. A live authenticated end-to-end probe (upload as a real buyer, confirm a
non-member is rejected, confirm a public visitor only ever sees `is_public = true` rows) wasn't possible this
pass — `auth.users` currently has zero rows, i.e. nobody has signed up yet, so there's no real session to test
with, on top of the sandbox's existing `*.supabase.co` egress block. This should be exercised for real as soon
as an account exists.

## 12. Automated deadline reminders — implemented (2026-07-21)

Closes the other Phase 4 deferred item: `generate_deadline_reminders()` worked since Phase 4 but had no
scheduler behind it, only a manual call. `pg_cron` is now enabled on the project, running the sweep daily at
06:00 UTC (`cron.job` id 1, `0 6 * * *`).

The scheduler can't carry a client session, so the original function (which gates on
`is_platform_admin()` — there's no `auth.uid()` in a cron job's context, so it would always have raised) was
split: the reminder-matching logic moved into a new `run_deadline_reminder_sweep()`, revoked from `anon` and
`authenticated` (confirmed with `has_function_privilege`: both return false) so it can't be called as a
client-facing bypass of the admin gate, and the cron job calls that directly. `generate_deadline_reminders()`
still exists, still admin-gated, and now just delegates to the shared sweep function — verified both still
behave correctly: the sweep runs standalone (returned 0, correctly, against a database with no seeded
opportunities/saved-searches yet), and the admin-gated wrapper still raises `Admin access required` when called
outside an admin session, exactly as before the refactor.

No frontend changes — this was a pure backend/infrastructure gap (the function already existed and worked, it
just never ran automatically). No new UI, migration only.

**Verification**: real SQL probes against the live schema — confirmed the cron job is registered and active,
confirmed `anon`/`authenticated` cannot execute the internal sweep function, confirmed the sweep runs without
error, and confirmed the admin-gated public RPC still rejects non-admin callers after the refactor.

## 13. Real bug found via the first live anonymous-visitor test (2026-07-21)

Every RLS/permissions claim made in phases 1-7 above was verified by direct SQL probes run as an
elevated/service-role session — never by an actual anonymous browser hitting Supabase with the public
`anon` key. The Cloudflare Containers deployment (docs/cloudflare-deployment.md) was the first time
that happened, and it immediately surfaced a real bug: the public `/tenders` search page failed for
every anonymous visitor with `permission denied for function is_org_member`.

**Root cause**: `is_org_member()` and `is_platform_admin()` — the two helper functions referenced via
`OR` in nearly every table's RLS policy (e.g. `is_public AND is_opportunity_publicly_visible(...) OR
is_org_member(buyer_org_id) OR is_platform_admin()`) — had `EXECUTE` granted to `authenticated` but
**never to `anon`**. Postgres requires `EXECUTE` on every function referenced in a policy's `USING`
clause for the querying role, even when that particular `OR`-branch won't end up true — so a signed-out
visitor querying `opportunities` (which joins `sectors`/`districts`/`countries`, all with the same
policy shape) hit a hard permission error instead of just getting the public rows the policy intended
to allow. `is_opportunity_publicly_visible()` — the function actually named for the public case — did
have the `anon` grant; the two general-purpose membership/admin helper functions simply never got one,
presumably because nothing had exercised the anonymous path for real until now.

**Fix**: both functions are `SECURITY DEFINER` and key off `auth.uid()` internally, so granting
`EXECUTE` to `anon` is safe — called with no session, they correctly evaluate to `false`, and
table-level RLS remains the actual access boundary either way. `grant execute on function
public.is_org_member(uuid) to anon; grant execute on function public.is_platform_admin() to anon;`
No policy or schema changes — purely a missing grant.

**Verification**: `set local role anon` in a real SQL session, then ran the exact join shape
`searchOpportunities()`/`fetchSectors()`/`fetchDistricts()`/`fetchCountries()`/`fetchOpportunityTypes()`
use — all now execute cleanly with no permission error (empty result sets, since no real tender data
has been published yet — there are still zero rows in `auth.users`).

**Implication worth flagging**: this same class of bug could exist wherever a public-facing query path
in this codebase hasn't yet been exercised by a real anonymous or real authenticated session — every
verification across phases 1-7 relied on service-role SQL probes, which bypass grant checks entirely
the way RLS bypass works for a superuser. A live click-through as both a signed-out visitor and a real
signed-up user (buyer, supplier, admin) would be worth doing before treating any of this as fully
production-verified, not just schema-correct.

## 14. Where this leaves the platform

Seven phases in: Foundations, Tender Discovery, Publishing/Administration, Suppliers/Alerts, Commercial
Features, Intelligence, and a first slice of Regional Expansion are all implemented against the real schema
with RLS as the actual security boundary, not just UI conventions. Document upload (§11) and automated deadline
reminders (§12) close two long-standing deferred items. What's left per the original spec: further Phase 7
depth (more countries, dashboard-wide French, taxonomy translation, actual region-specific source ingestion),
document *extraction* (as opposed to upload), and the remaining deliberately-deferred items called out across
earlier phases (outbound email, API-key management, researcher ingestion tooling, admin-entered/website-ingested
tenders). Say the word on any of these when you're ready.
