import { getDb } from "./index";
import { STATUSES, type Status } from "./types";

export type StatusCounts = Record<Status, number> & { total: number };

export async function getStatusCounts(): Promise<StatusCounts> {
  const db = await getDb();
  const rows = await db.select<{ status: Status; count: number }[]>(
    "SELECT status, COUNT(*) AS count FROM applications GROUP BY status",
  );

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  let total = 0;
  for (const row of rows) {
    if (row.status in counts) counts[row.status] = row.count;
    total += row.count;
  }
  return { ...counts, total };
}

export interface FunnelRates {
  responseRate: number; // any movement past "applied"
  oaRate: number;
  interviewRate: number;
  offerRate: number;
}

/** Conversion rates relative to applications that were actually submitted. */
export async function getFunnelRates(): Promise<FunnelRates> {
  const counts = await getStatusCounts();
  // "Applied" denominator = everything that left the "interested" stage.
  const applied = counts.total - counts.interested;
  const pct = (n: number) => (applied > 0 ? Math.round((n / applied) * 100) : 0);

  // Reaching a later stage implies passing earlier ones, but since status is a
  // single current value we approximate using current-stage counts.
  const reachedOa = counts.oa + counts.interview + counts.offer;
  const reachedInterview = counts.interview + counts.offer;
  const responded = reachedOa + counts.rejected;

  return {
    responseRate: pct(responded),
    oaRate: pct(reachedOa),
    interviewRate: pct(reachedInterview),
    offerRate: pct(counts.offer),
  };
}

export interface ResumeVersionPerf {
  id: number;
  name: string;
  total: number;
  reachedOa: number;
  reachedInterview: number;
  offers: number;
}

/** Per-resume-version funnel performance, to answer "which resume works best?". */
export async function getResumeVersionPerformance(): Promise<ResumeVersionPerf[]> {
  const db = await getDb();
  const rows = await db.select<
    { id: number; name: string; total: number; reached_oa: number; reached_interview: number; offers: number }[]
  >(
    `SELECT r.id, r.name,
       COUNT(a.id) AS total,
       SUM(CASE WHEN a.status IN ('oa','interview','offer') THEN 1 ELSE 0 END) AS reached_oa,
       SUM(CASE WHEN a.status IN ('interview','offer') THEN 1 ELSE 0 END) AS reached_interview,
       SUM(CASE WHEN a.status = 'offer' THEN 1 ELSE 0 END) AS offers
     FROM resume_versions r
     LEFT JOIN applications a ON a.resume_version_id = r.id
     GROUP BY r.id, r.name
     ORDER BY total DESC, r.name ASC`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    total: r.total,
    reachedOa: r.reached_oa,
    reachedInterview: r.reached_interview,
    offers: r.offers,
  }));
}

export interface WeekBucket {
  label: string;
  count: number;
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const mondayOffset = (date.getDay() + 6) % 7; // Monday = 0
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

/** Applications per week (by date applied, falling back to date saved) for the last N weeks. */
export async function getWeeklyApplications(weeks = 8): Promise<WeekBucket[]> {
  const db = await getDb();
  const rows = await db.select<{ d: string }[]>(
    "SELECT COALESCE(date_applied, date_saved) AS d FROM applications WHERE COALESCE(date_applied, date_saved) IS NOT NULL",
  );

  const thisWeekStart = startOfWeek(new Date());
  const buckets: { start: number; label: string; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - i * 7);
    buckets.push({
      start: start.getTime(),
      label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: 0,
    });
  }

  const firstStart = buckets[0].start;
  for (const row of rows) {
    const t = new Date(row.d).getTime();
    if (Number.isNaN(t) || t < firstStart) continue;
    const idx = Math.floor((t - firstStart) / (7 * 24 * 60 * 60 * 1000));
    if (idx >= 0 && idx < buckets.length) buckets[idx].count++;
  }

  return buckets.map((b) => ({ label: b.label, count: b.count }));
}
