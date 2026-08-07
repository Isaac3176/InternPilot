# InternPilot in the cloud — setup & plan

Goal: use InternPilot on your phone **anywhere** (desktop off), with your data in
a hosted database and real accounts.

This is a multi-step build. Below is the plan, the parts **you** do (accounts —
I can't create those or hold your secrets), and the parts **I** build.

---

## Architecture

- **Database + Auth:** [Supabase](https://supabase.com) (hosted Postgres + email
  auth). The app talks to it directly with the public *anon key*; **Row-Level
  Security** (already in `schema.sql`) guarantees each account only sees its own
  rows. No custom API server needed for CRUD.
- **Phone app:** a hosted PWA (the mobile UI we designed) served from
  [Vercel](https://vercel.com) or Netlify — open the URL, Add to Home Screen,
  works on any network.
- **AI + CORS:** OpenAI calls and any CORS-blocked fetches go through a
  **Supabase Edge Function** so your OpenAI key stays server-side (never shipped
  to the browser).
- **Desktop:** migrates its data layer to Supabase too, so desktop and phone
  share the same cloud data (this is what makes "queue on phone → apply on
  desktop" work anywhere).

---

## What YOU do first (≈15 min) — this unblocks everything

1. **Create a Supabase project** — supabase.com → New project. Pick a region
   near you. Save the database password.
2. **Run the schema** — Supabase dashboard → **SQL Editor** → paste all of
   `cloud/schema.sql` → **Run**. (Creates the tables + security policies.)
3. **Enable email auth** — Authentication → Providers → Email → enable. (For a
   personal tool you can turn *off* "Confirm email" so you can log in instantly.)
4. **Grab two values** — Project Settings → API:
   - `Project URL` (looks like `https://abcd.supabase.co`)
   - `anon` `public` key (a long JWT — this one is safe to put in the app; it's
     protected by RLS)
5. **(For AI later)** create a free [OpenAI API key] and a **Vercel** account —
   not needed until the deploy phase.

Then paste the **Project URL** and **anon key** back to me and I'll wire it up.

> The anon key is *designed* to be public (it only allows what RLS permits).
> Never share the **service_role** key or your DB password.

---

## Build phases (what I do)

- **Phase 1 — Foundation:** `schema.sql` (done ✓) + Supabase client + email
  login/signup, gated behind env vars. *(Starts once you send URL + anon key.)*
- **Phase 2 — Data layer → Supabase:** point the app's `db/*` calls at Supabase
  so all reads/writes hit the cloud (with a local cache for speed).
- **Phase 3 — Hosted phone PWA:** deploy the mobile app to Vercel; log in on the
  phone, use it anywhere.
- **Phase 4 — AI/proxy Edge Function:** move OpenAI + CORS-limited fetches
  server-side; add your OpenAI key as a Supabase secret.
- **Phase 5 — Desktop on cloud:** desktop reads/writes the same Supabase data so
  both devices stay in sync (optional offline cache).

---

## Honest tradeoffs

- **Privacy:** your data moves from your PC to Supabase's cloud. RLS keeps it
  private to your account, but it's no longer "only on your device."
- **Cost:** Supabase + Vercel free tiers are enough for personal use; heavy use
  or lots of AI could exceed them.
- **Effort:** several sessions. The browser can't use the desktop-only Tauri
  plugins, so the data + AI layers are real new code, not a config flip.
- **The desktop browser-extension autofill still runs on desktop** — the phone
  continues to *queue*; the desktop *applies*. Cloud just means they sync
  without being on the same Wi-Fi.
