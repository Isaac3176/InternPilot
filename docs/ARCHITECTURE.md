# Architecture

InternPilot is a **local-first Tauri desktop app**: a React/TypeScript frontend in a webview,
a small Rust backend, and a local SQLite database. A companion browser extension talks to the
app over a localhost bridge.

```
┌──────────────────────────── Tauri app ─────────────────────────────┐
│  Webview (React + TS)                    Rust (src-tauri)           │
│  ├─ pages/         screens               ├─ SQLite migrations       │
│  ├─ components/    UI                     ├─ plugins: sql, http,     │
│  ├─ db/            typed SQLite access    │   opener, notification,  │
│  ├─ ai/            OpenAI + fallbacks     │   oauth                  │
│  ├─ gmail/         OAuth + sync           └─ bridge: tiny_http       │
│  ├─ listings/      feed, ranking, JD          127.0.0.1:8765        │
│  ├─ bridge/        talks to Rust bridge                             │
│  └─ auth/          local PBKDF2 login                               │
└─────────────────────────────────────────────────────────────────────┘
        ▲ localhost API (token)                     ▲ HTTPS (via http plugin)
        │                                           │
  Browser extension                          OpenAI · Gmail · job feed · ATS sites
  (autofill + record)
```

## Frontend layout (`src/`)

- `pages/` — Dashboard, Applications, Internships (Discover), Resume Center, Bullet Library,
  Networking, Interview Prep, Experiences, Apply Assist, Email Inbox, AI Chat, Profile, Settings.
- `components/` — reusable UI (modals, tag multi-select, filter pills, readiness gauge, the
  profile-form hook + sections, auth gate / login / signup wizard).
- `db/` — one typed module per table (applications, companies, resumes, contacts, referrals,
  emails, interviews, experiences, profile, metrics). All SQL goes through `tauri-plugin-sql`.
- `ai/` — resume match, chat, prep, research, email classify, strategy, apply, resume parse.
  Each calls OpenAI via `lib/http` (routed through the Rust HTTP plugin to bypass CORS) and has
  a deterministic offline fallback.
- `listings/` — `service` (fetch + rank the feed), `description` (fetch a posting's JD from
  Greenhouse/Lever/SmartRecruiters/Ashby or generic HTML), `match` (JD-vs-résumé keyword coverage),
  `notify` (new-listing alerts).
- `gmail/` — desktop OAuth (loopback + PKCE via `tauri-plugin-oauth`), API client, sync.
- `bridge/` — pushes the profile + token to the Rust bridge and listens for jobs the extension records.
- `auth/` — local accounts, PBKDF2 password hashing (Web Crypto), session.

## Data model (SQLite)

Created and evolved via Rust-side migrations in `src-tauri/src/lib.rs`:
`companies`, `applications`, `resume_versions`, `resume_bullets`, `emails`, `interviews`,
`interview_experiences`, `tasks`, `contacts`, `referrals`, `profile`, `accounts`.

## The extension bridge

The Rust backend runs a tiny localhost HTTP server (`tiny_http`, port 8765, token-protected):

- `GET /profile` → the autofill data (pushed from the frontend via the `bridge_set_profile` command).
- `POST /application` → relayed to the frontend (event) which inserts an application.
- `GET /ping` → health check.

Requests must send the shared token (`X-IP-Token`) so arbitrary web pages can't read your
profile off localhost. See [EXTENSION.md](EXTENSION.md).

## AI + offline fallbacks

Every AI feature degrades gracefully without an OpenAI key: resume matching and JD matching use
keyword coverage, email classification uses keyword rules, prep/strategy/experience summaries use
templates. This keeps the app fully demoable offline and never blocks on the network.
