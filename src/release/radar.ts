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
import { forecastForCompany, normName, type ReleaseForecast } from "./history";

export type RadarState = "open" | "signal" | "forecast" | "none";

export interface RadarEntry {
  company: string;
  priority: CompanyPriority;
  state: RadarState;
  forecast: ReleaseForecast | null;
  probabilityNext7: number; // 0-1
  daysUntilWindow: number | null; // to window start; negative if inside/after
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

  const entries: RadarEntry[] = [];
  for (const c of getWatchlist()) {
    if (c.priority === "muted") continue;
    const forecast = forecastForCompany(c.name, year);
    const key = normName(c.name);
    const live = [...feedByCo.entries()]
      .filter(([k]) => k === key || (key.length >= 4 && (k.includes(key) || key.includes(k))))
      .flatMap(([, v]) => v);

    const openMatch = live.find((l) => (l.season ?? "").toLowerCase() === prefs.targetSeason.toLowerCase());
    const recent = live.find((l) => (l.datePosted ?? 0) * 1000 > now - 30 * DAY);

    let state: RadarState;
    if (openMatch) state = "open";
    else if (recent) state = "signal";
    else if (forecast) state = "forecast";
    else state = "none";

    const prob = forecast ? probNext7(now, forecast) : 0;
    const daysUntil = forecast ? Math.round((forecast.windowStart - now) / DAY) : null;
    const inWindow = forecast ? now >= forecast.windowStart && now <= forecast.windowEnd : false;

    let monitoring: RadarEntry["monitoring"] = "Low";
    if (state === "open") monitoring = "—";
    else if (inWindow || (daysUntil != null && daysUntil <= 14)) monitoring = "High";
    else if (daysUntil != null && daysUntil <= 30) monitoring = "Medium";
    if ((monitoring === "High") && c.priority === "normal") monitoring = "Medium"; // frequent watch only for top tiers

    const reasons: string[] = [];
    if (forecast) {
      reasons.push(inWindow
        ? `In the historical opening window (${humanDate(forecast.windowStart)}–${humanDate(forecast.windowEnd)})`
        : daysUntil != null && daysUntil > 0
          ? `Historical window begins in ~${daysUntil} days (${humanDate(forecast.windowStart)})`
          : `Typical opening was ${humanDate(forecast.typical)} (window may have passed)`);
      reasons.push(`Based on ${forecast.cycleCount} past cycle${forecast.cycleCount === 1 ? "" : "s"} (${forecast.sampleSize} roles)`);
    } else {
      reasons.push("No historical data for this company yet — capturing this cycle");
    }
    if (state === "open") reasons.push("A target-season role is already posted");
    else if (state === "signal") reasons.push("This company already posted a role this cycle (early signal)");

    entries.push({
      company: c.name,
      priority: c.priority,
      state,
      forecast,
      probabilityNext7: prob,
      daysUntilWindow: daysUntil,
      monitoring,
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
