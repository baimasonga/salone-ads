# SaloneReach Implementation Plan

> **⚠️ Superseded by a product pivot — read this first.** This document describes the *original*
> ad-platform-only vision. SaloneReach has since pivoted: **tenders/procurement are now the subscriber-
> facing product**, and everything below (Campaigns, Content Studio, Media Library, Calendar, Tracking,
> Directory, Influencers, Events, Tourism) is now **admin-only internal tooling** used by the SaloneReach
> team itself to run its own promotion — never sold to or seen by paying subscribers. The phase table below
> is updated to reflect real status, but for the actual detailed, chronological build log (what's real,
> what's mocked, what's verified, and why), see **`docs/procurement-expansion-assessment.md`** — that is
> the current source of truth for this project, not this file.

## Milestone Tracking & Phase Plan

| Phase | Title | Scope Summary | Status |
|---|---|---|---|
| **Phase 0** | **Foundation** | Full-stack server skeleton, Tailwind styling, health checks, responsive sidebar layouts, auth screens, public landing | **Done** |
| **Phase 1** | **Authentication & Orgs** | Sign-in, onboarding, tenant selection, team roles, and secure membership invites | **Done** |
| **Phase 2** | **Brand Kit & Media** | Centralized asset managers, logo palettes, tags, file upload limits, low-bandwidth previews | **Done** — real storage-backed uploads (`media_assets` table + private bucket), replacing the earlier fake progress-bar simulation |
| **Phase 3** | **Campaigns & Content** | Campaign CRUD, statuses (Planning, Scheduled, Active), template previews, calendar schedules | **Done** |
| **Phase 4** | **AI Campaign Assistant**| Gemini integration generating localized copywriting, brief suggestions, radio/TV scripts, hashtags | **Done** (real Gemini integration, with a local mock fallback when no API key is configured) |
| **Phase 5** | **Calendar & Publishing**| Interactive month/week scheduler with manual high-fidelity social export files | **Done** — real navigable month calendar (leap-year aware) and a real .zip export of attached media assets, replacing the fixed December 2026 grid and the alert-only "download simulated" button |
| **Phase 6** | **Tracking & CRM Leads** | Tracking short-links, WhatsApp clicks, QR codes, and lightweight lead pipelines | **Mostly done** — real short links (`tracking_links`/`tracking_link_clicks` + a genuine `/r/:code` server redirect that logs clicks) and real CRM lead creation. QR code generation not built. |
| **Phase 7** | **Social Providers** | Official provider integration (Meta, WhatsApp Business) using modular adapters | *Still not started* — no official Meta/WhatsApp Business API integration exists; publishing remains a manual "download compiled assets, upload yourself" workflow |
| **Phase 8** | **Directory & Creators** | Claimable business directory profiles and verified influencer marketplace catalog | **Done, but re-scoped admin-only** per the product pivot — real document upload on verification claims, real CRM lead on influencer outreach |
| **Phase 9** | **Events & Tourism** | Tourism packages, event ticketing links, conference calendars | **Partial** — promotion actions create real Content Studio drafts and real tracking links now, but the events/destinations themselves are still two hardcoded example entries each, not full CRUD |
| **Phase 10**| **Billing & Production**| Plan limits (Trial, Starter, Pro, Agency), manual billing invoice ledgers, audits | **Partial, by design** — manual bank-transfer request + admin-activation flow is real and intentional; no payment gateway is wired (see `procurement-expansion-assessment.md` for the reasoning) |

**Phase 11 onward** (the procurement/tender platform pivot, regional expansion, the Advertiser subscriber
tier, and the public landing page) is not phase-numbered here at all — it's the actual current product and
is tracked section-by-section in `docs/procurement-expansion-assessment.md`.

---

## Phase 0: Detailed Checklist

### 1. Project Infrastructure Configuration
- [x] Configure Tailwind CSS v4 and font styles.
- [x] Update `metadata.json` with descriptive product branding.
- [x] Establish typed environment validation patterns.

### 2. Backend Web Server Development
- [x] Create a robust `/server.ts` Express application.
- [x] Integrate Vite development middleware for instant dev cycles.
- [x] Set up standard static-file serving for production builds.
- [x] Implement the `/api/health` endpoint.

### 3. Frontend Component Layouts
- [x] Develop **Public Landing Page** with local marketing accents, client testimonials, features, and pricing tiers.
- [x] Develop **Authentication Layouts** with highly polished Sign-In, Sign-Up, and Onboarding forms.
- [x] Develop **Dashboard Layout** featuring a responsive, accessible side navigation panel, breadcrumbs, tenant selector, and main content panel.
- [x] Integrate modular navigation tabs for easy navigation across planned modules: Campaigns, Content Studio, Calendar, Media Library, Audiences, Social Accounts, Analytics, CRM Leads, Influencers, Directory, Events, and Tourism.

### 4. Verification & Testing
- [x] Implement validation and server health tests.
- [x] Ensure compilation builds succeed cleanly.
- [x] Run linting audits.
