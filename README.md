# InternPilot AI

[![Download](https://img.shields.io/github/v/release/Isaac3176/InternPilot?label=Download&color=1F6FEB&sort=semver)](https://github.com/Isaac3176/InternPilot/releases/latest)
&nbsp;[![Web app](https://img.shields.io/badge/Web%20app-live-2EA043)](https://intern-pilot-seven.vercel.app)
&nbsp;[![License](https://img.shields.io/badge/status-beta-A9761C)](#)

**Your internship search — discovered, ranked, tracked, diagnosed, and half-applied for you.**
InternPilot finds internships, scores each one against your résumé, tells you the single best
thing to do next, catches target companies the moment they post, autofills applications from a
browser extension, **diagnoses why applications stall**, and **trains your coding prep against
where you actually fail**. Sign in and your data is the same across **desktop, web, and phone**.

## Get it — two ways

### 💻 Install the desktop app
The full experience, including **browser-extension autofill**.

**[⬇ Download for Windows](https://github.com/Isaac3176/InternPilot/releases/latest/download/InternPilot-Setup.exe)** ·
**[macOS (Apple Silicon)](https://github.com/Isaac3176/InternPilot/releases/latest/download/InternPilot.dmg)** ·
**[Linux (AppImage)](https://github.com/Isaac3176/InternPilot/releases/latest/download/InternPilot.AppImage)**

> One click downloads the installer directly. Need a different format (`.msi`, `.deb`,
> `.rpm`, Intel Mac)? Grab it from **[all installers](https://github.com/Isaac3176/InternPilot/releases/latest)**.
> It's an **unsigned beta**, so your OS warns on first launch
> (Windows: *More info → Run anyway*; macOS: right-click → *Open*).

### 🌐 Use it in your browser — nothing to install
**[Open the web app → intern-pilot-seven.vercel.app](https://intern-pilot-seven.vercel.app)**
Sign in and go — on iPhone, tap **Share → Add to Home Screen** for a full-screen app icon.

_Same account, same data everywhere. The desktop app is where the autofill extension runs;
the web/phone app browses, queues, and tracks._

## Screenshots

<details open>
<summary>Fast Apply · Discover · Application packet</summary>

<p>
  <img src="docs/screenshots/fast-apply.png" alt="Fast Apply queue" width="32%">
  <img src="docs/screenshots/discover.png" alt="Discover feed" width="32%">
  <img src="docs/screenshots/packet.png" alt="Application packet" width="32%">
</p>
</details>

> _Add PNGs to `docs/screenshots/` with those names — see the folder's README._

Built with **Tauri 2 + React 19 + TypeScript** on the desktop and **Supabase** (Postgres +
auth) in the cloud, with **OpenAI** powering the AI features (each has an offline fallback).

- **Deeper docs:** [Features guide](docs/FEATURES.md) · [Architecture](docs/ARCHITECTURE.md) · [Development](docs/DEVELOPMENT.md) · [Browser extension](docs/EXTENSION.md) · [Cloud setup](cloud/SETUP.md) · [Privacy](docs/PRIVACY.md) · [Changelog](CHANGELOG.md)
- **Shipping to users:** [Production checklist](docs/PRODUCTION.md) · [Privacy Policy (draft)](docs/PRIVACY-POLICY.md) · [Terms of Service (draft)](docs/TERMS.md)

## Features

**Onboarding & account**
- Local login (passwords hashed on-device with PBKDF2) and a **Simplify-style signup wizard**:
  upload your résumé → it's **parsed and autofills** your profile → set your target roles and
  goal date → fill the rest (personal, links, education, work authorization, EEO).

**Discover internships**
- A three-pane job browser: a filterable results list, a detail pane with the **real job
  description** (fetched from Greenhouse / Lever / SmartRecruiters / Ashby), and a right rail.
- Listings come from a public feed (SimplifyJobs) and are **ranked to your profile** — courses,
  bootcamps, tutoring and talent-pools are filtered out; any engineering internship matches a
  software-engineer's search.
- **Readiness gauge + skill preflight**: once a description loads, it scores keyword coverage
  against your résumé and shows matched / missing skills ("X of Y found").
- One click to **Save** to your tracker or **Apply with autofill**.

**Release Radar & live openings**
- A **watchlist** of target companies with priority tiers (instant / high / normal / muted).
- **Release Radar** forecasts each company's likely opening window from past cycles
  (recency-weighted, cohort-drift-corrected, with a measured-accuracy backtest) and gives you a
  **"reach out by" date** so you network before the rush.
- **Live ATS detection**: polls your watchlist companies' real job boards
  (Greenhouse / Lever / Ashby / SmartRecruiters / Workday) and surfaces **actual just-posted**
  internships — on the Radar, on Home, and via desktop notification — with a direct apply link.

**Applications, tracker & diagnostics**
- Application tracker (CRUD, search, status filters, inline status change, résumé version,
  referral, notes) with **milestone "Outcome moments"** on every status change (OA → interview →
  offer, plus honest neutral screens for rejections and auto-detected ghosting).
- Dashboard: status funnel, weekly trend, conversion rates, reminders + desktop notifications,
  live openings, a diagnostic nudge, and an on-demand **AI weekly strategy**.
- **Recruiting Diagnostics**: a segmented funnel (by résumé / apply-timing / referral) and a
  **rejection-timing histogram** (a cluster in the first hour flags an automated eligibility
  screen), plus a **question audit** that reconstructs your screening answers and points at what
  likely auto-filters you — all sample-size-gated and worded as correlation, never proof.

**Résumé**
- Résumé Center: multiple targeted versions, **PDF/DOCX import**, and an AI résumé-to-job match.
- Bullet Library for saved AI-improved bullets.

**Networking (referral CRM)**
- Contacts + a full **referral pipeline** (potential → confirmed → applied) with proactive
  warnings (agreed-but-unconfirmed, no thank-you, overdue follow-up) and networking analytics
  (response/agreement/confirmed rates, OA/interview rate with vs. without a referral) — all
  labeled correlational with sample-size guards.

**Coding prep — the Prep Engine**
- Tracks **interview readiness by pattern + performance**, not "problems solved." ~15 patterns
  (Arrays, Graphs, DP, Simulation…) each get a readiness score from a weighted blend of
  independent-solve rate, timed performance, retention, difficulty, and recency.
- A **Today queue** tells you exactly what to practice, with **adaptive difficulty** and
  **spaced repetition** (fail → re-solve tomorrow → 7 days → 30 days).
- **OA Lab**: debrief each online assessment; it diagnoses the pattern (e.g. time management —
  "67% of the clock on one unsolved problem") and prescribes training.
- **OA Simulation Mode**: a timed, multi-question run with per-question clocks and a move-on
  nudge — built to fix the "sank the whole clock into one problem" failure.
- **Company OA countdown plan**: when an OA is scheduled, a day-by-day plan weighted to that
  company's own history. OAs feed the *same* readiness scores — one system, not two universes.

**Interviews & research**
- Interview Prep: track OA/interview events and generate company-specific prep plans.
- Interview Experiences: collect reports and synthesize per-company prep guidance with AI.

**Email (optional)**
- Connect Gmail (read-only OAuth) and sync job-related mail, or paste emails; each is
  AI-classified (confirmation / rejection / OA / interview / recruiter / offer) with a
  **review-before-update** step before any status change.

**Apply Assist & Chat**
- Apply Assist: Safe-Mode prep (best résumé, AI-drafted short answers, checklist, open posting).
- AI Chat grounded in your stored data.

**Browser extension**
- A companion Chrome/Edge extension that **autofills applications from your profile** and
  **records them into your tracker** — see setup below.

## Browser extension setup

The extension talks to the app over a local, token-protected bridge, so **keep the app
running** while you apply. Full guide: [docs/EXTENSION.md](docs/EXTENSION.md).

1. In the app, open **Settings → Browser extension** and copy your **token**.
2. In Chrome/Edge go to `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select this repo's **[`extension/`](extension/)** folder.
3. Click the InternPilot extension → **Connection settings** → paste the **token**
   (port stays `8765`) → **Save**. It should show **"Connected ✓"**.

**Using it:** on an application page, click the extension → **Autofill this page** (review
everything — it never submits for you), then **Save to InternPilot** to record the job in
your Applications list.

## Build from source

Full prerequisites, commands, release process, and proxy/TLS notes are in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

```bash
npm install
npm run tauri dev      # run the desktop app in dev mode
npm run tauri build    # produce an installer bundle
npm test               # run the unit suite
npm run check          # tests + build — the gate CI enforces
```

Tests (Vitest) and a type-check/build run in CI on every push and PR
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Privacy

Local-first: your applications, résumés, contacts, emails, and profile live in a local SQLite
database. Text is sent to OpenAI only when you invoke an AI feature (with a key set), and to
Google only for read-only Gmail sync if you connect it. Full data-flow breakdown:
[docs/PRIVACY.md](docs/PRIVACY.md).

## Roadmap

- ✅ **Shipped:** Discover feed + personal ranking, tracker + Outcome moments, dashboard +
  Next-Best-Action engine, AI weekly strategy, résumé matching & per-job tailoring, referral
  CRM, Gmail classification, Apply Assist + autofill extension, work-authorization eligibility
  screening, cloud sync (Supabase) + web/phone PWA, **Release Radar + live ATS detection**,
  **Recruiting Diagnostics** (funnel + rejection-timing + question audit), **Prep Engine**
  (pattern readiness, spaced repetition, OA Lab, OA Simulation, company countdown plans),
  unit tests + CI.
- ⏳ **Next:** deeper component/integration test coverage, **security hardening** (secrets to the
  OS keychain), and more live-ATS company coverage (Workday is currently a curated, desktop-first
  set).
