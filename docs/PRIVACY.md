# Privacy & data flows

InternPilot is **local-first, and cloud-synced when you sign in**. Here is exactly what data
lives where and what leaves your device.

## Where your data lives

- **Cloud (Supabase) — when you sign in.** The app uses a Supabase account (required by the
  sign-in gate on all platforms), so your applications, companies, résumés and bullets, emails,
  interviews, experiences, OA debriefs, coding-practice log, contacts, referrals, and profile are
  stored in **Supabase Postgres**. **Row-Level Security** scopes every row to your account —
  no other user can read it. This is what syncs the same data across desktop, web, and phone.
- **Local (SQLite) — desktop.** The desktop app also keeps a local SQLite database (and the
  browser-extension bridge runs against it). Your on-device account uses a PBKDF2-hashed password.

Export everything or delete all data from **Settings**.

> **Tradeoff:** with cloud sync, your data leaves your device and lives in Supabase's cloud. RLS
> keeps it private to your account, but it is no longer "only on your machine." See
> [../cloud/SETUP.md](../cloud/SETUP.md).

## Leaves the device only when you act

- **OpenAI** — only when you invoke an AI feature *and* a key is set: the résumé /
  job-description / email / question text needed for that request. With no key, offline fallbacks
  run and nothing is sent.
- **Google (Gmail)** — only if you connect it: read-only requests using a **narrow query** for
  job-related mail. Message metadata and snippets are stored locally; InternPilot never modifies
  your inbox.
- **Job feed** — fetched from a public listings URL (`raw.githubusercontent.com`); no personal
  data is sent.
- **Posting descriptions** — when you open a listing, the app fetches that posting's page / ATS
  API to show the description. Only the posting URL is requested; no personal data is sent.
- **ATS boards (Release Radar / live openings)** — for your **watchlist** companies, the app
  queries public job-board APIs (Greenhouse / Lever / Ashby / SmartRecruiters / Workday) to find
  real openings. Only company slugs / board tokens are sent — no personal data.
- **Supabase** — your data syncs to your Supabase project over HTTPS using the public *anon* key,
  gated by Row-Level Security. The `service_role` key and DB password stay server-side / off your
  device and are never shipped in the app.

## Credentials

- The **OpenAI key**, **Gmail OAuth tokens**, and the **extension bridge token** are currently
  stored in the app's local storage. **Planned:** move these into the OS keychain. Treat the
  current storage as not yet hardened.

## Browser extension

- Talks only to the local bridge (`127.0.0.1:8765`), authenticated with your token. It reads
  your profile for autofill and posts `{ company, title, url }` to record a job. Nothing is sent
  to any external server by the extension.

## Telemetry & backups

- **No analytics or telemetry** is sent anywhere — InternPilot has no tracking.
- When you're signed in, your data is stored in **your Supabase project** (that is the sync
  backend, not a third-party backup service). You can also **Settings → Export** a JSON copy at
  any time, and delete everything from Settings.
