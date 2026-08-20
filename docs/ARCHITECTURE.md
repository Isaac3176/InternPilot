# Architecture

InternPilot is **local-first *and* cloud-synced**. The same React/TypeScript frontend runs in
two shells:

- **Desktop** — a **Tauri 2** app (React webview + small Rust backend) with a local **SQLite**
  database and a companion browser extension.
- **Web / phone** — the same frontend built as a **PWA** (hosted on Vercel), backed by
  **Supabase** (Postgres + Auth).

Every user signs in through Supabase (an `AuthGate` wraps the whole app on all platforms), so
in practice the app usually runs in **cloud mode**. A single switch — `cloudMode()` in
[`src/db/index.ts`](../src/db/index.ts) — routes every `db/*` call to either Supabase or the
local SQLite plugin, and `isTauri()` in [`src/lib/env.ts`](../src/lib/env.ts) distinguishes the
desktop runtime from the browser.

```
                 ┌───────────────────── shared frontend (src/) ─────────────────────┐
                 │  React 19 + TypeScript · pages / components / feature modules      │
                 │                                                                    │
                 │   db/index.ts  ──cloudMode()?──►  Supabase (Postgres + Auth + RLS) │
                 │        │                                    ▲                       │
                 │        └──── else ────► SQLite (Tauri) ─────┘                       │
                 └────────────────────────────────────────────────────────────────────┘
                    ▲ desktop only                                   ▲ all platforms
        ┌───────────┴───────────┐                     ┌──────────────┴───────────────┐
        │  Tauri (src-tauri)    │                     │  Vercel PWA (web + phone)     │
        │  ├─ SQLite migrations │                     └───────────────────────────────┘
        │  ├─ plugins: sql,http,│
        │  │  opener,notification,oauth                External services (via lib/http):
        │  └─ bridge: tiny_http  ◄── Browser extension   OpenAI · Gmail · SimplifyJobs feed ·
        │     127.0.0.1:8765         (autofill + record) ATS boards (Greenhouse/Lever/Ashby/
        └────────────────────────                        SmartRecruiters/Workday)
```

## Frontend layout (`src/`)

**Screens & shell**
- `pages/` — every screen: Dashboard, Applications, **Diagnostics**, Internships (Discover),
  Watchlist, **Release Radar**, Packet, Queue (Fast Apply), Resume Center, Bullets, Toolkit,
  Networking, Interview Prep, **OA Lab**, **Prep Engine**, Experiences, Apply Assist, Emails,
  Profile, AI Chat, Settings, Focus Session.
- `components/` — reusable UI (modals, filter pills, company logo, milestone/outcome modal, OA
  simulation, the profile-form hook, auth gate / login / signup wizard). `components/sidebar/`
  holds the nav (`nav.ts` is the single source of truth for sidebar destinations).
- `mobile/` — the phone-optimized UI shell served to the LAN web app.

**Data & platform**
- `db/` — one typed module per table; each function branches on `cloudMode()` to hit Supabase
  or SQLite. `db/index.ts` also exports `blankToNull` / `numOrNull` coercion helpers (Postgres
  rejects `""` for typed columns; SQLite tolerated it).
- `cloud/` — the Supabase client (`supabase.ts`).
- `lib/` — `http` (fetch routed through the Rust HTTP plugin to bypass CORS on desktop),
  `env` (`isTauri`), `open` (external links), `notify`.
- `auth/` — local PBKDF2 accounts + session (desktop offline path).
- `bridge/` — pushes profile + token to the Rust bridge and listens for jobs the extension records.
- `gmail/` — desktop OAuth (loopback + PKCE) + read-only mail sync.

**Feature engines** (mostly pure logic — this is what the unit tests target)
- `listings/` — `service` (fetch + rank the SimplifyJobs feed), `description` (fetch a JD from
  Greenhouse / Lever / Ashby / SmartRecruiters or generic HTML), `match` (JD-vs-résumé keyword
  coverage), `eligibility` (work-authorization screening), `logo`, `notify`.
