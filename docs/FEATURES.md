# Features guide

How InternPilot's systems work and — more importantly — **how they feed each other**. The
README lists the features; this explains the loops so you can actually use them.

## The core loop

InternPilot is one connected pipeline, not a bag of tools:

```
  Find a role ──► Apply ──► Track the outcome ──► Diagnose why ──► Prep for the next
     ▲  Release Radar / live ATS / Discover feed        │  Recruiting Diagnostics
     │  ranked to your profile                          │  Prep Engine
     └───────────────────  each result makes the next step smarter  ◄──────────────┘
```

An OA you fail feeds your pattern readiness; a fast rejection flags a profile answer to fix; a
company that opens moves to the top of your queue. The value is the feedback, not any one screen.

## A guiding principle: honesty over hype

Several features make claims about your search. They all follow the same rules, on purpose:

- **Sample-size gates.** Segments below ~5–10 data points are greyed and labeled "small sample."
- **Correlation, never causation.** "Associated with," not "caused by." A résumé version that
  looks better may just have hit easier roles.
- **Never fake data.** Rows missing a signal are excluded and counted as "undated," not invented.

If a number looks confident, it earned it.

---

## Discover & Fast Apply

A three-pane job browser (results · detail · rail). Listings come from a public feed
(SimplifyJobs), are **ranked to your profile**, and non-software noise (courses, bootcamps,
talent pools) is filtered out. Open a role and it fetches the **real job description**, scores
**keyword coverage** against your résumé (matched / missing skills), and checks
**work-authorization eligibility**. One click to **Save** or **Apply** (which opens the posting,
records it, and starts the tailored apply flow).

**Application packet** (the "Prepare" screen) assembles everything before you click: eligibility,
the recommended résumé + match, referral contacts, a cold-email draft, and **bullet tailoring** —
it ranks *your* bullets against the JD, shows which to lead with, flags gap skills, and can
suggest (and save) truthful rewrites.

## Release Radar & live openings

Your **watchlist** holds target companies in priority tiers (instant / high / normal / muted).

- **Release Radar** forecasts each company's likely opening window from several past cycles —
  recency-weighted, trend-extrapolated, cohort-drift-corrected, with a measured-accuracy backtest
  (`scripts/backtest-release-history.mjs`). Because year-over-year timing is genuinely noisy
  (~45-day swing), the useful output isn't a tight date — it's a **"reach out by" date** that
  lands *before* the opening ~70% of the time, so you build the relationship early.
- **Live ATS detection** goes beyond forecasting: it polls your watchlist companies' *actual*
  job boards — Greenhouse, Lever, Ashby, SmartRecruiters, Workday — and surfaces **real,
  just-posted** internships on the Radar, on Home, and via desktop notification, with a direct
  apply link. Greenhouse/SmartRecruiters are auto-discovered (their boards expose a verifiable
  company name); Lever/Ashby/Workday come from a curated, live-confirmed map. *Caveat:* Workday's
  API isn't CORS-friendly, so those hits are desktop-first.

## Tracker & Outcome moments

The application tracker supports inline status changes (no edit trip) and a kebab menu for
details. Advancing a status fires a **milestone "Outcome moment"** — a Strava-style card scaled
to the win: **OA → Interview → Offer** get progressively bigger celebrations with concrete next
steps and a rotating "field note." Rejections get a neutral, honest screen (no confetti), and
**ghosting** is auto-detected (an applied role gone quiet past a threshold) with a follow-up-or-
close nudge. Every card ends in an action — the point is to start the next thing.

## Recruiting Diagnostics

Answers *what's actually happening to my applications* — Tracker → Diagnostics.

- **Segmented funnel** — Applied → OA → Interview → Offer, using the deepest stage each
  application reached (so a rejection still counts toward the stage it got to), segmented by
  **résumé version**, **apply timing** (<24h / 1–3d / 3d+), and **referral vs cold**.
- **Rejection-timing histogram** — how long until a "no." A cluster in the **first hour** usually
  means an **automated eligibility screen**, not a recruiter reading your résumé.
- **Question audit** — reconstructs the screening answers your autofill gives (sponsorship, work
  auth, GPA, grad date, location) and, on a suspiciously fast rejection, surfaces a **"possible
  automatic screen"** card pointing at the likely-disqualifying answer — labeled low confidence.
  It reframes a rejection from *"my résumé is bad"* to a checkable, mechanical cause.

Old applications predate signal capture; a one-click **Backfill** fills what's derivable from
existing dates (it won't invent reject timestamps, which would poison the histogram).

## Prep Engine

Answers one question: **what should I practice today, based on where I'm actually failing?** One
"Prep" destination, three tabs — **Today · Progress · History**.

- **Readiness by pattern, not problems solved.** ~15 patterns (Arrays, Graphs, DP, Simulation…)
  each score from a weighted blend of independent-solve rate, timed performance, retention,
  difficulty, and recency. "127 problems solved" means little if graphs still freeze you.
- **Today queue** — targeted at your weakest patterns with **adaptive difficulty** (easy to
  rebuild a weak pattern, hard to stress-test a strong one) and **spaced repetition** (fail →
  re-solve tomorrow → 7d → 30d).
- **Log a problem** with a quick failure-reason tag (pattern recognition, edge cases, time
  management, got-stuck…) — the failure reason matters more than the result.
- **OA Lab** — debrief an assessment; it detects the pattern (e.g. time management from "one
  problem ate 67% of the clock") and turns the prescription into a checkable **training plan**.
- **OA Simulation Mode** — a timed multi-question run with per-question clocks and a **move-on
  nudge** after 15 minutes stuck while questions sit unopened. Built to train the exact behavior
  that costs the most points on real OAs.
- **Company OA countdown plan** — schedule an OA and get a day-by-day plan (practice → a timed
  sim mid-week → light taper → OA day), weighted to **that company's own** logged history.

Crucially, **OAs feed the same readiness scores** as practice — one system, so a simulation you
fail on a graph question raises Graphs in tomorrow's Today queue.

## Networking (referral CRM)

Contacts + a **referral pipeline** (potential → confirmed → applied) with proactive warnings
(agreed-but-unconfirmed, no thank-you, overdue follow-up), an employment-history graph for
best-path scoring, and networking analytics (response/agreement rates, OA/interview rate with vs.
without a referral) — correlational and sample-size-guarded.

## Résumé tools

Multiple targeted **résumé versions** with a track per company, **PDF/DOCX import** (parses
experiences + bullets), a **Bullet Library** of saved AI-improved bullets, and the per-job
**tailoring** described under Fast Apply.

## Email, Apply Assist, Chat

Optional **Gmail** read-only sync classifies job mail (confirmation / rejection / OA / interview /
recruiter / offer) with a **review-before-update** step. **Apply Assist** is Safe-Mode prep
(best résumé, drafted answers, checklist). **AI Chat** is grounded in your stored data. Every AI
feature has a deterministic **offline fallback**, so nothing blocks on a key or the network.
