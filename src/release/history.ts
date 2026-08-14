/**
 * Release history: forecast a company's typical opening window for a role
 * family from MULTIPLE past recruiting cycles.
 *
 * The dataset (release-history.json) is precomputed offline by snapshot-sampling
 * the SimplifyJobs repo's git history across cycles (see scripts/build-release-
 * history.mjs) — each role carries a real date_posted, so we get the first-post
 * date per company/family/season. We map each cycle's month/day onto the
 * upcoming cycle; confidence rises with more cycles and tighter agreement.
 */
import bundle from "./release-history.json";
import { getObserved } from "./observed";

export type RoleFamily = "software" | "ml-data" | "hardware" | "quant" | "other";

interface CycleStat { e: number; n: number } // earliest posting (unix s), role count
interface CompanyRecord { name: string; fam: Record<string, Record<string, CycleStat>> }
interface Bundle { generatedAt: string; source: string; companies: Record<string, CompanyRecord> }

const DATA = bundle as unknown as Bundle;
export const HISTORY_GENERATED_AT = DATA.generatedAt;
export const HISTORY_SOURCE = DATA.source;

export interface ReleaseForecast {
  companyKey: string;
  company: string;
  family: RoleFamily;
  cycleCount: number; // number of past cycles observed
  sampleSize: number; // total roles across cycles
  typical: number; // predicted typical opening (ms) in the upcoming cycle
  windowStart: number; // predictive interval start, mapped to upcoming cycle (ms)
  windowEnd: number; // predictive interval end (ms)
  earliest: number; // earliest observed (mapped)
  latest: number; // latest observed (mapped)
  outreachBy: number; // when to START reaching out — the early edge minus a lead (ms)
  confidence: number; // 0-100, calibrated by leave-one-out backtest
  trendDaysPerYear?: number; // negative = opening earlier each year
}

export function normName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const DAY = 86_400_000;

/** Map a historical timestamp to the same month/day in the upcoming cycle. */
function toCycleDate(tsSeconds: number, targetYear: number): number {
  const d = new Date(tsSeconds * 1000);
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  // Recruiting calendar: Aug–Dec belong to the year before the season.
  const yr = m >= 7 ? targetYear - 1 : targetYear;
  return Date.UTC(yr, m, day);
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 ? sorted[(n - 1) / 2] : Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2);
}

/** The recruiting-cycle (season) year a posting belongs to: Aug–Dec roll to next year. */
export function seasonYearOf(tsSeconds: number): number {
  const d = new Date(tsSeconds * 1000);
  return d.getUTCMonth() >= 7 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}

const RECENCY = 0.65; // weight decay per cycle into the past
export const OUTREACH_LEAD_DAYS = 14; // start reaching out this far before the early edge
interface Cycle { e: number; year: number; n: number }

// ── cohort prior: a typical opening date from all well-observed companies, so a
//    company with only one cycle can borrow strength instead of guessing wildly ──
const priorCache = new Map<number, { typical: number; spreadDays: number } | null>();
function globalPrior(targetYear: number): { typical: number; spreadDays: number } | null {
  const cached = priorCache.get(targetYear);
  if (cached !== undefined) return cached;
  const typicals: number[] = [];
  for (const rec of Object.values(DATA.companies)) {
    const fam = rec.fam["software"] ?? rec.fam["ml-data"];
    if (!fam) continue;
    const cs = Object.values(fam);
    if (cs.length < 2) continue; // only multi-cycle companies inform the prior
    const pts = cs.map((c) => ({ mapped: toCycleDate(c.e, targetYear), year: seasonYearOf(c.e) }));
    const mx = Math.max(...pts.map((p) => p.year));
    const w = pts.map((p) => Math.pow(RECENCY, mx - p.year));
    const ws = w.reduce((a, b) => a + b, 0);
    typicals.push(pts.reduce((a, p, i) => a + p.mapped * w[i], 0) / ws);
  }
  let res: { typical: number; spreadDays: number } | null = null;
  if (typicals.length >= 8) {
    const sorted = [...typicals].sort((a, b) => a - b);
    const mean = typicals.reduce((a, b) => a + b, 0) / typicals.length;
    const sd = Math.sqrt(typicals.reduce((a, b) => a + (b - mean) ** 2, 0) / typicals.length) / DAY;
    res = { typical: sorted[Math.floor(sorted.length / 2)], spreadDays: sd };
  }
  priorCache.set(targetYear, res);
  return res;
}

