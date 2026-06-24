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
