# Development notes

## Prerequisites

- [Node.js](https://nodejs.org/) **20+** (CI and the release workflow use 20).
- [Rust](https://www.rust-lang.org/tools/install) (stable; MSVC toolchain on Windows) — desktop only.
- Tauri prerequisites for your OS — https://tauri.app/start/prerequisites/
  (Windows: WebView2 + the MSVC C++ build tools).

## Commands

```bash
npm install

# run
npm run dev            # frontend only, in a browser (web/PWA mode)
npm run tauri dev      # the desktop app in dev mode

# build
npm run build          # type-check (tsc) + build the frontend
npm run tauri build    # produce a production desktop installer bundle

# quality
npm test               # run the Vitest unit suite once
npm run test:watch     # watch mode while developing
npm run test:coverage  # unit tests + a coverage report
npm run typecheck      # tsc --noEmit (type-check without building)
npm run check          # tests + build — the one-shot gate before you push
```

Run **`npm run check`** before pushing; CI runs the same things and will fail the PR otherwise.

## Cloud (Supabase) config

The frontend reads Supabase credentials from Vite env vars. For local web/cloud development,
create a `.env` (or `.env.local`, gitignored) at the repo root:

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

The **anon** key is safe to ship (Row-Level Security protects the data). Never commit the
`service_role` key or the database password. Full cloud setup: [../cloud/SETUP.md](../cloud/SETUP.md).
Without these, the app still builds and runs in the desktop/SQLite path.

## Testing

Unit tests live next to the code they cover as `src/**/*.test.ts` and run under **Vitest**
(`vitest.config.ts`, node environment). They target the **pure logic** — the calculations the
TypeScript compiler can't verify:

- `prep/` — pattern readiness, spaced-repetition scheduling, the OA countdown plan, OA diagnostics.
- `diagnostics/` — the funnel + `reachedRank`, the rejection-timing guard, the auto-screen detector.
- `listings/` — JD↔résumé matching and work-authorization eligibility.
- `apply/tailor`, `release/live` (the intern-role filter, incl. the "Internships" plural case).

Guidelines:
- Keep tests on **pure functions** (no DB, network, or DOM). Build fixtures with `as` casts on
  the typed interfaces rather than filling every field.
- When a bug is found and fixed, add a **regression test** that would have caught it (see the
  negative-rejection-delta and plural-`Internships` tests).
- UI, `db/*`, and network/AI modules are out of scope for the unit suite — they need a real
  runtime (jsdom + mocked Tauri/Supabase), which isn't wired up yet.

Coverage is scoped to those pure modules in `vitest.config.ts`, so the percentage is a real
signal rather than diluted by untestable UI.

## Database migrations

The SQLite schema is a **versioned migration list** in
[`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs). To change the schema:

1. Add a new `Migration { version: N+1, description, sql, kind: Up }` entry (never edit an
   existing one — they've already run on users' machines).
2. Mirror the same change in [`cloud/schema.sql`](../cloud/schema.sql) — new tables need a
   `user_id` column and must be added to the RLS array at the bottom; new columns use
   `alter table … add column if not exists`.
3. Run `cargo check --manifest-path src-tauri/Cargo.toml` to validate the SQL string compiles.
4. **Desktop auto-migrates** on next launch; the **cloud/web app does not** — you must run the
   updated `schema.sql` in the Supabase SQL Editor (it's idempotent).

Keep the two schemas in parity — a column that exists in one but not the other silently drops
data on that platform.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push to `main` and every
PR: **frontend** job (`npm ci` → `npm test` → `npm run build`) and a **Rust** job (`cargo check`
with the Linux Tauri deps). [`release.yml`](../.github/workflows/release.yml) is separate and
fires on `v*` tags — see [Releases](#releases).

## Networking behind a TLS-intercepting proxy

Some corporate networks / antivirus intercept HTTPS with a custom root CA, breaking certificate
verification for npm and cargo. This affects only building from source on such a network, not
the shipped app:

- `NODE_OPTIONS=--use-system-ca` — let npm/Node use the OS certificate store.
- `CARGO_HTTP_CHECK_REVOKE=false` — let cargo skip the failing revocation check.

## Releases

Pushing a `v*` tag triggers [`release.yml`](../.github/workflows/release.yml), which builds
installers for Windows, macOS, and Linux via `tauri-action` and attaches them to a **draft**
GitHub Release (you publish it manually). Bump the version in `package.json`,
`src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` together before tagging. Full runbook:
[../cloud/RELEASE.md](../cloud/RELEASE.md).
