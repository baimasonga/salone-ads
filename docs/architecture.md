# SaloneReach Architecture Document

## 1. System Topology
The application is structured as a full-stack Node.js deployment, combining a modern **React client SPA** with a secure **Express.js API proxy server** in a unified repository. This layout completely eliminates CORS configuration overhead and allows us to securely execute Gemini AI completions and other third-party services entirely on the server side, keeping sensitive keys protected from browser inspection.

```
+-------------------------------------------------------------+
|                     SaloneReach Workspace                   |
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
For Phase 0, multi-tenant state and organization scoping are simulated and validated client-side via React state and LocalStorage, enabling offline durability and resilient workflows without immediate DB setup dependencies. In future phases, these objects align directly with database entities:
*   `Profile`: Individual user credentials, names, emails, and preferences.
*   `Organization`: Multi-tenant containers representing small businesses, diaspora associations, NGOs, and creator collectives.
*   `Campaign`: Planning cards connecting budget targets, goals, audience criteria, and draft content schedules.

## 5. Security Principles
*   **Server-Side AI Proxies:** The client never imports or communicates directly with `@google/genai`. All AI prompts pass through custom `/api/*` endpoints validating payload schema first.
*   **Sensitive Environment Variables:** Sensitive API keys such as `GEMINI_API_KEY` are read exclusively in Node.js runtime and are never compiled into browser asset bundles.
*   **Frame Safety:** No browser popups or unsafe window bindings; the app communicates and adapts entirely within standard iFrame parent containers.
