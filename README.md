# Manohub - Digital Growth Platform for Sierra Leone

Manohub is a high-performance, mobile-first digital growth and advertising platform engineered specifically for Sierra Leonean businesses, local creators, and diaspora sponsors.

The platform bridges the gap between Sierra Leone's domestic economy (such as parboiled native rice cooperatives, local concerts, and verified business registries) and the affluent diaspora communities across the United Kingdom, United States, and Canada.

---

## 🚀 Phase 0: Foundation Architecture

This repository holds the fully compiled, linted, and production-ready **Phase 0 Foundation** of Manohub. It is constructed as a secure, full-stack, unified Node.js application (React 19 SPA + Express proxy container) to address CORS limitations, avoid client-side API key exposures, and perform seamless local operations.

### Key Capabilities Installed
1. **Landing Portal**: Custom high-contrast layout incorporating our **Emerald Sky** design ethos, targeting localized conversion.
2. **Onboarding & Auth Flow**: Captures organization profiles, district parameters, diaspora target locations, and primary objectives.
3. **17 Interactive Sandbox Workspaces**:
   - **Overview**: Real-time Greenwich Mean Time (GMT) sync (Freetown time), growth trackers, and custom action cards.
   - **Campaigns**: Interactive budget planner and district-targeted campaign builder.
   - **Content Studio**: Live text editors paired with our secure server-side Gemini AI completions assistant.
   - **Calendar**: Publishing grids with responsive modal exports.
   - **Media Library**: Bandwidth-saving options (optimizing data usage) with interactive upload simulations.
   - **Audiences**: Geographic interest estimators matching Sierra Leone districts and international diaspora markets.
   - **Social Accounts**: Platform status trackers.
   - **Analytics**: High-contrast performance charts.
   - **CRM Leads**: Lightweight pipeline grid for managing WhatsApp queries.
   - **Influencers**: Marketplace directory cataloging verified Sierra Leonean creators.
   - **Business Directory**: Verified registries with document-claim sub-panels.
   - **Event Promotion**: Ticket/concert targeting structures.
   - **Tourism**: Heritage Bunce Island and Banana Island homecoming planners.
   - **Brand Kit**: Color palette trackers and voice profiles feeding directly into AI prompts.
   - **Team Roles**: Secure colleague invitations.
   - **Billing Invoices**: Bank transfer receipt trackers.
   - **Super Admin Safety Board**: Moderation and listing scans.

---

## 🛠️ Tech Stack & Dependencies

- **Frontend**: React 19, TypeScript (Strict Mode), Vite 6, Tailwind CSS v4, Lucide Icons, Framer Motion.
- **Backend**: Node.js Express Server proxy, Vite dev middleware integration.
- **Database & Auth**: Supabase (Postgres with Row Level Security, email/password auth, multi-tenant organizations).
- **AI Engine**: `@google/genai` (v2.4.0) SDK communicating through a secure, authenticated, rate-limited backend route.

---

## ⚙️ Local Development Instructions

### 1. Environment Configuration
Create a `.env` file in the root directory (based on `.env.example`):
```env
GEMINI_API_KEY="YOUR_OFFICIAL_GEMINI_API_KEY"
APP_URL="http://localhost:3000"
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Launch Development Server
```bash
npm run dev
```
The server will start on port **3000** (fully bound to `0.0.0.0` for safe container routing).

### 4. Build for Production
To bundle the frontend assets and compile the backend server code into a self-contained CommonJS file:
```bash
npm run build
```

### 5. Launch Production Server
```bash
npm run start
```

---

## 📁 System Code Directory

```text
/
├── .env.example               # Environment variables specification blueprint
├── .github/workflows/ci.yml   # Automated GitHub Actions workflow checks
├── server.ts                  # Secure Express gateway with Gemini API proxies
├── tsconfig.json              # Strict compiler definitions
├── package.json               # Script and dependency packages index
├── index.html                 # Core HTML entry
└── src/
    ├── App.tsx                # Main Router, Sidebar container & Client State Engine
    ├── index.css              # Font declarations & Tailwind v4 configurations
    ├── main.tsx               # Frontend bootstrap entry
    ├── types.ts               # Domain types (Campaign, Lead, Directory, etc.)
    ├── lib/
    │   ├── supabaseClient.ts  # Supabase client (browser)
    │   └── api.ts             # Typed Supabase queries/mutations, DB <-> app type mapping
    └── components/
        ├── LandingPage.tsx    # High-converting homepage
        ├── AuthScreens.tsx    # Auth forms, logins, and onboarding
        └── Workspaces.tsx     # The 17 operational workspaces and sub-panels
```

---

## 🔒 Security & Performance Design
- **API Protection**: No Gemini keys are ever exposed to client bundle downloads. All prompts are proxied through a secure, authenticated, rate-limited Express gateway (`/api/gemini/generate`) that requires a valid Supabase session.
- **Multi-Tenant Data Isolation**: All organization data (campaigns, content, leads, brand kit, social connections) lives in Postgres behind Supabase Row Level Security — a user can only read or write rows belonging to organizations they are a member of.
- **Low-Bandwidth Optimizations**: Toggleable media placeholders and compressed payload pipelines ensure fluid operation over domestic 3G/4G connections.
- **Strict Accessibility**: Designed with deep charcoal text elements and pure emerald accents to exceed AAA contrast criteria.
