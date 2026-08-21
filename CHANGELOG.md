# Changelog

Notable changes to InternPilot. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); dates are UTC.

## [Unreleased]

_Nothing yet._

## [0.1.3]

The polish, coverage, and quality release (everything that landed after the `v0.1.2` tag, which
was never published):

- **Live ATS coverage** for **Workday** and **SmartRecruiters** (SmartRecruiters auto-discovered;
  Workday a curated, live-confirmed, desktop-first set). Fixed the intern-role filter to match
  the plural "Internships".
- **Live openings on Home** — a compact "Live now" card surfaces real just-posted roles on the
  dashboard, not only the Radar.
- **Prep Engine polish** — adaptive difficulty in the Today queue; **company-specific weakness
  weighting** so an OA plan reflects that company's own logged history.
- **Closed loops** — save an AI bullet rewrite to your library; OA Lab's prescription is now a
  checkable training plan that routes into Prep.
- **Testing + CI** — Vitest unit suite (44 tests over the pure logic) and a GitHub Actions CI
  pipeline (tests + type-check/build + `cargo check`) on every push and PR.
- Bug fixes from a code review (SmartRecruiters negative-cache TTL, company name cross-matching)
  and a documentation overhaul.

## [0.1.2]

The analytics-and-prep wave.

- **Release Radar accuracy** — recency/trend/cohort-drift forecasting, a "reach out by" date, a
  measured-accuracy backtest, and a multi-season dataset.
- **Live ATS detection** — real just-posted internships from Greenhouse / Lever / Ashby boards,
  with desktop notifications.
- **Recruiting Diagnostics** — signal capture on every application, a segmented funnel +
  rejection-timing histogram, and an application-**question audit** with fast-rejection
  auto-screen detection.
- **OA Lab** — structured OA debriefs with weakness diagnosis + training prescription.
- **Prep Engine** — pattern-readiness scoring, spaced repetition, a Today queue, **OA Simulation
  Mode**, and company OA countdown plans; OAs feed the same readiness scores.
- **Outcome moments** — milestone modals on status changes (OA / interview / offer, plus neutral
  rejection and auto-detected ghosting screens).
- **Résumé tailoring** — rank your bullets against a JD, flag gap skills, suggest truthful
  rewrites. Dashboard live-openings + diagnostic-nudge widgets. A QA/hardening pass.

## [0.1.1]

- One-click, stable **download links** (version-less installer names via the release workflow).
- **Logo resolution** overhaul (multi-source, Logo.dev token, caching) for professional company
  logos.
- **Résumé import** (parse a résumé into experiences + bullets) and a fix for PDF text.
- Hardening: shared `blankToNull` / `numOrNull` coercion fixing the empty-string → typed-column
  save crashes across applications, referrals, interviews, contacts, and employment history.

## [0.1.0]

Initial public build.

- Internship **Discover** feed with personal ranking, application **tracker**, **dashboard**
  (funnel, trends, Next-Best-Action), résumé matching, **Gmail** classification, **interview
  prep** + experience research, **referral CRM**, **Apply Assist**, the **autofill browser
  extension**, local auth + onboarding, and **cloud sync** (Supabase) with a web/phone PWA.

[Unreleased]: https://github.com/Isaac3176/InternPilot/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/Isaac3176/InternPilot/releases/tag/v0.1.3
[0.1.2]: https://github.com/Isaac3176/InternPilot/releases/tag/v0.1.2
[0.1.1]: https://github.com/Isaac3176/InternPilot/releases/tag/v0.1.1
