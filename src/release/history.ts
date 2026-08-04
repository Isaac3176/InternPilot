/**
 * Release history: derive each company's *typical opening window* for a role
 * family from a prior recruiting cycle's dataset (SimplifyJobs carries a real
 * `date_posted` per role). We map last cycle's month/day onto the upcoming
 * cycle to forecast when a role is likely to open again.
 *
 * v1 uses one prior cycle (Summer 2026) — honest "limited evidence / likely
 * window" confidence. Multi-cycle depth (git-history crawl) is a later phase.
 */
import { httpFetch } from "../lib/http";

const K_HISTORY_URL = "internpilot.release.historyUrl";
const K_CACHE = "internpilot.release.forecastCache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Prior completed cycle (has real date_posted for Summer 2026 roles).
export const DEFAULT_HISTORY_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json";
export const REFERENCE_SEASON = "Summer 2026";

export function getHistoryUrl(): string {
  return localStorage.getItem(K_HISTORY_URL) || DEFAULT_HISTORY_URL;
}
export function setHistoryUrl(v: string): void {
  if (v) localStorage.setItem(K_HISTORY_URL, v);
  else localStorage.removeItem(K_HISTORY_URL);
}

export type RoleFamily = "software" | "ml-data" | "hardware" | "quant" | "other";

export interface ReleaseForecast {
  companyKey: string; // normalized name
  company: string; // display name
  family: RoleFamily;
  sampleSize: number;
  typical: number; // predicted "typical opening" date (ms) in the upcoming cycle
  windowStart: number; // 15th percentile (ms)
  windowEnd: number; // 85th percentile (ms)
  earliest: number;
  latest: number;
  confidence: number; // 0-100
}

interface SimplifyRow {
  company_name: string;
  title: string;
  category?: string;
  date_posted?: number;
  terms?: string[];
}

export function normName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function familyOf(category: string | undefined, title: string): RoleFamily {
  const c = `${category ?? ""} ${title}`.toLowerCase();
  if (/data|machine learning|\bml\b|\bai\b/.test(c)) return "ml-data";
  if (/hardware|firmware|embedded|electrical|asic|fpga/.test(c)) return "hardware";
  if (/quant/.test(c)) return "quant";
  if (/software|full[\s-]?stack|back[\s-]?end|front[\s-]?end|devops|\bsre\b|infrastructure|platform|security|systems|engineer|developer/.test(c)) return "software";
  return "other";
}

/** Map a historical timestamp to the same month/day in the upcoming cycle. */
function toCycleDate(ts: number, targetYear: number): number {
  const d = new Date(ts * 1000);
  const m = d.getUTCMonth(); // 0-11
  const day = d.getUTCDate();
  // Recruiting calendar: Aug–Dec belong to the year before the season.
  const yr = m >= 7 ? targetYear - 1 : targetYear;
  return Date.UTC(yr, m, day);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

/** Build per-(company, family) forecasts for the upcoming cycle. */
function computeForecasts(rows: SimplifyRow[], targetYear: number): ReleaseForecast[] {
  const groups = new Map<string, { company: string; family: RoleFamily; dates: number[] }>();
  for (const r of rows) {
    if (!r.date_posted || !r.company_name) continue;
    if (r.terms && !r.terms.some((t) => t.toLowerCase() === REFERENCE_SEASON.toLowerCase())) continue;
    const family = familyOf(r.category, r.title);
    const key = `${normName(r.company_name)}::${family}`;
    const g = groups.get(key) ?? { company: r.company_name, family, dates: [] };
    g.dates.push(toCycleDate(r.date_posted, targetYear));
    groups.set(key, g);
  }

  const out: ReleaseForecast[] = [];
  for (const [key, g] of groups) {
    const dates = g.dates.sort((a, b) => a - b);
    const n = dates.length;
    const sampleConf = Math.min(n / 5, 1) * 45; // more samples → more confidence
    out.push({
      companyKey: key.split("::")[0],
      company: g.company,
      family: g.family,
      sampleSize: n,
      typical: percentile(dates, 50),
      windowStart: percentile(dates, 15),
      windowEnd: percentile(dates, 85),
      earliest: dates[0],
      latest: dates[n - 1],
      // One cycle only → cap in the "limited evidence / likely window" band.
      confidence: Math.round(Math.min(70, 22 + sampleConf)),
    });
  }
  return out;
}

interface Cache { at: number; targetYear: number; forecasts: ReleaseForecast[] }

/** Fetch + compute (cached 24h) forecasts for the upcoming cycle's year. */
export async function getForecasts(targetYear: number): Promise<ReleaseForecast[]> {
  try {
    const raw = localStorage.getItem(K_CACHE);
    if (raw) {
      const c = JSON.parse(raw) as Cache;
      if (c.targetYear === targetYear && Date.now() - c.at < CACHE_TTL_MS) return c.forecasts;
    }
  } catch { /* ignore */ }

  const res = await httpFetch(getHistoryUrl());
  if (!res.ok) throw new Error(`History source responded ${res.status}`);
  const rows = (await res.json()) as SimplifyRow[];
  const forecasts = computeForecasts(rows, targetYear);
  try {
    localStorage.setItem(K_CACHE, JSON.stringify({ at: Date.now(), targetYear, forecasts } satisfies Cache));
  } catch { /* quota — skip caching */ }
  return forecasts;
}

export function confidenceLabel(c: number): string {
  if (c >= 85) return "Strong historical pattern";
  if (c >= 65) return "Likely window";
  if (c >= 40) return "Limited evidence";
  return "Experimental estimate";
}
