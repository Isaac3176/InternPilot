/**
 * Recruiting Diagnostics — reads the signals captured on each application (see
 * db/applications.ts v11) and computes a funnel, the same funnel segmented by
 * résumé / apply-timing / referral, and a rejection-timing histogram.
 *
 * Honesty is built in: every segment carries its sample size (the UI greys out
 * thin ones), and nothing here claims causation — these are associations in your
 * own data, full stop. Rows missing a signal are excluded from that view and
 * counted as "undated" so the numbers stay truthful.
 */
import type { ApplicationRow } from "../db/types";

const RANK: Record<string, number> = { interested: 0, applied: 1, oa: 2, interview: 3, offer: 4 };
const HOUR = 3_600_000;
const DAY = 86_400_000;
export const MIN_SEGMENT = 5; // below this a segment is flagged low-confidence

/** Deepest funnel stage an application ever reached (survives a later rejection). */
export function reachedRank(a: ApplicationRow): number {
  let r = -1;
  if (a.furthest_stage && RANK[a.furthest_stage] != null) r = RANK[a.furthest_stage];
  if (RANK[a.status] != null) r = Math.max(r, RANK[a.status]);
  if (r < 1 && (a.applied_at || a.date_applied)) r = 1; // has an apply date → at least Applied
  return Math.max(r, 0);
}

const parseTs = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};

export interface FunnelStage { key: string; label: string; count: number; rate: number }
export interface Segment {
  label: string;
  applied: number; oa: number; interview: number; offer: number;
  oaRate: number; interviewRate: number;
  thin: boolean; // sample too small to trust
}
export interface Bucket { label: string; count: number; hint?: string; kind?: "alert" | "muted" }
export interface Diagnostics {
  total: number;
  applied: number;
  funnel: FunnelStage[];
  byResume: Segment[];
  byTiming: Segment[];
  byReferral: Segment[];
  rejection: { buckets: Bucket[]; dated: number; undated: number };
  coverage: { timing: number; rejection: number }; // how many rows had enough signal
}

function segment(label: string, apps: ApplicationRow[]): Segment {
  const applied = apps.filter((a) => reachedRank(a) >= 1).length;
  const oa = apps.filter((a) => reachedRank(a) >= 2).length;
  const interview = apps.filter((a) => reachedRank(a) >= 3).length;
  const offer = apps.filter((a) => reachedRank(a) >= 4).length;
  return {
    label, applied, oa, interview, offer,
    oaRate: applied ? oa / applied : 0,
    interviewRate: applied ? interview / applied : 0,
    thin: applied < MIN_SEGMENT,
  };
}

function groupBy(apps: ApplicationRow[], keyOf: (a: ApplicationRow) => string): Segment[] {
  const groups = new Map<string, ApplicationRow[]>();
  for (const a of apps) {
    const k = keyOf(a);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(a);
  }
  return [...groups.entries()]
    .map(([label, rows]) => segment(label, rows))
    .filter((s) => s.applied > 0)
    .sort((a, b) => b.applied - a.applied);
}

const hasReferral = (a: ApplicationRow): boolean => {
  const r = (a.referral ?? "").trim().toLowerCase();
  return !!r && r !== "none" && r !== "no" && r !== "no referral";
};

export function computeDiagnostics(apps: ApplicationRow[], now = Date.now()): Diagnostics {
  const applied = apps.filter((a) => reachedRank(a) >= 1);
  const oa = apps.filter((a) => reachedRank(a) >= 2).length;
  const interview = apps.filter((a) => reachedRank(a) >= 3).length;
  const offer = apps.filter((a) => reachedRank(a) >= 4).length;
  const base = applied.length;
  const funnel: FunnelStage[] = [
    { key: "applied", label: "Applied", count: base, rate: 1 },
    { key: "oa", label: "OA", count: oa, rate: base ? oa / base : 0 },
    { key: "interview", label: "Interview", count: interview, rate: base ? interview / base : 0 },
    { key: "offer", label: "Offer", count: offer, rate: base ? offer / base : 0 },
  ];

  // By résumé (applied rows only).
  const byResume = groupBy(applied, (a) => a.resume_version_name ?? "No résumé attached");

  // By apply timing: applied_at − discovered_at. Only rows that carry both.
  const timed = applied.filter((a) => parseTs(a.applied_at) != null && parseTs(a.discovered_at) != null);
  const byTiming = groupBy(timed, (a) => {
    const h = (parseTs(a.applied_at)! - parseTs(a.discovered_at)!) / HOUR;
    return h < 24 ? "Within 24 hours" : h < 72 ? "1–3 days" : "3+ days";
  });
  // Keep a natural order.
  const timingOrder = ["Within 24 hours", "1–3 days", "3+ days"];
  byTiming.sort((a, b) => timingOrder.indexOf(a.label) - timingOrder.indexOf(b.label));

  // By referral.
  const byReferral = groupBy(applied, (a) => (hasReferral(a) ? "Confirmed referral" : "No referral"));

  // Rejection timing: result_date − apply start. Plus a "No response" bucket.
  const rejStart = (a: ApplicationRow) => parseTs(a.applied_at) ?? parseTs(a.date_applied) ?? parseTs(a.discovered_at);
  const rejected = apps.filter((a) => a.status === "rejected");
  const datedRej = rejected.filter((a) => parseTs(a.result_date) != null && rejStart(a) != null);
  const undated = rejected.length - datedRej.length;
  const b = { lt1h: 0, lt24h: 0, lt7d: 0, lt30d: 0, gt30d: 0 };
  let negRej = 0;
  for (const a of datedRej) {
    const d = parseTs(a.result_date)! - rejStart(a)!;
    if (d < 0) { negRej++; continue; } // result dated before apply — data ordering, not an instant screen
    if (d < HOUR) b.lt1h++;
    else if (d < DAY) b.lt24h++;
    else if (d < 7 * DAY) b.lt7d++;
    else if (d < 30 * DAY) b.lt30d++;
    else b.gt30d++;
  }
  const noResponse = apps.filter((a) => {
    if (a.status !== "applied") return false;
    const start = rejStart(a);
    return start != null && now - start >= 14 * DAY;
  }).length;
  const rejection = {
    buckets: [
      { label: "< 1 hour", count: b.lt1h, hint: "instant — likely an automated eligibility screen, not a recruiter read", kind: "alert" as const },
      { label: "1–24 hours", count: b.lt24h },
      { label: "1–7 days", count: b.lt7d },
      { label: "7–30 days", count: b.lt30d },
      { label: "30+ days", count: b.gt30d },
      { label: "No response (14d+)", count: noResponse, kind: "muted" as const },
    ],
    dated: datedRej.length - negRej,
    undated: undated + negRej,
  };

  return {
    total: apps.length,
    applied: base,
    funnel, byResume, byTiming, byReferral, rejection,
    coverage: { timing: timed.length, rejection: datedRej.length },
  };
}
