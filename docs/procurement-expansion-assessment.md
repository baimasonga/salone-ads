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

## 5. What's next (Phase 2 — not started, needs a separate go-ahead)

Phase 2 is where the product becomes visible: the `opportunities` domain table itself, public tender
search/detail pages (this needs a client-side router — none exists today), category/sector/district browse
pages, and buyer profile pages. This is a much bigger UI lift than Phase 1 and touches the app's navigation
structure, so I'll scope it separately once you're ready rather than bundling it into this pass.
