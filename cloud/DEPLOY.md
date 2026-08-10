# Deploy the InternPilot web/phone app (Vercel)

The web build (browser + phone) is a static Vite site + Supabase. `vercel.json`
already sets the build command, output dir, and SPA routing.

## One-time deploy
1. Push is already on GitHub: `Isaac3176/InternPilot`.
2. Go to **vercel.com** → **Add New… → Project** → **Import** `Isaac3176/InternPilot`.
3. Vercel auto-detects **Vite**. Leave the defaults (they match `vercel.json`):
   - Build command: `npm run build`
   - Output directory: `dist`
4. (Optional) Project → Settings → **Environment Variables** — only needed if you
   ever rotate keys; the app already has your project URL + publishable key baked
   in as defaults:
   - `VITE_SUPABASE_URL` = `https://sdminkbpouqdjgqawdqc.supabase.co`
   - `VITE_SUPABASE_KEY` = your `sb_publishable_…` key
5. **Deploy.** You'll get a URL like `https://internpilot.vercel.app`.

**Live deployment:** https://intern-pilot-seven.vercel.app

Every push to `main` redeploys automatically.

## Point Supabase at the deployed URL (so auth emails/links work)
Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://intern-pilot-seven.vercel.app`
- **Redirect URLs:** add `https://intern-pilot-seven.vercel.app` (and `https://intern-pilot-seven.vercel.app/**`).
(If you turned **off** "Confirm email", this isn't strictly required to log in, but
set it anyway for password resets.)

## Install on your iPhone
1. Open the Vercel URL in **Safari**.
2. **Sign in** with your cloud account (same one as desktop → shared data).
3. **Share → Add to Home Screen** → it installs with the InternPilot icon and
   runs full-screen (standalone), like an app.

## Notes
- Works on any network — no desktop needed, no same-Wi-Fi requirement.
- Desktop stays the place you run the **browser-extension autofill**; the phone
  browses, queues, and tracks. Both share the same Supabase data.
- Not-yet-cloud pages (Networking, Interview Prep, Experiences, Email Inbox) show
  empty in the web build until they're migrated (Phase 3b).