- `ranking/` — the personal opportunity-ranking engine: company watchlist + priority tiers,
  résumé tracks per company, prefs, queue recommendations.
- `release/` — **Release Radar**: `history` (forecast opening windows from past cycles),
  `radar` (assemble entries + cohort drift + self-learning), `ats` (live ATS clients &
  auto-discovery), `live` (poll watchlist boards for real postings), `alerts`, `missions`,
  `observed`.
- `diagnostics/` — **Recruiting Diagnostics**: `recruiting` (segmented funnel + rejection-timing
  histogram) and `questionAudit` (auto-screen detection from profile answers).
- `prep/` — the **Prep Engine**: `patterns` (the ~15 interview patterns + failure reasons),
  `engine` (pattern readiness + spaced repetition + the Today queue), `plan` (company OA
  countdown plan), `oaDiagnostics` (OA debrief analysis).
- `apply/` — `packet` (assemble everything to apply), `tailor` (rank your bullets against a JD),
  `answers` (reusable application answers).
- `networking/` — connection search/scoring, relationship graph, best-path.
- `actions/` — the Next-Best-Action engine feeding the dashboard.

## Data model

Created and evolved via Rust-side migrations in
[`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) (SQLite) and mirrored in
[`cloud/schema.sql`](../cloud/schema.sql) (Supabase, every table owner-scoped by Row-Level
Security). **These two must stay in parity** — a new column/table means editing both.

Tables (through migration v13):

| Table | Purpose |
|---|---|
| `companies`, `applications` | core tracker; `applications` carries the diagnostics signals (v11): `discovered_at`, `applied_at`, `posting_posted_at`, `match_score`, `eligibility`, `source`, `company_priority`, `furthest_stage`, `result_date` |
| `application_answers` (v11) | screening Q&A per application |
| `resume_versions`, `resume_bullets` | résumé variants + saved bullets |
| `interviews`, `interview_experiences` | OA/interview events + past-candidate reports |
| `oa_attempts` (v12) | OA debriefs (per-question JSON) — feed the Prep Engine |
| `coding_problems` (v13) | Prep Engine problem log (patterns/result/spaced-repetition JSON) |
| `contacts`, `referrals`, `contact_employment_history` (v10) | networking CRM + job-history graph |
| `emails`, `tasks`, `profile`/`profiles`, `accounts`, `user_settings` (cloud) | mail, reminders, autofill profile, local auth, cloud KV store |

## Cloud vs. local

`cloudMode()` returns true when a Supabase session exists (the usual case). The desktop keeps
SQLite for its offline path and the browser-extension bridge. The Supabase copy is protected by
**Row-Level Security** — the publishable *anon* key ships in the client; the `service_role` key
and DB password never leave your machine. See [../cloud/SETUP.md](../cloud/SETUP.md).

## The extension bridge

The Rust backend runs a tiny localhost HTTP server (`tiny_http`, port 8765, token-protected):

- `GET /profile` → autofill data (pushed from the frontend via `bridge_set_profile`).
- `POST /application` → relayed to the frontend, which records the application.
- `GET /ping` → health check.

Requests must send the shared token (`X-IP-Token`), so arbitrary web pages can't read your
profile off localhost. The same bridge serves the **LAN mobile web app**. See
[EXTENSION.md](EXTENSION.md).

## AI + offline fallbacks

Every AI feature degrades gracefully without an OpenAI key: résumé/JD matching use keyword
coverage, email classification uses keyword rules, prep/strategy/experience summaries use
templates. The app is fully usable offline and never blocks on the network.

## Testing

Pure-logic engines (`prep/`, `diagnostics/`, `listings/match` + `eligibility`, `apply/tailor`,
`release/live`) are covered by **Vitest** unit tests (`src/**/*.test.ts`). `npm test` runs them;
`.github/workflows/ci.yml` runs tests + type-check/build + a Rust `cargo check` on every push
and PR. See [DEVELOPMENT.md](DEVELOPMENT.md#testing).
