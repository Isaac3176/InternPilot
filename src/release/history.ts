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
function seasonYearOf(tsSeconds: number): number {
  const d = new Date(tsSeconds * 1000);
  return d.getUTCMonth() >= 7 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}

const RECENCY = 0.65; // weight decay per cycle into the past

function forecastFor(rec: CompanyRecord, family: RoleFamily, targetYear: number): ReleaseForecast | null {
  const seasons = rec.fam[family];
  if (!seasons) return null;
  const cycles = Object.values(seasons);
  if (cycles.length === 0) return null;

  // Each cycle → its earliest posting mapped onto the upcoming calendar, tagged with its season year.
  const pts = cycles
    .map((c) => ({ mapped: toCycleDate(c.e, targetYear), year: seasonYearOf(c.e) }))
    .sort((a, b) => a.year - b.year);
  const cycleCount = pts.length;
  const sampleSize = cycles.reduce((s, c) => s + c.n, 0);
  const maxYear = pts[pts.length - 1].year;

  // Recency-weighted mean (recent cycles matter more).
  const w = pts.map((p) => Math.pow(RECENCY, maxYear - p.year));
  const wsum = w.reduce((a, b) => a + b, 0);
  const wmean = pts.reduce((a, p, i) => a + p.mapped * w[i], 0) / wsum;

  // Trend: weighted linear regression of date-on-year, extrapolated to the target cycle.
  let typical = wmean;
  let trendDaysPerYear = 0;
  if (cycleCount >= 3) {
    const xbar = pts.reduce((a, p, i) => a + p.year * w[i], 0) / wsum;
    let num = 0, den = 0;
    pts.forEach((p, i) => { num += w[i] * (p.year - xbar) * (p.mapped - wmean); den += w[i] * (p.year - xbar) ** 2; });
    if (den > 0) {
      const maxSlope = 20 * DAY; // clamp so a wild 2-point slope can't run away
      const slope = Math.max(-maxSlope, Math.min(maxSlope, num / den));
      trendDaysPerYear = Math.round(slope / DAY);
      const trendPred = wmean + slope * (targetYear - xbar);
      typical = 0.6 * trendPred + 0.4 * wmean;
    }
  }

  // Predictive window = real spread + a small-sample penalty (fewer cycles → wider, honest window).
  const wvar = pts.reduce((a, p, i) => a + w[i] * (p.mapped - wmean) ** 2, 0) / wsum;
  const halfWidth = Math.max(5, Math.sqrt(wvar) / DAY + 16 / cycleCount) * DAY;

  const mappedSorted = pts.map((p) => p.mapped).sort((a, b) => a - b);

  // Confidence, calibrated by leave-one-out backtest: predict each cycle from the others.
  let confidence: number;
  if (cycleCount >= 2) {
    const errs: number[] = [];
    for (let i = 0; i < cycleCount; i++) {
      let n2 = 0, d2 = 0;
      pts.forEach((p, j) => { if (j === i) return; const ww = Math.pow(RECENCY, maxYear - p.year); n2 += ww * p.mapped; d2 += ww; });
      errs.push(Math.abs(n2 / d2 - pts[i].mapped) / DAY);
    }
    errs.sort((a, b) => a - b);
    const accuracy = Math.max(0, 1 - median(errs) / 30); // 1 at 0d LOO error, 0 at ≥30d
    confidence = Math.round(Math.min(95, 12 + Math.min(cycleCount / 5, 1) * 30 + accuracy * 48));
  } else {
    confidence = Math.min(38, 18 + Math.min(sampleSize, 20)); // one cycle → honestly low
  }

  return {
    companyKey: normName(rec.name), company: rec.name, family, cycleCount, sampleSize,
    typical: Math.round(typical),
    windowStart: Math.round(typical - halfWidth),
    windowEnd: Math.round(typical + halfWidth),
    earliest: mappedSorted[0],
    latest: mappedSorted[mappedSorted.length - 1],
    confidence, trendDaysPerYear,
  };
}

/** Best forecast for a company name (prefers software, then ml-data). */
export function forecastForCompany(companyName: string, targetYear: number): ReleaseForecast | null {
  const key = normName(companyName);
  let rec = DATA.companies[key];
  if (!rec) {
    const hit = Object.entries(DATA.companies).find(
      ([k]) => key.length >= 4 && (k.includes(key) || key.includes(k)));
    rec = hit?.[1] as CompanyRecord | undefined ?? undefined as unknown as CompanyRecord;
  }
  if (!rec) return null;
  return forecastFor(rec, "software", targetYear) ?? forecastFor(rec, "ml-data", targetYear);
}

export function confidenceLabel(c: number): string {
  if (c >= 85) return "Strong historical pattern";
  if (c >= 65) return "Likely window";
  if (c >= 40) return "Limited evidence";
  return "Experimental estimate";
}
