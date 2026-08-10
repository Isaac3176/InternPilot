# InternPilot AI

[![Download](https://img.shields.io/github/v/release/Isaac3176/InternPilot?label=Download&color=1F6FEB&sort=semver)](https://github.com/Isaac3176/InternPilot/releases/latest)
&nbsp;[![Web app](https://img.shields.io/badge/Web%20app-live-2EA043)](https://intern-pilot-seven.vercel.app)
&nbsp;[![License](https://img.shields.io/badge/status-beta-A9761C)](#)

**Your internship search — discovered, ranked, tracked, and half-applied for you.**
InternPilot finds internships, scores each one against your résumé, tells you the single
best thing to do next, autofills applications from a browser extension, and preps you for
OAs and interviews. Sign in and your data is the same across **desktop, web, and phone**.

## Get it — two ways

### 💻 Install the desktop app
The full experience, including **browser-extension autofill**.

**[⬇ Download for Windows](https://github.com/Isaac3176/InternPilot/releases/latest)** ·
**[macOS](https://github.com/Isaac3176/InternPilot/releases/latest)** ·
**[Linux](https://github.com/Isaac3176/InternPilot/releases/latest)**

> Pick the installer for your OS on the release page — Windows `.exe`/`.msi`, macOS `.dmg`,
> Linux `.AppImage`/`.deb`. It's an **unsigned beta**, so your OS warns on first launch
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

- **Deeper docs:** [Architecture](docs/ARCHITECTURE.md) · [Browser extension](docs/EXTENSION.md) · [Privacy](docs/PRIVACY.md) · [Development](docs/DEVELOPMENT.md) · [Cloud setup](cloud/SETUP.md)

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

**Applications & analytics**
- Application tracker (CRUD, search, status filters, résumé version, referral, notes).
- Dashboard: status funnel, weekly trend, conversion rates, résumé-version performance,
  referral rate, reminders + desktop notifications, and an on-demand **AI weekly strategy**.

**Résumé**
- Résumé Center: multiple targeted versions, **PDF/DOCX import**, and an AI résumé-to-job match.
- Bullet Library for saved AI-improved bullets.

**Networking (referral CRM)**
- Contacts + a full **referral pipeline** (potential → confirmed → applied) with proactive
  warnings (agreed-but-unconfirmed, no thank-you, overdue follow-up) and networking analytics
  (response/agreement/confirmed rates, OA/interview rate with vs. without a referral) — all
  labeled correlational with sample-size guards.

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
```

## Privacy

Local-first: your applications, résumés, contacts, emails, and profile live in a local SQLite
database. Text is sent to OpenAI only when you invoke an AI feature (with a key set), and to
Google only for read-only Gmail sync if you connect it. Full data-flow breakdown:
[docs/PRIVACY.md](docs/PRIVACY.md).

## Roadmap

- ✅ Tracking, dashboard, résumé matching, Gmail classification, interview prep, experience
  research, referral CRM, internship Discover feed, Apply Assist, autofill browser extension,
  JD-powered matching, local auth + onboarding.
- ⏳ **Next Best Action** engine (prioritized daily actions), **work-authorization eligibility
  screening**, and **security hardening** (move secrets to the OS keychain).
