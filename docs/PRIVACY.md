# Privacy & data flows

InternPilot is local-first. Here is exactly what data lives where and what leaves your device.

## Stored locally (SQLite)

Applications, companies, résumé versions and bullets, emails, interviews, experiences, tasks,
contacts, referrals, and your profile. Your local account (email + PBKDF2-hashed password) lives
in the same database. Export everything or delete all data from **Settings**.

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

## Credentials

- The **OpenAI key**, **Gmail OAuth tokens**, and the **extension bridge token** are currently
  stored in the app's local storage. **Planned:** move these into the OS keychain. Treat the
  current storage as not yet hardened.

## Browser extension

- Talks only to the local bridge (`127.0.0.1:8765`), authenticated with your token. It reads
  your profile for autofill and posts `{ company, title, url }` to record a job. Nothing is sent
  to any external server by the extension.

## Telemetry & backups

- No analytics or telemetry is sent anywhere. There is no automatic cloud backup — use
  **Settings → Export** to back up your data as JSON.
