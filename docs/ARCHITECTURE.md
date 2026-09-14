# InternPilot Architecture

This document explains how InternPilot works today: what runs in the browser,
what runs in the desktop app, where data is stored, and how the major features
talk to each other.

InternPilot has one shared React app with multiple shells:

- **Web app / PWA:** hosted on Vercel at `internpilotapp.live`.
- **Desktop app:** a Tauri 2 wrapper around the same React app, distributed from
  GitHub Releases.
- **Mobile web view:** the same Vercel web app can be installed as a PWA. The
  desktop app also serves a small LAN mobile companion page from its local bridge.
- **Browser extension:** an unpacked Chrome/Edge extension that talks only to
  the desktop app over `localhost`.

Supabase is the production cloud backend. The desktop app also keeps a local
SQLite path for offline/local operation and for desktop-only integrations.

## Big Picture

```mermaid
flowchart TB
  user[User] --> web[Web/PWA<br/>internpilotapp.live]
  user --> desktop[Tauri desktop app<br/>Windows/macOS/Linux]
  user --> ext[Chrome/Edge extension]
  user --> phone[Phone browser/PWA]

  web --> react[Shared React + TypeScript app<br/>src/]
  desktop --> react
  phone --> react

  react --> auth[AuthGate<br/>Supabase session or demo session]
  auth --> dbLayer[Data modules<br/>src/db/*]

  dbLayer -->|signed-in cloud mode| supabase[(Supabase<br/>Auth + Postgres + RLS)]
  dbLayer -->|desktop/local fallback| sqlite[(SQLite<br/>internpilot.db)]
  dbLayer -->|demo/e2e| localStorage[(localStorage demo data)]

  desktop --> rust[Tauri Rust backend<br/>src-tauri/]
  rust --> sqlite
  rust --> bridge[Local bridge<br/>0.0.0.0:8765-8768]
  ext -->|X-IP-Token| bridge
  bridge --> react

  react --> feeds[Public job feeds + ATS boards<br/>SimplifyJobs, Greenhouse, Lever,<br/>Ashby, SmartRecruiters, Workday]
  react --> ai[OpenAI API<br/>optional client-side key today]
  react --> gmail[Gmail API<br/>gated in production web]

  github[GitHub Actions] --> vercel[Vercel build/deploy]
  github --> releases[GitHub Releases<br/>Tauri installers]
```

## What Is Hosted Where?

| Piece | Where it lives | What it does |
| --- | --- | --- |
| Web app | Vercel, custom domain `internpilotapp.live` | Runs the React/Vite frontend as a PWA. Uses Supabase for auth and data. |
| Cloud backend | Supabase | Email/password auth, password reset, Postgres database, Row-Level Security. Auth emails are sent through Supabase SMTP configuration. |
| Desktop app | GitHub Releases installers built by Tauri | Runs the same React app in a native webview, plus Rust plugins for SQLite, HTTP, notifications, OAuth, opener, and the local bridge. |
| Browser extension | `extension/`, installed unpacked during beta | Autofills applications and records jobs by talking to the desktop bridge. |
| CI | GitHub Actions | Runs frontend tests/build/e2e and Rust compile checks. |
| Static legal pages | `public/privacy.html`, `public/terms.html` | Served by the web build and linked from auth/settings screens. |

## Runtime Modes

The same UI can run in four useful modes:

```mermaid
flowchart LR
  start[App starts] --> authGate[AuthGate]
  authGate --> demo{Demo session?}
  demo -->|yes| demoMode[Demo/e2e mode<br/>localStorage fixtures]
  demo -->|no| session{Supabase session?}
  session -->|yes| cloudMode[Cloud mode<br/>Supabase db tables]
  session -->|no| login[Cloud login/signup/reset]
  cloudMode --> platform{Running inside Tauri?}
  platform -->|yes| desktopExtras[Desktop extras:<br/>SQLite fallback, notifications,<br/>extension bridge, LAN mobile bridge]
  platform -->|no| webOnly[Browser/PWA:<br/>native fetch + Supabase]
```

Important files:

- [src/main.tsx](../src/main.tsx): creates the router, wraps the app in
  `ErrorBoundary` and `AuthGate`, and lazy-loads pages.
- [src/App.tsx](../src/App.tsx): renders the shell/sidebar, starts desktop-only
  tasks, and switches to the phone UI when appropriate.
