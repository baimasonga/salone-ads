# Manohub Architecture Document

## 1. System Topology
The application is structured as a full-stack Node.js deployment, combining a modern **React client SPA** with a secure **Express.js API proxy server** in a unified repository. This layout completely eliminates CORS configuration overhead and allows us to securely execute Gemini AI completions and other third-party services entirely on the server side, keeping sensitive keys protected from browser inspection.

```
+-------------------------------------------------------------+
|                     Manohub Workspace                   |
|                                                             |
|   +--------------------------+  HTTP Requests  +---------+  |
|   |   React Single-Page App  |===============>| Express |  |
|   |  - Tailwind v4 styling   |                |  Server |  |
|   |  - Lucide icons          |                |  - API  |  |
|   |  - Responsive views      |<===============|  - HTML |  |
|   +--------------------------+  HTML / Assets  +---------+  |
|                                                     ||      |
|                                                     ||      |
|                                                     \/      |
|                                              +-------------+|
|                                              | Gemini AI   ||
|                                              | SDK Server  ||
|                                              +-------------+|
+-------------------------------------------------------------+
```

## 2. Technology Stack & Packages
*   **Frontend SPA Framework:** React 19 + TypeScript
*   **Dev Engine:** Vite 6 with `@tailwindcss/vite` (Tailwind CSS v4)
*   **Production Bundler:** Esbuild (compiling `server.ts` to standard CJS `dist/server.cjs`)
*   **Web Server Engine:** Express 4.x
*   **Animation Engine:** `motion` (by Framer)
*   **Icons:** `lucide-react`
*   **AI Integration:** `@google/genai` (v2.4.0)

## 3. Directory Layout (React + Express Hybrid)
The layout maps logical concerns into distinct directories:
*   `/src/App.tsx`: Main entry React component housing our client-side routing, view state, layout wrappers, and dashboard dashboards.
*   `/src/components/`: Modular presentation components (cards, forms, skeletons, directory profiles, sidebar, and headers).
*   `/src/main.tsx`: Client-side mounting script.
*   `/src/index.css`: Tailwind CSS v4 styling entry point.
*   `/server.ts`: Full-stack Express.js server entry point managing request-routing, the static asset pipeline, `/api/health`, and AI completions.
*   `/docs/`: High-level architecture, PRD, and development roadmaps.

## 4. Multi-Tenancy & Data Architecture
Multi-tenant state and organization scoping are backed by Supabase Postgres, with tenancy enforced by Row Level Security rather than client-side trust. Core entities:
*   `profiles`: One row per Supabase Auth user (full name, email), auto-created on signup via a database trigger.
*   `organizations` / `organization_members`: Multi-tenant containers representing small businesses, diaspora associations, NGOs, and creator collectives, with a membership join table (`owner` / `admin` / `member` roles) gating access. New organizations are created via the `create_organization` RPC, which also seeds a starter brand kit, campaigns, content items, leads, and social connections.
*   `campaigns`, `content_items`, `leads`, `brand_kits`, `social_connections`: Org-scoped tables — every RLS policy checks membership via an `is_org_member(org_id)` helper function.
*   `directory_profiles`, `influencer_profiles`: Shared, platform-wide marketplace tables readable by any authenticated user; directory listings can be "claimed" by an organization.

## 5. Security Principles
*   **Server-Side AI Proxies:** The client never imports or communicates directly with `@google/genai`. All AI prompts pass through a custom `/api/gemini/generate` endpoint that requires a valid Supabase session (Bearer token, verified server-side), rate-limits requests per user, and validates payload size before calling the model.
*   **Row Level Security:** All tenant data is isolated at the database layer via Postgres RLS policies, not just client-side checks — a stolen client token can never read another organization's data.
*   **Sensitive Environment Variables:** Sensitive API keys such as `GEMINI_API_KEY` are read exclusively in Node.js runtime and are never compiled into browser asset bundles. The Supabase URL and anon/publishable key are safe to expose to the browser by design — RLS is the actual access-control boundary.
*   **Frame Safety:** No browser popups or unsafe window bindings; the app communicates and adapts entirely within standard iFrame parent containers.
