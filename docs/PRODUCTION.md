# Production readiness checklist

Going from "works for me" to "safe for real users." Grouped by priority; each item
is tagged **[code]** (in the app), **[ops]** (accounts / billing / config), or
**[legal]**. Check items as they land.

## Release smoke runbook

Use this every time you are about to send the app to a new group of users.

### 1. Local release gate

Run these from the repo root:

```bash
npm run typecheck
npm run check
npm run test:e2e
```

What this covers:

- `npm run typecheck`: TypeScript correctness without rebuilding.
- `npm run check`: unit tests, production build, and the frontend bundle budget.
- `npm run test:e2e`: browser smoke tests for auth, onboarding, legal pages,
  demo mode, saving jobs, tracker visibility, and the Settings production health
  panel.

If `npm run check:bundle` fails, inspect the printed largest assets before
raising a budget. The PDF worker has its own explicit allowance because resume
PDF parsing needs it; new oversized chunks should usually be lazy-loaded or
split before the budget is increased.

### 2. Deploy and verify the hosted app

After Vercel deploys `main`, open `https://internpilotapp.live` and verify:

- Create account / sign in works.
- Onboarding completes and lands on tailored jobs.
- Forgot password sends the generic reset notice.
- `/privacy.html` and `/terms.html` load.
- Settings -> Production health -> Run check reports the expected statuses.

For production, expected health results are:

- Cloud auth: **Ready** while signed in.
- CAPTCHA: **Ready** after `VITE_TURNSTILE_SITE_KEY` is deployed and Supabase
  CAPTCHA is enabled.
- Legal pages: **Ready**.
- Secure origin: **Ready**.
- Gmail web surface: **Ready** unless you intentionally enabled Gmail sync on web.

### 3. Rollback

If a release breaks auth, onboarding, or job browsing:

1. In Vercel, promote the last known-good deployment.
2. In Supabase, keep auth settings unchanged unless the failure is clearly SMTP
   or CAPTCHA configuration.
3. Open a GitHub issue with the failed flow, browser, URL, and console error.
4. Add or update an E2E test before shipping the fix.

## 🔴 Blockers — before a single external user

- [ ] **[ops] Turn ON email confirmation** in Supabase → Auth → Providers → Email.
      (SETUP.md tells you to turn it *off* for personal use — reverse that.)
- [x] **[code] Support auth CAPTCHA tokens** — when `VITE_TURNSTILE_SITE_KEY` is set,
      sign-up, sign-in, and forgot-password render a Cloudflare Turnstile check and pass the token to Supabase.
- [ ] **[ops] Enable auth abuse protection** — Supabase rate limiting + CAPTCHA on
      sign-up/sign-in/password reset; review the anon key is the only key shipped (it is). Configure
      the Turnstile secret key in Supabase and the public site key in Vercel.
- [ ] **[ops] Configure custom SMTP for auth emails** (Auth → Emails → SMTP). The
      built-in Supabase email sender is **rate-limited to a few messages/hour** and is
      not for production — password-reset and confirmation emails will silently fail
      to arrive at scale. Use Resend / SendGrid / SES (all have free tiers) and set a
      verified sender domain. Also raise Auth → Rate Limits once SMTP is real.
- [ ] **[ops] Upgrade Supabase off the free tier** and set **billing alerts** — every
      user's data lives in your project; free-tier limits (DB size, bandwidth,
      monthly active users) will be hit, and overages are on your card.
- [ ] **[ops+legal] Gmail OAuth verification.** `gmail.readonly` is a **restricted
      scope** → Google requires OAuth app verification + likely a CASA security
      assessment for production. Until then you're capped at 100 test users behind an
      "unverified app" warning. **Recommended v1: ship with the email feature off or
      gated**, pursue verification in parallel.
- [x] **[code] Gate Gmail sync in production.** Production web builds hide and block
      Gmail sync unless `VITE_ENABLE_GMAIL_SYNC=1` is explicitly set; desktop/dev/e2e
      builds keep the feature available.
- [x] **[code] Add visible Privacy Policy and Terms links** on auth and Settings.
- [ ] **[legal] Lawyer-review Privacy Policy and Terms of Service** — required for
      handling PII and for Google OAuth before a broad public launch.
- [x] **[code] Global error boundary** so one component crash can't white-screen the
      app (`components/ErrorBoundary.tsx`, app- and page-level).
- [ ] **[code+ops] Move AI calls server-side (optional but recommended).** Today the
      user's OpenAI key sits in browser localStorage (XSS-exposed). A Supabase Edge
      Function proxy keeps keys out of the client. If users bring their own key,
      document the risk at minimum.

## 🟠 Reliability — before you'd trust it with strangers

- [ ] **[ops+code] Crash/error reporting** (e.g. Sentry). Hook it into
      `lib/report.ts` (`reportError`) and `ErrorBoundary` — both are already the
      single integration points. You are currently blind to bugs real users hit.
- [x] **[code] Stop swallowing errors** on primary data loads — routed through
      `reportError` so failures are observable (was silent `.catch(() => {})`).
- [x] **[code] Fresh-user E2E smoke tests** for auth-adjacent flows, onboarding,
      demo mode, Browse, saving jobs, and tracker visibility.
- [x] **[code] Production health panel** in Settings for auth/schema, CAPTCHA,
      legal pages, secure origin, and Gmail web-surface checks.
- [x] **[code] Frontend bundle budget** in `npm run check` and CI, so accidental
      heavy imports do not silently ship.
- [x] **[code] Distinguish "empty" from "failed"** on the core screens — a failed
      load currently can look like "no data." Add retry affordances.
- [ ] **[ops] Code-sign the installers** — Windows Authenticode (~$100–300/yr) +
      Apple notarization ($99/yr). Unsigned builds trigger SmartScreen / Gatekeeper
      "unknown publisher" warnings that kill adoption.
- [ ] **[code] Auto-update** via the Tauri updater so users get fixes without a
      manual re-download.

## 🟡 Scale & polish — as usage grows

- [ ] **[ops] ATS / feed terms & rate limits** — polling Greenhouse/Lever/Ashby/
      SmartRecruiters/Workday and using the SimplifyJobs feed at scale may hit rate
      limits or ToS limits. Fine for dozens of users; revisit before hundreds.
- [ ] **[code] Accessibility** — keyboard navigation, focus states, color contrast,
      screen-reader labels.
- [ ] **[code] Deeper tests** — component/integration + a couple of E2E flows
      (sign-in → apply → track). Unit coverage exists for the pure logic.
- [ ] **[code] First-run onboarding for non-you** — guided empty states (no résumé,
      empty watchlist) so a stranger isn't dropped into blank screens.
- [ ] **[ops] Backups / data export** — Supabase point-in-time recovery on a paid
      plan; in-app JSON export already exists.

## Notes on the shared-backend model

All users share one Supabase project. **Row-Level Security** scopes every row to its
owner (verified: every table has an `own_rows` policy), so users can't see each
other's data. The tradeoffs are yours to own: **cost** (your project, your bill),
**abuse** (rate limits + email confirmation matter), and **support** (you're the
operator). This is a legitimate SaaS model — just budget and monitor for it.