- [src/components/AuthGate.tsx](../src/components/AuthGate.tsx): gates the app
  behind Supabase auth, demo mode, onboarding, and password recovery.
- [src/cloud/supabase.ts](../src/cloud/supabase.ts): creates the Supabase client
  and exposes `cloudMode()`.
- [src/lib/env.ts](../src/lib/env.ts): detects the Tauri desktop runtime.
- [src/demo/session.ts](../src/demo/session.ts): creates the demo workspace.

## Data Storage

InternPilot has three storage paths. Production users normally use Supabase.

```mermaid
flowchart TB
  ui[React page/component] --> module[src/db module<br/>applications, profile, resumes, etc.]
  module --> branch{Which mode?}

  branch -->|E2E_SMOKE or demo| ls[localStorage<br/>fixture data]
  branch -->|cloudMode() true| sb[Supabase table]
  branch -->|cloudMode() false| sql[SQLite via Tauri SQL plugin]

  sb --> rls[Row-Level Security<br/>user_id = auth.uid()]
  sql --> migrations[Rust migrations<br/>src-tauri/src/lib.rs]
```

### Supabase Cloud Data

Supabase is defined by [cloud/schema.sql](../cloud/schema.sql).

Key rules:

- Every user-owned table has a `user_id` column.
- Row-Level Security is enabled for every table.
- The main policy is `own_rows`: users can only read/write rows where
  `user_id = auth.uid()`.
- Extra trigger checks prevent cross-account foreign-key links.
- The client ships only the publishable anon key. RLS is the data boundary.

### Local SQLite Data

SQLite migrations live in [src-tauri/src/lib.rs](../src-tauri/src/lib.rs).

The local database is named `internpilot.db` and is accessed through
`@tauri-apps/plugin-sql`. It supports the desktop/local path and gives the
desktop app a place to run if no cloud session is active.

When changing the schema, update both places:

1. Add a new SQLite migration in `src-tauri/src/lib.rs`.
2. Mirror it in `cloud/schema.sql`.
3. Add the table to the RLS loop if it is user-owned.
4. Update the matching `src/db/*` module.

## Main Frontend Structure

```mermaid
flowchart TB
  main[src/main.tsx] --> app[src/App.tsx]
  main --> routes[React Router routes]
  routes --> pages[src/pages/*]
  pages --> components[src/components/*]
  pages --> engines[Feature engines]
  pages --> db[src/db/*]

  engines --> listings[src/listings/*]
  engines --> ranking[src/ranking/*]
  engines --> release[src/release/*]
  engines --> diagnostics[src/diagnostics/*]
  engines --> prep[src/prep/*]
  engines --> apply[src/apply/*]
  engines --> networking[src/networking/*]
  engines --> ai[src/ai/*]
```

### Page Layer

`src/pages/` contains the main screens:

- `Queue.tsx`: Fast Apply queue.
- `Internships.tsx`: Browse/discover jobs.
- `Watchlist.tsx`: target companies and priority tiers.
- `ReleaseRadar.tsx`: opening-window forecasts and live openings.
- `Dashboard.tsx`: funnel, strategy, reminders, recent activity.
- `Applications.tsx`: application tracker.
- `Profile.tsx`: user profile used for matching and autofill.
- `ResumeCenter.tsx`, `ResumeLab.tsx`, `Bullets.tsx`: resume workflows.
- `Networking.tsx`: contacts and referrals.
- `Diagnostics.tsx`: recruiting funnel diagnostics.
- `PrepEngine.tsx`, `OALab.tsx`, `InterviewPrep.tsx`: coding/OA/interview prep.
- `Settings.tsx`: account, legal links, extension settings, feature settings.

### Feature Logic

The heavier logic lives outside React components so it can be tested:

| Folder | Responsibility |
| --- | --- |
| `src/listings/` | Fetch/parse/rank job listings, read job descriptions, logos, eligibility, readiness matching. |
| `src/ranking/` | Watchlist, queue scoring, resume tracks, user feedback/preferences. |
| `src/release/` | Release Radar, historical forecasting, live ATS detection, alerts, missions. |
| `src/diagnostics/` | Recruiting funnel analysis and screening-question audit. |
| `src/prep/` | Coding pattern readiness, spaced repetition, OA diagnostics, company prep plans. |
| `src/apply/` | Application packets, answer vault, resume bullet tailoring. |
| `src/networking/` | Contact graph and best-path/referral scoring. |
| `src/ai/` | OpenAI-powered helpers with non-AI fallbacks. |

