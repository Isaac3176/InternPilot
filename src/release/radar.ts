/**
 * Release Radar: for each watchlist company, combine its historical opening
 * forecast with current-cycle signals from the live feed to produce a state:
 *   open     — an active target-season role is already posted (apply now)
 *   signal   — the company is moving this cycle, but not the target role yet
 *   forecast — a historical estimate only, nothing posted
 *   none     — no historical data yet (capturing this cycle)
 */
import { getFeed } from "../listings/service";
import { getWatchlist, type CompanyPriority } from "../ranking/companies";
import { getPrefs } from "../ranking/prefs";
import { forecastForCompany, normName, seasonYearOf, type ReleaseForecast } from "./history";
import { recordOpen } from "./observed";

export type RadarState = "open" | "signal" | "forecast" | "none";

export interface RadarEntry {
  company: string;
  priority: CompanyPriority;
  state: RadarState;
  forecast: ReleaseForecast | null;
  probabilityNext7: number; // 0-1
  daysUntilWindow: number | null; // to window start; negative if inside/after
  daysUntilOutreach: number | null; // to the "start reaching out" date; negative if it's time
  monitoring: "High" | "Medium" | "Low" | "—";
  openListingUrl?: string;
  openListing?: { id: string; title: string; url: string; location: string | null };
  reasons: string[];
}

const DAY = 86_400_000;

function seasonYear(season: string): number {
  const m = season.match(/(20\d\d)/);
  return m ? Number(m[1]) : new Date().getFullYear() + 1;
}

/** Overlap of [now, now+7d] with the likely window, as a fraction of the window. */
function probNext7(now: number, f: ReleaseForecast): number {
  const span = Math.max(DAY, f.windowEnd - f.windowStart);
  const lo = Math.max(now, f.windowStart);
  const hi = Math.min(now + 7 * DAY, f.windowEnd);
  return Math.max(0, Math.min(1, (hi - lo) / span));
}

function humanDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Assemble radar entries for all non-muted watchlist companies, sorted by urgency. */
export async function getReleaseRadar(): Promise<RadarEntry[]> {
  const prefs = getPrefs();
  const year = seasonYear(prefs.targetSeason);
  const feed = await getFeed();
  const now = Date.now();

  // Index live listings by normalized company for state detection.
  const feedByCo = new Map<string, { id: string; season?: string; title: string; url: string; location: string | null; datePosted?: number }[]>();
  for (const l of feed.listings) {
    const k = normName(l.company);
    const arr = feedByCo.get(k) ?? [];
    arr.push({ id: l.id, season: l.season, title: l.title, url: l.url, location: l.locations[0] ?? null, datePosted: l.datePosted });
    feedByCo.set(k, arr);
  }

  // First pass: forecast + live signals per company.
  const rows = getWatchlist()
    .filter((c) => c.priority !== "muted")
    .map((c) => {
      const forecast = forecastForCompany(c.name, year);
      const key = normName(c.name);
      const live = [...feedByCo.entries()]
        .filter(([k]) => k === key || (key.length >= 4 && (k.includes(key) || key.includes(k))))
        .flatMap(([, v]) => v);
      const openMatch = live.find((l) => (l.season ?? "").toLowerCase() === prefs.targetSeason.toLowerCase());
      const recent = live.find((l) => (l.datePosted ?? 0) * 1000 > now - 30 * DAY);
      const posted = live.map((l) => l.datePosted ?? 0).filter((t) => t > 0);
      const actualFirst = posted.length ? Math.min(...posted) * 1000 : null; // ms
      // Self-learning: remember this cycle's actual earliest post for future forecasts.
      if (actualFirst != null) recordOpen(key, seasonYearOf(actualFirst / 1000), Math.round(actualFirst / 1000));
      return { c, forecast, live, openMatch, recent, actualFirst };
    });

  // Cohort "cycle drift": measure how early/late THIS cycle is running vs history
  // (from companies that already posted) and apply it to the ones that haven't.
  const offsets: number[] = [];
  for (const r of rows) {
    if (!r.forecast || r.actualFirst == null || !(r.openMatch || r.recent)) continue;
    const off = r.actualFirst - r.forecast.typical;
    if (Math.abs(off) <= 60 * DAY) offsets.push(off);
  }
  let drift = 0;
  if (offsets.length >= 3) {
    const sorted = [...offsets].sort((a, b) => a - b);
    drift = Math.max(-21 * DAY, Math.min(21 * DAY, Math.round(sorted[Math.floor(sorted.length / 2)] * 0.75)));
  }
  const driftDays = Math.round(drift / DAY);

  // Second pass: build entries, shifting not-yet-open forecasts by the cohort drift.
  const entries: RadarEntry[] = [];
  for (const r of rows) {
    const c = r.c;
    const applyDrift = !!r.forecast && !r.openMatch && Math.abs(driftDays) >= 2;
    const forecast: ReleaseForecast | null = applyDrift && r.forecast
      ? { ...r.forecast, typical: r.forecast.typical + drift, windowStart: r.forecast.windowStart + drift, windowEnd: r.forecast.windowEnd + drift, outreachBy: r.forecast.outreachBy + drift }
      : r.forecast;
    const { openMatch, recent } = r;

    let state: RadarState;
    if (openMatch) state = "open";
    else if (recent) state = "signal";
    else if (forecast) state = "forecast";
    else state = "none";

    const prob = forecast ? probNext7(now, forecast) : 0;
    const daysUntil = forecast ? Math.round((forecast.windowStart - now) / DAY) : null;
    const daysUntilOutreach = forecast ? Math.round((forecast.outreachBy - now) / DAY) : null;
    const inWindow = forecast ? now >= forecast.windowStart && now <= forecast.windowEnd : false;

    let monitoring: RadarEntry["monitoring"] = "Low";
    if (state === "open") monitoring = "—";
    else if (inWindow || (daysUntil != null && daysUntil <= 14)) monitoring = "High";
    else if (daysUntil != null && daysUntil <= 30) monitoring = "Medium";
    if (monitoring === "High" && c.priority === "normal") monitoring = "Medium"; // frequent watch only for top tiers

    const reasons: string[] = [];
    if (forecast) {
      reasons.push(inWindow
        ? `In the likely opening window (${humanDate(forecast.windowStart)}–${humanDate(forecast.windowEnd)})`
        : daysUntil != null && daysUntil > 0
          ? `Likely window begins in ~${daysUntil} days (${humanDate(forecast.windowStart)})`
          : `Typical opening was ${humanDate(forecast.typical)} (window may have passed)`);
      if (state !== "open") {
        reasons.push(daysUntilOutreach != null && daysUntilOutreach > 0
          ? `Start reaching out by ${humanDate(forecast.outreachBy)} (~${daysUntilOutreach} days) — before the rush`
          : `Time to reach out — outreach window is open (target ${humanDate(forecast.windowStart)})`);
      }
      reasons.push(`Based on ${forecast.cycleCount} past cycle${forecast.cycleCount === 1 ? "" : "s"} (${forecast.sampleSize} roles) · ${forecast.confidence}% confidence`);
      if (forecast.trendDaysPerYear && Math.abs(forecast.trendDaysPerYear) >= 2) {
        reasons.push(`Trend: opening ~${Math.abs(forecast.trendDaysPerYear)} days ${forecast.trendDaysPerYear < 0 ? "earlier" : "later"} each year`);
      }
      if (applyDrift) {
        reasons.push(`Cohort signal: this cycle is running ~${Math.abs(driftDays)} days ${driftDays < 0 ? "early" : "late"} (${offsets.length} companies already open) — window shifted`);
      }
      if (openMatch && r.actualFirst != null) {
        const delta = Math.round((r.actualFirst - forecast.typical) / DAY);
        reasons.push(`Predicted ~${humanDate(forecast.typical)}, opened ${humanDate(r.actualFirst)} (${delta === 0 ? "on time" : `${Math.abs(delta)}d ${delta < 0 ? "early" : "late"}`})`);
      }
    } else {
      reasons.push("No historical data for this company yet — capturing this cycle");
    }
    if (state === "open") reasons.push("A target-season role is already posted");
    else if (state === "signal") reasons.push("This company already posted a role this cycle (early signal)");

    entries.push({
      company: c.name, priority: c.priority, state, forecast,
      probabilityNext7: prob, daysUntilWindow: daysUntil, daysUntilOutreach, monitoring,
      openListingUrl: openMatch?.url,
      openListing: openMatch ? { id: openMatch.id, title: openMatch.title, url: openMatch.url, location: openMatch.location } : undefined,
      reasons,
    });
  }

  // Sort: open first, then signal, then by soonest window / highest probability.
  const stateRank: Record<RadarState, number> = { open: 0, signal: 1, forecast: 2, none: 3 };
  entries.sort((a, b) =>
    stateRank[a.state] - stateRank[b.state] ||
    b.probabilityNext7 - a.probabilityNext7 ||
    (a.daysUntilWindow ?? 9999) - (b.daysUntilWindow ?? 9999));
  return entries;
}
