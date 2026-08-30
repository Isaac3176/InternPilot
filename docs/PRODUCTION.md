# Production readiness checklist

Going from "works for me" to "safe for real users." Grouped by priority; each item
is tagged **[code]** (in the app), **[ops]** (accounts / billing / config), or
**[legal]**. Check items as they land.

## 🔴 Blockers — before a single external user

- [ ] **[ops] Turn ON email confirmation** in Supabase → Auth → Providers → Email.
      (SETUP.md tells you to turn it *off* for personal use — reverse that.)
- [ ] **[ops] Enable auth abuse protection** — Supabase rate limiting + CAPTCHA on
      sign-up/sign-in; review the anon key is the only key shipped (it is).
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
- [ ] **[legal] Publish a Privacy Policy and Terms of Service** (drafts in
      `PRIVACY-POLICY.md` / `TERMS.md`) — required for handling PII and for Google
      OAuth. Have a lawyer review before publishing.
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
- [ ] **[code] Distinguish "empty" from "failed"** on the core screens — a failed
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
