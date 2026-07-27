# InternPilot AI

An AI-powered desktop application tracker and career assistant for software engineering
internship applicants. Track every application, manage targeted resume versions, match
resumes against job descriptions with AI, and ask a chatbot grounded in your own data.

Built with **Tauri + React + TypeScript + SQLite**, with **OpenAI** powering the AI features.

**Status: Beta** — actively developed and usable locally, not yet independently tested at
scale. Individual features are labeled below as _implemented_, _experimental_, or _planned_.

## Download

Grab the latest installer for your operating system from the
**[Releases page](https://github.com/Isaac3176/InternPilot/releases/latest)**:

| OS | File |
| --- | --- |
| Windows | `.msi` or `.exe` (NSIS) installer |
| macOS | `.dmg` (Apple Silicon and Intel builds) |
| Linux | `.AppImage` or `.deb` |

The app is **unsigned**, so your OS may warn on first launch — this is expected for an
open-source app without a paid signing certificate:

- **Windows:** "Windows protected your PC" → **More info** → **Run anyway**.
- **macOS:** right-click the app → **Open**, or **System Settings → Privacy & Security → Open Anyway**.

All data stays on your device. The AI features work with offline fallbacks, and become fully
tailored once you add an **OpenAI API key** in Settings. Gmail sync is optional and read-only.

## Features

- **Dashboard** — application counts by status, conversion rates, and recent applications.
- **Applications** — create / edit / delete / search / filter applications (company, role,
  status, resume version, job description, notes).
- **Resume Center** — create/edit multiple targeted resume versions (paste text or import a
  PDF / DOCX file), and run an AI resume-to-job match (score, matching skills, missing
  keywords, suggested bullet rewrites, strategy).
- **Bullet Library** — view, copy, and manage improved resume bullets saved from AI matches.
- **Interview Prep** — track OA & interview events and generate company-specific prep plans
  (focus areas, study schedule, practice, talking points, questions to ask) tailored to the
  interview type, role, job description, and your resume.
- **Interview Experiences** — collect company interview reports (role, source, difficulty,
  topics, notes) and synthesize them per company into prep guidance with AI.
- **AI Chat** — a career assistant grounded in your stored application data.
- **Internships feed** — pull ranked internship listings from a public source, tailored to
  your onboarding profile, with brand-new postings badged and desktop-notified so you can be
  among the first to apply; one click adds to the tracker or jumps into assisted apply.
- **Referral tracking** — record a referral per application and see your referral rate.
- **Email Inbox + Gmail** — connect Gmail (read-only OAuth) and sync job-related messages,
  or paste emails manually; each is AI-classified (confirmation / rejection / OA / interview /
  recruiter / offer) with a review-before-update step to change an application's status.
- **Apply Assist** — Safe-Mode assisted application prep: recommends the best-matching
  resume version for a job, drafts short-answer responses, builds a prep checklist, and
  opens the posting for you to review and submit.
- **Reminders & desktop notifications** — the dashboard surfaces follow-up reminders for
  stale applications and upcoming OAs/interviews, and fires native desktop notifications.
- **Settings** — OpenAI API key + model, data export (JSON), and delete-all-data.

The AI features work **without an API key** using an offline keyword-based estimate, so the
app is demoable out of the box. Add an OpenAI key in Settings for real analysis.

## Tech stack

| Layer            | Technology                          |
| ---------------- | ----------------------------------- |
| Desktop shell    | Tauri 2                             |
| Frontend         | React 19 + TypeScript + Vite        |
| Local database   | SQLite (`tauri-plugin-sql`)         |
| AI provider      | OpenAI Chat Completions API         |
| Routing          | React Router                        |

## Project structure

```
src/                  React frontend
  ai/                 AI service layer (OpenAI + offline fallbacks)
  components/         Reusable UI (modals, status badge, onboarding, profile form)
  db/                 SQLite access layer (typed CRUD + metrics)
  gmail/              Gmail OAuth (loopback + PKCE), API client, sync
  listings/           Internship feed: fetch, rank, notify
  lib/                HTTP (CORS-safe), notifications, file extraction
  pages/              Dashboard, Applications, Internships, Resume Center, ...
src-tauri/            Rust backend
  src/lib.rs          Tauri setup + SQLite schema migrations
```

The SQLite schema is created and evolved via Rust-side migrations in
[`src-tauri/src/lib.rs`](src-tauri/src/lib.rs).

## Build from source

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for prerequisites, commands, release process,
and proxy/TLS troubleshooting.

```bash
npm install
npm run tauri dev
```

## Privacy

InternPilot is local-first. Here is exactly what data lives where and what leaves the device:

- **Stored locally (SQLite):** applications, companies, resume versions and bullets, emails,
  interviews, experiences, tasks, and your profile. Export or delete all of it from Settings.
- **Sent to OpenAI** (only when you invoke an AI feature, and only if a key is set): the
  resume / job-description / email / question text needed for that request. With no key, the
  offline fallbacks run and nothing is sent.
- **Sent to Google (Gmail), if you connect it:** read-only requests using a **narrow query**
  for job-related mail; message metadata and snippets are stored locally. InternPilot never
  modifies your inbox.
- **Job feed:** fetched from a public listings URL (`raw.githubusercontent.com`); no personal
  data is sent.
- **Credentials:** the OpenAI key and Gmail OAuth tokens are currently stored in the app's
  local storage. **Planned:** move these to the OS keychain (see roadmap) — do not treat the
  current storage as hardened.
- **Logs/backups:** no telemetry is sent anywhere; there is no automatic cloud backup.

## Roadmap

Following the project proposal:

- ✅ **Phase 1** — application tracker, resume versions, dashboard, local persistence.
- ✅ **Phase 2** — AI resume matching, PDF/DOCX import, bullet library.
- ✅ **Phase 3** — Gmail integration (read-only OAuth) + email classification.
- ✅ **Phase 4** — OA / interview prep plans + desktop notifications.
- ✅ **Phase 5** — interview-experience research + analytics across resume versions.
- ✅ **Phase 6** — assisted application workflow (Safe Mode).