function computeForecast(name: string, family: RoleFamily, cycles: Cycle[], targetYear: number): ReleaseForecast {
  const pts = cycles
    .map((c) => ({ mapped: toCycleDate(c.e, targetYear), year: c.year }))
    .sort((a, b) => a.year - b.year);
  const cycleCount = pts.length;
  const sampleSize = cycles.reduce((s, c) => s + (c.n || 1), 0);
  const maxYear = pts[pts.length - 1].year;

  const w = pts.map((p) => Math.pow(RECENCY, maxYear - p.year));
  const wsum = w.reduce((a, b) => a + b, 0);
  const wmean = pts.reduce((a, p, i) => a + p.mapped * w[i], 0) / wsum;

  let typical = wmean;
  let trendDaysPerYear = 0;
  if (cycleCount >= 3) {
    const xbar = pts.reduce((a, p, i) => a + p.year * w[i], 0) / wsum;
    let num = 0, den = 0;
    pts.forEach((p, i) => { num += w[i] * (p.year - xbar) * (p.mapped - wmean); den += w[i] * (p.year - xbar) ** 2; });
    if (den > 0) {
      const maxSlope = 20 * DAY;
      const slope = Math.max(-maxSlope, Math.min(maxSlope, num / den));
      trendDaysPerYear = Math.round(slope / DAY);
      typical = 0.6 * (wmean + slope * (targetYear - xbar)) + 0.4 * wmean;
    }
  }

  // Tighter predictive band (a ~central estimate, not the full range) — companies
  // with real data get a narrow, actionable window; sparse ones widen honestly.
  const wvar = pts.reduce((a, p, i) => a + w[i] * (p.mapped - wmean) ** 2, 0) / wsum;
  let halfWidthDays = Math.max(4, 0.7 * (Math.sqrt(wvar) / DAY) + 8 / cycleCount);

  // Cohort shrinkage: for 1–2 cycle companies, pull toward the prior (fades to 0 at 3+ cycles).
  const prior = globalPrior(targetYear);
  const priorW = Math.max(0, 3 - cycleCount);
  let shrunk = false;
  if (prior && priorW > 0) {
    typical = (typical * cycleCount + prior.typical * priorW) / (cycleCount + priorW);
    halfWidthDays = Math.max(halfWidthDays, prior.spreadDays * 0.6); // don't claim tighter than the cohort
    shrunk = true;
  }
  const halfWidth = halfWidthDays * DAY;
  const windowStart = Math.round(typical - halfWidth);
  const mappedSorted = pts.map((p) => p.mapped).sort((a, b) => a - b);

  let confidence: number;
  if (cycleCount >= 2) {
    const errs: number[] = [];
    for (let i = 0; i < cycleCount; i++) {
      let n2 = 0, d2 = 0;
      pts.forEach((p, j) => { if (j === i) return; const ww = Math.pow(RECENCY, maxYear - p.year); n2 += ww * p.mapped; d2 += ww; });
      errs.push(Math.abs(n2 / d2 - pts[i].mapped) / DAY);
    }
    errs.sort((a, b) => a - b);
    const accuracy = Math.max(0, 1 - median(errs) / 30);
    confidence = Math.round(Math.min(95, 12 + Math.min(cycleCount / 5, 1) * 30 + accuracy * 48));
  } else {
    confidence = Math.min(38, 18 + Math.min(sampleSize, 20));
    if (shrunk) confidence = Math.min(50, confidence + 8); // anchored to a real cohort prior
  }

  return {
    companyKey: normName(name), company: name, family, cycleCount, sampleSize,
    typical: Math.round(typical),
    windowStart,
    windowEnd: Math.round(typical + halfWidth),
    earliest: mappedSorted[0],
    latest: mappedSorted[mappedSorted.length - 1],
    outreachBy: windowStart - OUTREACH_LEAD_DAYS * DAY,
    confidence, trendDaysPerYear,
  };
}

/** Static bundle cycles for a company's best-sampled family. */
function staticCycles(rec: CompanyRecord): { family: RoleFamily; cycles: Cycle[] } {
  const family: RoleFamily = rec.fam["software"] ? "software" : rec.fam["ml-data"] ? "ml-data" : "software";
  const fam = rec.fam[family];
  const cycles = fam ? Object.values(fam).map((c) => ({ e: c.e, year: seasonYearOf(c.e), n: c.n })) : [];
  return { family, cycles };
}

/**
 * Forecast for a company: merges the static history bundle with dates the app has
 * actually observed from your feed (observed cycles override the bundle for that
 * year), then shrinks sparse companies toward the cohort prior.
 */
export function forecastForCompany(companyName: string, targetYear: number): ReleaseForecast | null {
  const key = normName(companyName);
  let rec: CompanyRecord | undefined = DATA.companies[key];
  if (!rec) {
    const hit = Object.entries(DATA.companies).find(([k]) => key.length >= 4 && (k.includes(key) || key.includes(k)));
    rec = hit?.[1];
  }
  const base = rec ? staticCycles(rec) : { family: "software" as RoleFamily, cycles: [] as Cycle[] };
  const observed = getObserved(key).filter((o) => o.year < targetYear).map((o) => ({ e: o.e, year: o.year, n: 1 }));

  const byYear = new Map<number, Cycle>();
  for (const c of base.cycles) byYear.set(c.year, c);
  for (const o of observed) byYear.set(o.year, o); // your real feed overrides the bundle for that cycle
  const cycles = [...byYear.values()];
  if (cycles.length === 0) return null;

  return computeForecast(rec?.name ?? companyName, base.family, cycles, targetYear);
}

export function confidenceLabel(c: number): string {
  if (c >= 85) return "Strong historical pattern";
  if (c >= 65) return "Likely window";
  if (c >= 40) return "Limited evidence";
  return "Experimental estimate";
}