## Job Search Flow

```mermaid
sequenceDiagram
  participant User
  participant UI as Internships page
  participant Profile as Profile/resumes
  participant Listings as src/listings/service
  participant Feed as SimplifyJobs feed
  participant ATS as ATS/job pages
  participant DB as Supabase or SQLite

  User->>UI: Open Browse
  UI->>Profile: Read target roles, locations, work auth, resumes
  UI->>Listings: Request personalized listings
  Listings->>Feed: Fetch public internship feed
  Listings->>Listings: Filter by profile targets and intern relevance
  Listings->>Listings: Score role fit, season, eligibility, freshness
  UI->>ATS: Fetch selected job description when needed
  UI->>Listings: Match JD against resume skills
  User->>UI: Save/apply/prepare
  UI->>DB: Create or update application rows
```

The profile is not just display data. It affects:

- Job family filters.
- Internship/new-grad level filters.
- Season/year filters.
- Location and remote preferences.
- Work-authorization eligibility estimates.
- Resume/readiness matching.
- Autofill values sent to the extension bridge.

## Desktop Extension Bridge

The browser extension only works with the desktop app running.

```mermaid
flowchart LR
  react[React desktop app] -->|Tauri commands| rust[Rust bridge state]
  rust --> server[tiny_http server<br/>0.0.0.0:8765-8768]
  ext[Browser extension] -->|GET /ping| server
  ext -->|GET /profile<br/>X-IP-Token, loopback only| server
  ext -->|GET /answers<br/>X-IP-Token, loopback only| server
  ext -->|POST /application<br/>X-IP-Token, loopback only| server
  server -->|bridge://application event| react
  phone[LAN mobile page] -->|GET /data<br/>X-IP-Token| server
  phone -->|POST /action<br/>X-IP-Token| server
```

Bridge details:

- Implemented in [src-tauri/src/lib.rs](../src-tauri/src/lib.rs).
- The server tries ports `8765` through `8768`.
- `/profile`, `/answers`, `/application`, and `/email` are loopback-only because
  they contain full autofill or mail data.
- `/data` and `/action` support the LAN mobile companion and require the token.
- The token is a 32-character hex string and is compared in constant time.
- Frontend bridge helpers live in [src/bridge/](../src/bridge/) and
  [src/mobile/sync.ts](../src/mobile/sync.ts).

## External Service Flow

```mermaid
flowchart TB
  app[React app] --> http[src/lib/http.ts]
  http -->|desktop/Tauri| tauriHttp[Tauri HTTP plugin<br/>bypasses webview CORS]
  http -->|web/PWA| browserFetch[Browser fetch<br/>must obey CORS]

  tauriHttp --> openai[OpenAI]
  tauriHttp --> gmail[Gmail APIs]
  tauriHttp --> feed[Public job feeds]
  tauriHttp --> ats[ATS boards]

  browserFetch --> feed
  browserFetch --> ats
  browserFetch -. CORS/proxy needed .-> openai
  browserFetch -. production-gated .-> gmail
```

Current external services:

- **Supabase:** auth, database, password reset, email confirmation.
- **Vercel:** web/PWA hosting and SPA rewrites.
- **Resend or other SMTP provider:** configured inside Supabase for auth emails.
- **OpenAI:** optional AI features. Today the app supports user-provided keys in
  client storage; moving AI calls server-side is a production hardening item.
- **Gmail API:** optional read-only sync. Production web builds hide/disable it
  unless `VITE_ENABLE_GMAIL_SYNC=1` is set.
- **Job sources / ATS boards:** SimplifyJobs feed and job boards such as
  Greenhouse, Lever, Ashby, SmartRecruiters, and curated Workday URLs.

## Authentication Flow

```mermaid
sequenceDiagram
  participant User
  participant Auth as CloudLogin/AuthGate
  participant Turnstile as Cloudflare Turnstile
  participant Supabase
  participant App

  User->>Auth: Sign up / sign in / forgot password
  alt Turnstile site key configured
    Auth->>Turnstile: Render challenge
    Turnstile-->>Auth: CAPTCHA token
  end
  Auth->>Supabase: Auth request + optional captchaToken
  Supabase-->>Auth: Session or confirmation/reset email
  Auth->>App: Set cloud session user id
  App->>Supabase: Read/write RLS-scoped rows
```

