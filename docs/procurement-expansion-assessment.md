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

## 14. Product pivot: tenders become the subscriber product, ad-platform goes internal (2026-07-22)

Decision, confirmed directly by the product owner after the first live click-through: the original
ad-platform (Campaigns, Content Studio, Calendar, Media Library, Audiences, Social Accounts, Analytics,
CRM Leads, Brand Kit) is no longer a customer-facing feature — it becomes internal SaloneReach-team
tooling for running the platform's own advertising. Tenders become the DGMarket-style subscriber
product: public listings stay open to everyone, but full detail pages and buyer publishing require a
paid subscription.

**Decisions confirmed**:
- **Ad-platform access**: platform admins only (`profiles.platform_role = 'admin'`) — reused the
  existing admin concept rather than inventing a separate "staff" role.
- **Two subscription tiers**: **Viewer** (view full tender details + receive alerts, can't publish) and
  **Publisher** (everything Viewer gets, plus publish their own tenders). Mapped onto the existing
  Free/Professional/Business/Enterprise plan ladder rather than introducing new plan rows, since that
  scaffolding already existed from Phase 5: `professional` = Viewer, `business`/`enterprise` = Publisher
  (Publisher's plan_features row sets *both* flags true, so a publisher's `hasFeature` check for viewer
  rights also passes — this is a data choice, not new logic, and is easy to re-map onto differently
  named/priced plans later without touching any application code).
- **Non-subscriber tender view**: DGMarket-style teaser — title, buyer, sector, district, country,
  submission deadline, estimated value, and summary stay visible; description, eligibility
  requirements, bid security, application fee, contact details, submission instructions, source
  name/URL, and documents are redacted.

**Why a new RPC instead of just RLS**: RLS is row-level — the `opportunities` row itself has to stay
selectable for the teaser fields to be public, which means the *raw* row (with every column) is still
reachable by any `anon`/`authenticated` query against the table directly. Column-level redaction based
on a *dynamic, per-caller* entitlement (not a fixed Postgres role) isn't something RLS alone can do.
Verified this concretely: queried the raw `opportunities` table as `anon` on a real test tender and got
the full `description`/`contact_details` back, even after the redaction logic existed elsewhere — so
the fix had to be at the query surface itself, not an additional policy. `get_opportunity_detail(slug)`
(`SECURITY DEFINER`) now does the redaction server-side and is what `fetchOpportunityBySlug()` calls
instead of a direct table select; `opportunity_documents`' public-visibility policy was updated to
require the same entitlement, since documents would otherwise leak the same way.

**New plan features**: `tender_alerts_and_details` and `tender_publishing` (boolean-style, same
`limit_value` 0/1 convention already used by `data_export`). `org_has_feature(org_id, key)` checks a
specific org (used for buyer-mode activation — must be scoped to *that* org, not "any org the user
belongs to"); `user_has_tender_feature(key)` checks whether *any* of the calling user's orgs has it
(used for read-access gating, where "viewing" isn't tied to acting as one specific org).

**Buyer-mode publishing gate**: `protect_buyer_mode_activation_trigger` on `organizations` blocks
`is_buyer` transitioning false→true unless the org has `tender_publishing` (or the actor is a platform
admin) — same "silently revert, don't error" idiom as the existing `protect_platform_role_trigger` /
`protect_opportunity_transition_trigger`. `enableBuyerMode()` now returns whether activation actually
took, and the UI shows an upgrade prompt instead of assuming success.

**Ad-platform RLS**: `campaigns`, `content_items`, `leads`, `social_connections`, and `brand_kits` now
require `is_platform_admin()` in addition to org membership on every operation. Scoped deliberately to
the "build and publish adverts" toolchain — `directory_profiles`, `influencer_profiles`, event
promotion, and tourism were left untouched this pass (they're marketplace/discovery features, not
advertising creation, and weren't explicitly called out); worth flagging if those should be gated too.
Nav (`App.tsx`) reorganized to match, but the nav change is UI convenience only — the RLS changes are
the actual boundary, verified independently of what any tab shows.

**Verification**: `tsc --noEmit` and `npm run build` clean. Every piece of the new gating chain was
verified with real probes against the live schema, not read-through: `org_has_feature` false with no
subscription → true after an active Business-tier subscription; `get_opportunity_detail` on a real
published test tender redacts `description`/`contact_details` for an anonymous caller and confirmed
`has_full_access: false`; the raw table select (proving the RPC is actually necessary, not redundant)
still leaked the full row to the same anonymous caller; `protect_buyer_mode_activation_trigger` silently
kept `is_buyer` false on an unentitled test org, then allowed it through once that org had an active
subscription. All test rows (probe tender, probe org, probe subscription) were cleaned up afterward.
`baimasonga@gmail.com`'s original placeholder-admin note is superseded — the actual first admin,
`mabangura@quantixsl.com`, signed up and was promoted this session, and their org (`FaxaRa`) was given
a real active Business-tier subscription during testing (harmless — admins bypass entitlement checks
regardless — but worth knowing it's there rather than a genuine purchase).

**Known follow-ups, not attempted this pass**: the "Overview" dashboard tab's content still mixes
ad-platform-flavored stats for all orgs (only the *nav visibility* and backend RLS were scoped, not a
content rewrite of what Overview shows non-admin orgs). No per-tab render guard was added inside
`Workspaces.tsx` for the now-admin-only tabs (defense-in-depth only — RLS is the real boundary, and a
non-admin hitting one of those tabs would just see empty data, not a leak). Pricing page CTA links to
the existing `/#pricing` landing-page anchor, which still describes the *old* ad-platform-oriented plan
tiers, not the new Viewer/Publisher framing — worth a copy pass before real customers see it.

## 15. Regression: the Phase 14 RLS lockdown broke onboarding for every non-admin (2026-07-22)

Found by the first real non-admin signup attempt (not a probe) — clicking "Complete Workspace Setup"
appeared to do nothing. It actually succeeded silently, five times: `create_organization()` has no
duplicate guard, and the client's error handling swallowed a downstream failure without surfacing it,
so each click just created another org and re-hit the same silent failure.

**Root cause**: `fetchOrgBundle()` (called for *every* user on every workspace load, not just
ad-platform users) used `.single()` on `brand_kits`, which throws when zero rows come back. §14's RLS
lockdown made `brand_kits` (and `campaigns`/`content_items`/`leads`/`social_connections`) admin-only —
so for any non-admin org, that query now legitimately returns zero rows, and `.single()` throws. The
thrown error was caught by `loadWorkspace`'s try/catch, which sets `workspaceError` — but the render
logic checks `view === 'onboarding'` *before* checking that error state, so the failure was completely
invisible: the user just saw the same onboarding form again, with no indication anything had happened.

**Two real bugs, both fixed**:
1. `fetchOrgBundle()` now uses `.maybeSingle()` for `brand_kits` and falls back to a blank
   `EMPTY_BRAND_KIT` placeholder when null — safe because a non-admin org can never reach the Brand
   Kit/Content Studio UI anyway (hidden from nav since §14, and RLS blocks any write regardless).
   `campaigns`/`content_items`/`leads`/`social_connections` never needed this fix — RLS-filtered-to-zero
   returns an empty array, not an error, from a plain (non-`.single()`) select; `brand_kits` was the only
   one using `.single()`.
2. `create_organization()` had no guard against a user creating more than one org, despite "exactly one
   organization per user" being the documented design intent since Phase 1. Added a check that raises a
   clear, friendly error ("You already have an organization...") instead of silently creating another.

**Verification**: live probes against the real schema, not just read-through — confirmed the RPC now
rejects a second org creation for the same user with the intended error message; confirmed the
`brand_kits` select for the real affected user (`baimasonga@gmail.com`, used as this session's
deliberately-non-admin/non-subscribed test account) returns zero rows without erroring, matching what
the fixed client code now expects. Cleaned up the four duplicate "Timo global" orgs created during the
stuck-form incident, keeping the first. `tsc --noEmit` and `npm run build` clean.

**Lesson for future admin-only RLS lockdowns**: check every code path that touches the restricted
tables, not just the features that obviously belong to that domain — `fetchOrgBundle` wasn't an
"ad-platform feature," it was universal workspace-loading plumbing that happened to also fetch
ad-platform data unconditionally for every user.

## 16. Closing the §14 follow-ups: Overview and Tenders tabs are now tier-aware (2026-07-22)

§14 restricted the ad-platform to admins at the RLS/backend level but explicitly flagged two UI gaps as
not-yet-done: the Overview tab still showed 100% ad-platform content to every org, and the Tenders tab
showed the "Enable Buyer Mode" publish CTA to every non-buyer org regardless of subscription tier. Direct
product-owner feedback after the first non-admin click-through confirmed both needed fixing — a Viewer
subscriber (detail access + alerts, no publishing) should never see tender *publishing* tools in their
dashboard at all, not just have them disabled.

**Overview tab**: now branches on `isPlatformAdmin`. Admins keep the original ad-platform stats view
unchanged. Everyone else gets a procurement-relevant overview: subscription tier badge (Free/Viewer/
Publisher, derived from the same `tender_publishing`/`tender_alerts_and_details` plan features §14
introduced), saved-search count, pipeline count, quick links to Tenders/Pipeline/Supplier Profile, and a
subscribe upsell for Free-tier orgs. Real counts, not placeholder numbers — pulled from
`fetchPipeline()`/`fetchSavedSearches()`, both already existing from earlier phases.

**Tenders tab**: now branches three ways instead of the old binary `isBuyer` check:
- **Publisher** (`tender_publishing` entitled, or already `is_buyer`): unchanged — buyer publish form
  and "Your Tenders" management.
- **Viewer** (`tender_alerts_and_details` only): a saved-searches/alerts panel (reusing the same
  `fetchSavedSearches`/`deleteSavedSearch` the public search page already uses) plus a link to browse
  tenders — **no publish UI rendered at all**, not shown-then-blocked.
- **Free/no subscription**: a subscribe upsell, no tender tooling.

`setActiveTab` had to be threaded into `Workspaces` as a new prop (wasn't previously passed down — the
component only ever received `activeTab` read-only) so the new Overview quick-links could actually
navigate.

**Deliberately not attempted this pass**: real email/WhatsApp alert delivery. The product owner asked
for this directly ("receives alert via emails/WhatsApp etc"), and it's a genuine gap — Phase 4's alert
pipeline only ever created in-app notification rows, explicitly because no email/SMS provider was
configured. This needs the owner to choose and provide credentials for a real provider (e.g. Resend/
Postmark/SES for email, Twilio or the WhatsApp Business API for WhatsApp) before it can be built for
real — same reasoning as not fabricating Cloudflare/Gemini credentials earlier in this session.

**Verification**: `tsc --noEmit` and `npm run build` clean.

## 17. Discovery (Influencer Market, Business Directory, Event Promotion, Tourism) is admin-only too (2026-07-22)

§14 deliberately scoped the ad-platform lockdown narrowly to the "build and publish adverts" toolchain
and left Discovery untouched, flagging it explicitly as a scoping decision the product owner might want
to revisit. They did: direct feedback after seeing it in the live non-admin dashboard — subscribers
should see *only* tender tools scoped to their tier, nothing else.

Moved the whole Discovery nav group behind `isPlatformAdmin`, same as Social Media Advertising. At the
RLS level: `directory_profiles` and `influencer_profiles` (the two with real backing tables) now require
`is_platform_admin()` for every operation — verified live, zero rows visible to the non-admin test
account. Event Promotion and Tourism needed no RLS change since they have no backing tables at all —
still simulated/static UI, per the original Phase 0 assessment — so hiding the nav tab is the complete
fix for those two.

Note for later: the product owner's next stated step is designing a *third* subscriber type — someone
who pays specifically to advertise their own business/event/goods/services (their words: "another type
of subscriber that has paid for advertising his or her business/event, goods and service"). Business
Directory and Event Promotion are very plausibly where that tier's features will eventually live — but
that's explicitly a follow-up design conversation, not decided yet, so nothing here anticipates it.

**Verification**: `tsc --noEmit` and `npm run build` clean; live probe confirmed `directory_profiles`
returns zero rows for the non-admin test account under the new policy.

## 18. Where this leaves the platform

Seven phases plus a Regional Expansion slice are implemented against the real schema with RLS as the
actual security boundary. §11-§14 closed document upload, automated reminders, and — the largest change
— repositioned the whole product: tenders are now the subscriber-facing product with a real
teaser/paywall boundary, and the original ad-platform is internal-only. §15 fixed a real regression that
lockdown introduced (onboarding crash for non-admins). §16-§17 closed the remaining UI/access gaps from
§14 (Overview and Tenders tabs are tier-aware; Discovery is admin-only too). What's left per the original
spec: further Phase 7 depth, document *extraction*, real outbound email/WhatsApp alert delivery (needs
provider credentials from the owner), the remaining deliberately-deferred items (API-key management,
researcher ingestion tooling, admin-entered/website-ingested tenders), pricing page copy (still describes
the old ad-platform-oriented tiers), and — the next thing on deck — designing a third subscriber type for
paid business/event/goods/services advertising (§17). A live click-through of the full tender lifecycle
(buyer publish → admin review → public listing → subscriber detail view) as real non-admin accounts is
still outstanding too.

## 19. Third subscriber type: Advertiser — submit-and-report, no directory/browsing UI (2026-07-22)

Follow-up to the design question flagged at the end of §17. Direct product-owner instruction on scope:
"no business directory listing/event promotion etc would appear on the subscriber page. the only info to
appear is details about the adverts submitted for advertising (no people reach, number of times the
advert was run, which platform the advert appeared etc)" — i.e. this tier gets *no* discovery/browsing
tooling at all (that stays admin-only per §17), just a narrow submit-a-request-and-see-the-report loop.
The actual design/production of the advert remains admin-only ad-platform work; the subscriber only
supplies what they want advertised and later sees what happened.

**Schema** (new table, no local migration files — applied directly via Supabase MCP as with the rest of
this schema): `advertisement_requests(id, org_id, requested_by, category [business/event/goods/service],
subject, description, status [submitted/in_production/live/completed/cancelled], platform, reach_count,
run_count, start_date, end_date, created_at, updated_at)`.

**RLS**: SELECT for org members + `is_platform_admin()`. INSERT requires
`org_has_feature(org_id, 'business_advertising')` — deliberately no org-member UPDATE policy at all,
admin-only, since this is a one-way report the subscriber can't self-edit. New plan_features row:
`business_advertising` (free=0, professional=0, business=1, enterprise=1).

**API layer** (`procurementApi.ts`): `submitAdvertisementRequest`, `fetchMyAdvertisements`,
`fetchAllAdvertisementRequests` (admin queue, joins `organizations.name`), `updateAdvertisementReport`
(admin fulfillment — status/platform/reach_count/run_count/dates).

**UI**: new "My Adverts" nav item, shown only when the org actually holds the `business_advertising`
entitlement (unlike Tenders, which stays visible to Free-tier orgs with an upsell — this is an add-on
feature, not core to the product, so it's hidden rather than shown-then-blocked for orgs without it).
Contains a submission form (category/subject/description) and a read-only list of the org's own requests
showing status plus, once fulfilled, platform/reach/times-run. Admin side: "Advertising Requests" item in
the Platform Admin group — a fulfillment queue with a status dropdown and three prompt-based fields
(platform, reach, run count) per request, same interaction pattern as the existing Service Requests queue.

**Verification**: `tsc --noEmit` and `npm run build` clean. Live RLS probes via `set local role
authenticated` + simulated JWT claims (not the superuser MCP context, which bypasses RLS): a non-entitled
org's INSERT was rejected (`42501` RLS violation); an entitled org's INSERT succeeded; a non-admin org
member's UPDATE attempt silently affected zero rows (correct — no self-service update policy exists); an
admin's UPDATE through a real simulated admin session succeeded. Separately re-verified the exact query
shapes the new UI code issues — the subscriber `SELECT` (own org, no join), the admin `SELECT` with the
`organizations(name)` embed, and the admin `UPDATE` writing status/platform/reach_count/run_count
together — all executed successfully as the real entitled/admin users, then cleaned up the test rows
afterward.

## 20. Landing page realigned to the tender platform, not the old ad-campaign pitch (2026-07-22)

Flagged as a known gap at the end of §18 and actioned directly: the public landing page (hero, "Who We
Serve," feature bento grid, pricing) still pitched SaloneReach as an ad-campaign tool for local
businesses — "Start Campaign," WhatsApp click tracking, verified business directory, campaign-count
pricing tiers. That's now admin-only internal tooling per §14/§17 and never subscriber-facing, so the
public-facing pitch was actively describing a product visitors can't sign up for.

Rewrote all four sections to describe the real product:
- **Hero**: tender search/subscribe/publish framing, "Browse Tenders" CTA linking to `/tenders`, honest
  stat chips (Free public search, SL + LR coverage, live alerts) instead of fabricated audience-reach
  numbers.
- **Who We Serve**: Suppliers & Bidders / Buyers & Institutions / Business Advertisers — matching the
  three real subscriber roles this session built (Viewer/Publisher tender tiers, §19's Advertiser tier).
- **Feature grid**: AI Tender Assistant (`explain_tender`/`aiSuggestSector`, real endpoints from earlier
  phases), Saved Searches & Alerts, Buyer Publishing Workflow, Bid Pipeline & Documents — all features
  that actually exist and are subscriber-reachable, replacing the AI-campaign-copy/directory-listing
  content that isn't.
- **Pricing**: four tiers pulled directly from the real `plans`/`plan_features` tables via Supabase MCP —
  Free (teaser, 3 saved searches), Professional (`tender_alerts_and_details`, 10 saved searches, 3 team
  members), Business (`tender_publishing` + `business_advertising` + `data_export`, 25/10), Enterprise
  (unlimited everything). Prices are "Contact Us" rather than fabricated dollar figures since
  `monthly_price`/`annual_price` are genuinely null in the database — subscriptions go through the
  existing manual bank-transfer request/admin-activate flow, not a priced checkout.

**Verification**: `tsc --noEmit` and `npm run build` clean. Started the dev server and rendered all four
sections in a real headless-browser screenshot pass (hero, audience, features, pricing) to confirm layout
held after the copy swap — not just a read-through.

## 21. Landing page redesign: real tender data, honest empty state, unified visual system (2026-07-22)

Direct product-owner request: "the front page UI needs to be redone for displaying tenders and other
adverts... the UI must be design professional." Rebuilt `LandingPage.tsx` end to end rather than making
incremental copy edits, using the `ui-ux-design` skill's process (frame the problem, one job per section,
apply heuristics, critique against the checklist).

**What changed:**
- **Hero**: replaced the old single hardcoded "sample listing" mockup — which implied it was live data but
  wasn't — with an honest "How It Works" 3-step panel (Search free → Subscribe → Bid or publish). No fake
  data anywhere in the hero now.
- **New "Live Tender Feed" section**: genuinely wired to `searchOpportunities({})`, showing the latest 6
  published tenders as real cards (sector, buyer, district, deadline), or a deliberately designed empty
  state (dashed border, plain-language explanation, "Get Alerted" CTA) for the current reality — 0
  published tenders in the database today. This directly answers "displaying tenders": it's live, not
  decorative, and will start populating itself the moment the first buyer-submitted tender clears admin
  review.
- **Visual system unification**: discovered mid-task that `index.css` already force-flattens
  `rounded-xl`/`rounded-2xl`/`rounded-3xl` to 0 and strips shadows off certain `bg-white.border` /
  `bg-slate-50.border` combinations globally (`!important` overrides) — meaning the page's soft-SaaS
  source classes were already rendering sharp-cornered in production, just inconsistently (some cards
  escaped the override via opacity-modified background classes like `bg-slate-50/50`, which don't match
  the plain-class selector). Rewrote every section to use explicit sharp-cornered classes directly
  (`border border-[#0F172A]`/`border-slate-200`/`border-slate-300`, zero `rounded-*` classes anywhere) so
  the design is correct by construction rather than accidentally correct via a global hack. Added numbered
  index badges (01/02/03) to the "Who We Serve" and "How It Works" cards, echoing the same
  `itemNum`-in-the-corner convention the dashboard sidebar already uses — a small consistency thread tying
  the marketing site to the product itself.
- **Mobile header bug found and fixed during review**: the original header (logo + "Sign In" text button +
  "Get Started" button, all always visible) overflowed at 390px width — confirmed by an actual mobile
  viewport screenshot, not assumed. Replaced with a proper collapsible mobile menu (hamburger toggle,
  `aria-expanded`/`aria-label`, full-width dropdown with stacked nav links + Sign In + Get Started),
  re-screenshotted open and closed to confirm the fix.

**Verification**: `tsc --noEmit` and `npm run build` both clean. Rendered every section with a real headless
browser (desktop 1440px full-page pass, plus a dedicated mobile 390px pass with the menu opened and
closed) rather than reviewing source code alone — this is how the mobile overflow bug was actually caught.

## 22. Landing page density pass: real sector/stats content, tighter spacing (2026-07-22)

Direct product-owner feedback on §21's redesign: "too much of white spaces and few web items for
displaying contents," plus a scoping instruction that the Pricing section ("A Tier for Every Role") must
stay exclusive to the general front page (confirmed via grep — it only ever existed in `LandingPage.tsx`,
not duplicated elsewhere; no code change needed for that part, just confirmed and left as-is).

Addressed the density complaint with real content, not decoration:
- **Prominent search bar** in the hero, wired to `/tenders?q=...` — the signature element real commercial
  procurement portals (DGMarket, UNGM) lead with, which the previous pass didn't have.
- **New "Browse By Sector" section**: all 12 real sectors from the `sectors` table (`fetchSectors()`),
  rendered as a dense clickable tile grid linking to `/tenders?sector={id}`, each icon-mapped by keyword
  match against the real sector name (Agriculture → wheat icon, Health → heart-pulse, etc.), with a
  generic building icon as fallback. Zero fabricated categories.
- **Real stat strip** in the hero: sector count, district/county count (31, from `fetchDistricts()`),
  and country count (2) — all live counts from the same taxonomy tables the search filters already use,
  not invented traffic numbers.
- **New FAQ section** (5 real Q&As grounded in actual product mechanics — free browsing, admin review,
  plan differences, advertising flow, country coverage) as a working accordion.
- **Denser tender feed**: 9 cards instead of 6, tighter grid gaps.
- **Richer 4-column footer**: Platform / Account / Get In Touch link columns instead of a single
  brand-plus-copyright row — only real in-page anchors and existing actions (Sign In/Get Started), no
  invented pages.
- **Tightened vertical rhythm** throughout: `py-20` → `py-14`, `gap-16` → `gap-8`, condensing the standalone
  "How It Works" card into a compact horizontal ribbon under the hero instead of a tall side card.

**Verification gap, disclosed rather than papered over**: attempted to re-screenshot the live-data
rendering as done for §21, and discovered mid-session that this sandbox's outbound proxy explicitly
denies (403, confirmed via the proxy's own `/__agentproxy/status` failure log) any connection to this
project's Supabase domain — for every process, not just curl. This means §21's earlier "verified empty
state" screenshots were actually rendering a silently-caught network failure (`.catch(() => setLatest([]))`
masks a fetch error identically to a genuine empty result) — not a confirmed real render. Per the proxy's
own policy ("do not retry or route around it"), did not attempt a bypass. Instead verified layout/density
with temporary local mock data matching the real 12 sector names, but the user interrupted before that
screenshot completed; the mock code was fully reverted (confirmed via diff against a pre-mock backup) and
never shipped. `tsc --noEmit` and `npm run build` are clean, but the actual live-data rendering of this
page has **not** been re-confirmed visually since §21 and should be checked on the deployed site.

## 23. Landing page restructured around the DGMarket reference screenshot (2026-07-22)

The product owner shared an actual screenshot of dgmarket.com's front page as a direct design reference.
Its information architecture is fundamentally different from the modern-SaaS structure built in §21-22: a
compact utility search bar above any marketing copy, a short photographic banner (not a big headline
hero), a "Sectors" sidebar showing live per-sector tender counts, a dense list-style (not card-grid) main
tender listing, and a secondary "Popular tenders" sidebar list — altogether a much more information-dense,
utility-first directory feel than a typical landing page.

Restructured the top of `LandingPage.tsx` to match that pattern while keeping the existing sharp
navy/emerald "Emerald Sky" visual identity (no stock photography available or appropriate to fabricate, so
the banner uses the brand's own geometric pattern instead of a photo):
- **Utility search bar**: a slim strip directly under the header — keyword input, Search button, Advanced
  Search link — the very first thing after branding, before any pitch copy.
- **Compact banner**: replaced the previous full headline hero with a shorter navy banner (tagline +
  live sector/district/country stat trio), closer to DGMarket's photo-banner proportions.
- **Three action cards**: Find Tenders / Get Alerts / Subscribe — mirroring DGMarket's icon+headline+link
  utility-card row exactly, mapped to our own real actions (browse, get-started, pricing anchor).
- **Three-column directory**: a real "Sectors" sidebar with live per-sector tender counts (computed
  client-side from the same fetched opportunity list — grouping, not a new query), a dense "Latest &
  Featured Opportunities" list (title + district/country + deadline per row, not a card grid), and a
  "Popular Tenders" sidebar sorted by the real `view_count` column.
- **New `viewCount` field**: added to `OpportunityListItem` (procurementApi.ts) — `view_count` was already
  a real column on `opportunities` (fed by the existing `increment_opportunity_view` RPC) but had never
  been exposed through `LIST_SELECT`/`mapListItem`; this is the only backend-adjacent change, a single
  centralized mapper update, not new fabricated data.
- The rest of §21-22's content (Who We Serve, Features bento, FAQ, Pricing, richer footer) stays below
  this directory block — DGMarket doesn't need to explain or sell itself since it's an established brand,
  but SaloneReach still does, so both structures now coexist: directory-first, marketing explanation after.

**Verification**: `tsc --noEmit` and `npm run build` clean. Re-confirmed the §22 finding that this
sandbox's egress policy blocks real Supabase calls from any local process — so, as before, verified the
new layout with temporary local mock data (matching the real 12 sector names and a realistic view-count
spread), screenshotted at full desktop width, then reverted the mock via diff-checked restore before
this commit. A faint diagonal artifact in the banner screenshot was double-checked with a tight crop and
confirmed to be a downscaling/moiré artifact of the repeating-gradient background, not real content
bleeding through.

## 24. Banner graphics + a real invisible-headline bug found by actually rendering it (2026-07-22)

Product owner request after seeing the deployed §23 banner live (confirmed real data: 12 sectors/31
districts/2 countries matching the database): add graphics relating to tendering and advertising to the
banner. Added an icon cluster (Tenders/Search/Adverts/Alerts, four bordered emerald-on-navy tiles using the
existing icon-in-box visual language — no stock photography, consistent with §21's decision not to
fabricate imagery) plus a large, very low-opacity `ClipboardList` watermark icon in the banner's corner for
quiet texture.

**Real bug found while rendering this, not by reading code**: the banner headline
("Procurement Opportunities Across West Africa") was completely invisible — navy text on the navy banner
background. Root cause: `index.css` has a blanket `h1, h2, h3, h4 { color: #0F172A !important; }` rule.
Every other heading in the app happens to already use Tailwind's `text-slate-900`, whose hex
(`#0f172a`) is *identical* to that forced navy — so the override has been silently harmless everywhere
else in the product. This banner was the first heading ever placed on a dark background wanting white
text, which is exactly what exposed it. Fixed with Tailwind's important-modifier (`!text-white`), which
compiles to a class-selector `!important` rule that beats the element-selector `!important` rule on
specificity. Caught only because the icon-cluster verification screenshot was taken and actually looked at
— a pure code read-through would never have surfaced this, since the JSX itself looked completely correct
(`text-white` on the parent section, headline with no conflicting class).

**Verification**: `tsc --noEmit` and `npm run build` clean. Screenshotted before and after the fix at the
banner region specifically (not just a full-page shot) to confirm the headline is now visible white text.
No mock data needed this time — the icon cluster, watermark, and headline don't depend on tender/sector
data, so the real (sandbox-blocked) fetch code was rendered as-is, showing honest "—" placeholders for the
sector/district counts exactly as a real empty response would.

## 25. Original vector illustration in the banner (2026-07-22)

Follow-up request: add actual vector images of tenders/procurement/adverts to the banner, beyond the small
icon tiles from §24. Hand-built a original inline SVG (`ProcurementIllustration` in `LandingPage.tsx`) —
a tender document (header bar, body text lines, emerald approval-seal checkmark) paired with a megaphone
emitting amber reach waves — composed from basic shapes in our own brand palette, not a fetched/licensed
stock asset. Used twice: a visible ~160px version stacked above the stat trio on md+ screens, and a very
low-opacity oversized version as background texture (replacing the plain `ClipboardList` icon watermark
from §24). Hidden below `md` so the mobile layout stays clean (confirmed via a dedicated 390px screenshot).

**Verification**: `tsc --noEmit` and `npm run build` clean. Screenshotted both the desktop banner (confirms
the illustration renders correctly, right colors, no overlap with the stat trio) and mobile width (confirms
it's properly hidden and nothing overflows).

## 26. Filled in the flat white background behind the action-cards row (2026-07-22)

Direct feedback on the plain white background behind the Find Tenders/Get Alerts/Subscribe row — it had no
texture and no heading, unlike every other section on the page. Gave it a soft emerald-tinted gradient
fade (`from-emerald-50/50 via-white to-white`) plus the same faint diagonal-stripe texture used in the
banner, for visual consistency rather than introducing a new pattern. Also added a small "Quick Actions"
eyebrow label above the cards, since this was the one section on the page with no heading at all.

**Verification**: `tsc --noEmit` and `npm run build` clean. Screenshotted the section directly to confirm
the gradient/texture render correctly and the JSX nesting (an extra wrapping div was needed for the eyebrow
label) didn't break the card grid layout.

## 27. External audit review + real Media Library storage (2026-07-22)

The product owner had a separate ChatGPT session audit this repo for unimplemented/mocked features and
shared its findings. Spot-checked the specific claims directly against the current code (Media Library
upload simulation, static December 2026 calendar, alert-only tracking links, text-only directory
verification) — all still accurate. But the audit's framing missed a key fact: every flagged gap lives
inside the ad-platform module (Media Library, Calendar, Tracking Links, Events, Tourism, Influencer,
Directory) that §14/§17 deliberately locked to platform-admin-only. These are no longer subscriber-facing
gaps — they only matter if and when the SaloneReach team needs to actually run real ad production through
them. The audit also didn't mention the procurement/tender side at all, which is where nearly all of this
session's real engineering went and is live-deployed and personally tested. Its finding that Cloudflare
deployment was "pending credentials" (its version of §12) is now outdated — deployed and verified live
several times over. Its finding that the planning docs are stale relative to the code (its #13) is correct
and became task #45 below.

Agreed with the owner to work through all three follow-ups (real internal ad-tooling, deepen procurement,
fix stale docs), starting with real Media Library storage as the first concrete piece:

- **New `media_assets` table** (org_id, folder, file_name, storage_path, file_size, mime_type, uploaded_by,
  created_at), RLS `is_org_member(org_id) and is_platform_admin()` — identical convention to
  `content_items`/`campaigns`.
- **New private `media-assets` storage bucket** with a storage.objects RLS policy keyed on
  `(storage.foldername(name))[1]::uuid` matching the existing `private-documents` bucket's pattern exactly.
- **API layer** (`src/lib/api.ts`): `fetchMediaAssets`, `uploadMediaAsset` (10MB ceiling, same as tender
  documents), `deleteMediaAsset`, `getMediaAssetUrl` (5-minute signed URL, same pattern as
  `getOpportunityDocumentUrl`).
- **Workspaces.tsx Media Library tab**: replaced `simulateUpload`'s fake timed progress bar with a real
  hidden `<input type="file">` triggered by the Upload button, a real folder-name input, and a plain
  "Uploading…" state (no fabricated percentage, since the Supabase JS client doesn't expose real upload
  progress without dropping to a lower-level XHR/tus client — better to show nothing fake than a
  meaningless number). The hardcoded four-folder grid and five-placeholder thumbnail grid are now derived
  entirely from real fetched assets — real per-folder counts, real file names/sizes, a real delete button,
  and click-to-view via a lazily-fetched signed URL.

**Verification**: `tsc --noEmit` and `npm run build` clean. Live-verified RLS with real probes (non-admin
org member blocked with `42501`, admin insert succeeds) and confirmed the exact `select`/`insert`/`delete`
column shapes the new UI code issues round-trip correctly against the real table — the same substitute
used throughout this session for admin-dashboard features, since those screens need a real authenticated
app session this sandbox's browser can't reach (blocked by the sandbox's own egress policy, per §22).

## 28. Real tracking links, click capture, and analytics (2026-07-22)

Replaced the entire alert-only/mock tracking-and-attribution layer with a real one:

- **Schema**: `tracking_links` (org_id, label, target_url, short_code, click_count) and
  `tracking_link_clicks` (tracking_link_id, org_id, clicked_at, referrer). Management RLS matches the
  admin-only convention (`is_org_member(org_id) and is_platform_admin()`); the tables themselves are never
  directly readable by anon.
- **`resolve_tracking_link(p_code, p_referrer)` RPC** — SECURITY DEFINER, granted to `anon` and
  `authenticated`, same pattern as `increment_opportunity_view`/`get_opportunity_detail`: looks up the
  short code, atomically increments `click_count`, logs a click row, and returns the real target URL.
- **Real server-side redirect**: `GET /r/:code` in `server.ts` calls the RPC and issues a genuine HTTP 302
  — a server route rather than a client-side SPA route, so it's fast, works without JS, and behaves
  correctly for share-preview crawlers.
- **API layer**: `createTrackingLink`, `fetchTrackingLinks`, `deleteTrackingLink`, and `fetchClickSeries`
  (buckets real click timestamps into a daily series, replacing the hardcoded `[65, 80, 55, ...]` array).
- **Tourism tab**: the two "Generate Tracking Link" buttons (previously `alert('...configured!')`) now
  create a real link on demand (prompting for the real destination — a WhatsApp link or booking page — 
  instead of assuming one) and, once created, show the real `/r/{code}` short link with a copy button and
  live click count.
- **Analytics tab**: replaced three fabricated stats (Le 240 CPC, 8.2% conversion, 42% diaspora share — no
  backing data existed for any of them) with real ones (active tracking links, total clicks, clicks in the
  last 7 days), added a real daily click chart, and a full tracking-link builder + list (this also picked
  up a completely orphaned, never-rendered UTM-builder state block that existed in the code but was wired
  to no UI at all).
- **Overview tab** (admin ad-stats view): replaced "Audience Reach" (4,812,400, fake), "WhatsApp Clicks"
  (12,410, fake), and "Est. ROI Index" (3.5x, fake) with Active Campaigns, Tracking Link Clicks, and
  Content Published — all real counts from data already being fetched — plus the same real click chart.

**Verification**: `tsc --noEmit` and `npm run build` (including the esbuild server bundle) clean. Live
end-to-end probe: created a real tracking link as the real admin session, resolved it via
`resolve_tracking_link` as genuinely anonymous (`set local role anon`, no JWT claims at all) — confirmed
`click_count` incremented, a real click row was logged, and the real target URL was returned — then
confirmed anon still cannot read `tracking_links` directly (RLS blocks it; only the RPC path works).

## 29. Real calendar month navigation (2026-07-22)

Replaced the fixed 28-cell "December 2026" grid with a genuine month calendar: real days-in-month (28-31,
leap-year aware), correct Monday-first weekday alignment for whichever month is showing, Prev/Next
navigation defaulting to the real current month, and scheduled posts matched against real `scheduledDate`
values (already-real `content_items` data — the old code just only ever checked `2026-12-DD` regardless of
what month was displayed).

**Verification**: `tsc --noEmit` and `npm run build` clean. Verified the pure date-arithmetic logic
(`getCalendarCells`/`formatDateKey`) directly in Node — confirmed July 2026 starts on the correct Wednesday
with 2 leading blank cells and 31 real days, and Feb 2028 (a leap year) correctly shows 29 days.

## 30. Real influencer/directory/events workflows (2026-07-22)

Closed the three most jarring "claims to do something but doesn't" gaps in the remaining ad-platform
prototype screens:

- **Influencer "Invite Partner"** (`alert('Inquiry submitted...Stored in CRM.')`, no CRM effect at all) now
  creates a real `leads` row via a new `createLead()` function (org-scoped, admin-only RLS, same convention
  as every other ad-platform table) — the creator's proposed budget is captured and the lead genuinely
  appears in the CRM Leads tab afterward.
- **Directory verification** ("Corporate document name" was a plain text field — nothing was ever uploaded
  or checked, and `claimDirectoryListing()` verified the listing regardless of what was typed) now requires
  and uploads a real file through the same storage-backed Media Library built in §27, tagged into a
  "Verification Documents" folder, before the listing is marked verified.
- **Events "Promote Concert"/"Promote Summit"** (`alert('...added to Content Studio drafts!')`/
  `alert('...added to Campaign planner!')`, neither of which happened) now call the real
  `createContentItem()` API already used by the Content Studio tab, producing an actual draft (real title,
  headline, body, hashtags, scheduled date matching the event) that genuinely appears in Content Studio
  afterward.

**Known remaining gap, not attempted this pass**: the events/tourism destinations themselves are still two
hardcoded example entries each, not full CRUD (create/edit/delete real events or tours). Given the time
already invested in this follow-up and that these are internal admin-only screens (not subscriber-facing),
building full event/tour management was judged lower priority than fixing the three actions that actively
lied about what they'd done — flagging honestly rather than quietly leaving it off the list.

**Verification**: `tsc --noEmit` and `npm run build` clean. Live-verified the exact `leads` insert shape
`createLead()` issues against the real table schema, as the real admin session — succeeded, then cleaned
up the test row.

Say the word on anything else when you're ready.
