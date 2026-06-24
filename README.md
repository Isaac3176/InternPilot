# InternPilot AI

An AI-powered desktop application tracker and career assistant for software engineering
internship applicants. Track every application, manage targeted resume versions, match
resumes against job descriptions with AI, and ask a chatbot grounded in your own data.

Built with **Tauri + React + TypeScript + SQLite**, with **OpenAI** powering the AI features.

> Status: **MVP / Phase 1** — application tracking, resume versions, AI resume matching,
> a grounded chatbot, and a metrics dashboard. All data is stored locally.

## Features (current)

- **Dashboard** — application counts by status, conversion rates, and recent applications.
- **Applications** — create / edit / delete / search / filter applications (company, role,
  status, resume version, job description, notes).
- **Resume Center** — create/edit multiple targeted resume versions (paste text or import a
  PDF / DOCX file), and run an AI resume-to-job match (score, matching skills, missing
  keywords, suggested bullet rewrites, strategy).
- **Bullet Library** — view, copy, and manage improved resume bullets saved from AI matches.
- **AI Chat** — a career assistant grounded in your stored application data.
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
  ai/                 AI service layer (OpenAI + offline stub) and settings
  components/         Reusable UI (status badge, application modal)
  db/                 SQLite access layer (typed CRUD + metrics)
  pages/              Dashboard, Applications, ResumeCenter, AIChat, Settings
src-tauri/            Rust backend
  src/lib.rs          Tauri setup + SQLite schema migrations
```

The database schema (all 8 tables from the proposal) is created via Rust-side migrations in
[`src-tauri/src/lib.rs`](src-tauri/src/lib.rs). Phase 1 uses `companies`, `applications`,
`resume_versions`, `resume_bullets`, and `tasks`.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable, MSVC toolchain on Windows)
- Tauri prerequisites for your OS — see https://tauri.app/start/prerequisites/
  (Windows: WebView2 + the MSVC C++ build tools)

## Getting started

```bash
npm install
npm run tauri dev      # run the desktop app in dev mode
```

Build a production bundle:

```bash
npm run tauri build
```

### Notes for this environment (corporate TLS)

This machine intercepts HTTPS with a custom root CA, which breaks default certificate
verification. Two environment variables (already persisted via `setx`) work around it:

- `NODE_OPTIONS=--use-system-ca` — lets npm/Node use the Windows certificate store.
- `CARGO_HTTP_CHECK_REVOKE=false` — lets cargo skip the (failing) revocation check.

## Privacy

All application data is stored locally in SQLite. Nothing leaves your device except the
resume / job-description / question text you explicitly send to OpenAI when you run a match
or use the chat. You can export or delete all data from Settings.

## Roadmap

Following the project proposal:

- **Phase 2** — richer AI resume matching, save suggested bullets to the library.
- **Phase 3** — Gmail integration + email classification.
- **Phase 4** — OA / interview prep plans + desktop notifications.
- **Phase 5** — interview-experience research + analytics across resume versions.
- **Phase 6** — assisted application workflow.