Password reset redirect behavior:

- Browser/web: redirects back to the current origin.
- Desktop/Tauri: falls back to `https://internpilotapp.live`, because a normal
  email client cannot open a `tauri://` recovery URL.

## Deployment And Release Flow

```mermaid
flowchart LR
  dev[Developer pushes to GitHub] --> ci[CI workflow]
  ci --> tests[npm test<br/>npm run build<br/>Playwright e2e]
  ci --> rust[cargo check]

  dev --> vercel[Vercel production deploy<br/>Vite dist/]
  vercel --> domain[internpilotapp.live]

  tag[Push v* tag] --> release[release.yml]
  release --> tauri[Tauri builds<br/>Windows/macOS/Linux]
  tauri --> gh[Draft GitHub Release<br/>stable installer filenames]
```

Important files:

- [.github/workflows/ci.yml](../.github/workflows/ci.yml): tests, build, e2e,
  Rust compile check. Uses Node 22.
- [.github/workflows/release.yml](../.github/workflows/release.yml): Tauri
  installer builds from `v*` tags.
- [vercel.json](../vercel.json): Vite build command, `dist` output directory,
  and SPA rewrite to `index.html`.
- [vite.config.ts](../vite.config.ts): fixed dev port `1420`, Tauri-friendly
  dev server, vendor chunk splitting.
- [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json): desktop window,
  bundle targets, and Tauri frontend build hooks.

## Environment Variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Web/desktop frontend | Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Web/desktop frontend | Public Supabase anon key. Safe to ship when RLS is correct. |
| `VITE_SUPABASE_KEY` | Web/desktop frontend | Legacy fallback for the anon key. Prefer `VITE_SUPABASE_ANON_KEY`. |
| `VITE_TURNSTILE_SITE_KEY` | Auth UI | Enables Cloudflare Turnstile on sign-in, sign-up, and password reset. |
| `VITE_ENABLE_GMAIL_SYNC=1` | Web production | Explicitly enables Gmail sync in production web builds. |
| `VITE_E2E_SMOKE=1` | Tests/e2e | Forces localStorage-backed smoke-test mode. |
| `TAURI_DEV_HOST` | Tauri dev | Allows testing from a device on the LAN. |

Do not put Supabase `service_role`, database passwords, Google client secrets,
SMTP passwords, or OpenAI admin keys in client-side Vite variables.

## Security Boundaries

```mermaid
flowchart TB
  anon[Client ships anon key] --> rls[RLS policies in cloud/schema.sql]
  rls --> own[Only own rows visible]

  smtp[SMTP password] --> supabaseOnly[Stored in Supabase dashboard only]
  serviceRole[service_role key] --> neverClient[Never shipped to browser/app]

  ext[Extension] --> token[Local bridge token]
  token --> loopback[PII routes require loopback]

  ai[User OpenAI key today] --> risk[Client storage risk]
  risk --> future[Recommended future:<br/>server-side AI proxy]
```

Production-sensitive areas:

- Supabase RLS is mandatory because the anon key is public.
- Auth email confirmation, CAPTCHA, SMTP, and rate limits are ops requirements
  before broad public release.
- Gmail sync is restricted-scope OAuth and should stay gated until verification.
- OpenAI calls should eventually move behind a server-side proxy.
- Desktop installers are currently unsigned unless code signing/notarization is
  configured.

## How To Add A Feature Safely

1. Put UI in `src/pages` or `src/components`.
2. Put reusable logic in a feature folder (`listings`, `ranking`, `prep`, etc.).
3. Put persistence in a typed `src/db/*` module.
4. If schema changes are needed, update both SQLite migrations and
   `cloud/schema.sql`.
5. Add or update pure-function tests where possible.
6. Run:

```bash
npm run typecheck
npm test
npm run build
```

For desktop-affecting changes, also run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## Quick Mental Model

```text
React pages are the product.
Feature folders are the brains.
src/db is the only place pages should persist data.
Supabase is production cloud storage.
SQLite is desktop/local storage.
Tauri Rust is the native bridge and desktop capability layer.
The extension never talks to Supabase directly; it talks to the desktop bridge.
Vercel hosts the web app; GitHub Releases ship the desktop app.
```
