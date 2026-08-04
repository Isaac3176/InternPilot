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
  windowStart: number; // earliest observed, mapped to upcoming cycle (ms)
  windowEnd: number; // latest observed, mapped (ms)
  earliest: number;
  latest: number;
  confidence: number; // 0-100
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
function stdevDays(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const varr = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(varr) / DAY;
}

function forecastFor(rec: CompanyRecord, family: RoleFamily, targetYear: number): ReleaseForecast | null {
  const seasons = rec.fam[family];
  if (!seasons) return null;
  const cycles = Object.values(seasons);
  if (cycles.length === 0) return null;

  const mapped = cycles.map((c) => toCycleDate(c.e, targetYear)).sort((a, b) => a - b);
  const cycleCount = mapped.length;
  const sampleSize = cycles.reduce((s, c) => s + c.n, 0);

  const spread = stdevDays(mapped);
  const cyclesScore = Math.min(cycleCount / 4, 1) * 45;
  const consistencyScore = (1 - Math.min(spread / 30, 1)) * 35;
  const confidence = Math.round(Math.min(97, 12 + cyclesScore + consistencyScore));

  return {
    companyKey: normName(rec.name),
    company: rec.name,
    family,
    cycleCount,
    sampleSize,
    typical: median(mapped),
    windowStart: mapped[0],
    windowEnd: mapped[mapped.length - 1],
    earliest: mapped[0],
    latest: mapped[mapped.length - 1],
    confidence,
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
