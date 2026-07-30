# InternPilot AI

A local-first **desktop career assistant** for software-engineering internship hunting.
InternPilot discovers internships, tailors your résumé, tracks every application, manages
referrals, prepares you for OAs and interviews, and can **autofill applications from a
browser extension** — all grounded in your own data, stored on your device.

Built with **Tauri 2 + React 19 + TypeScript + SQLite**, with **OpenAI** powering the AI
features (every AI feature has an offline fallback, so the app is usable without a key).

**Status: Beta** — actively developed, usable locally, not yet independently tested at scale.

- **Repo:** https://github.com/Isaac3176/InternPilot
- **Deeper docs:** [Architecture](docs/ARCHITECTURE.md) · [Browser extension](docs/EXTENSION.md) · [Privacy](docs/PRIVACY.md) · [Development](docs/DEVELOPMENT.md)

## Download

Grab the latest installer from the
**[Releases page](https://github.com/Isaac3176/InternPilot/releases/latest)**:

| OS | File |
| --- | --- |
| Windows | `.msi` / `.exe` (NSIS) |
| macOS | `.dmg` (Apple Silicon + Intel) |
| Linux | `.AppImage` / `.deb` |

The app is unsigned, so your OS may warn on first launch (Windows: More info → Run anyway;
macOS: right-click → Open). All data stays on your device.

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
