import { getDb } from "./index";
import { cloudMode, supabase } from "../cloud/supabase";
import { STATUSES, type Status } from "./types";

export type StatusCounts = Record<Status, number> & { total: number };

export async function getStatusCounts(): Promise<StatusCounts> {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  let total = 0;
  if (cloudMode()) {
    const { data } = await supabase.from("applications").select("status");
    for (const r of data ?? []) { const s = r.status as Status; if (s in counts) counts[s] += 1; total += 1; }
    return { ...counts, total };
  }
  const db = await getDb();
  const rows = await db.select<{ status: Status; count: number }[]>(
    "SELECT status, COUNT(*) AS count FROM applications GROUP BY status",
  );
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

export interface ReferralStats {
  referred: number;
  total: number;
  rate: number; // percent of applications that had a referral
}

export async function getReferralStats(): Promise<ReferralStats> {
  if (cloudMode()) {
    const { data } = await supabase.from("applications").select("referral");
    let referred = 0; const total = (data ?? []).length;
    for (const r of data ?? []) if (r.referral && String(r.referral).trim()) referred += 1;
    return { referred, total, rate: total > 0 ? Math.round((referred / total) * 100) : 0 };
  }
  const db = await getDb();
  const rows = await db.select<{ referred: number; total: number }[]>(
    `SELECT
       SUM(CASE WHEN referral IS NOT NULL AND TRIM(referral) <> '' THEN 1 ELSE 0 END) AS referred,
       COUNT(*) AS total
     FROM applications`,
  );
  const referred = rows[0]?.referred ?? 0;
  const total = rows[0]?.total ?? 0;
  return { referred, total, rate: total > 0 ? Math.round((referred / total) * 100) : 0 };
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
  if (cloudMode()) {
    const [{ data: versions }, { data: apps }] = await Promise.all([
      supabase.from("resume_versions").select("id, name"),
      supabase.from("applications").select("resume_version_id, status"),
    ]);
    return (versions ?? []).map((v) => {
      const rel = (apps ?? []).filter((a) => a.resume_version_id === v.id);
      return {
        id: v.id as number, name: v.name as string, total: rel.length,
        reachedOa: rel.filter((a) => ["oa", "interview", "offer"].includes(a.status)).length,
        reachedInterview: rel.filter((a) => ["interview", "offer"].includes(a.status)).length,
        offers: rel.filter((a) => a.status === "offer").length,
      };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }
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

export interface OutreachBucket {
  key: "none" | "outreach" | "referral" | "alumni_referral";
  label: string;
  count: number;    // applications in this bucket (the denominator)
  oaRate: number;   // reached OA or better
  interviewRate: number;
  offerRate: number;
}

const AGREED_STATUSES = ["referral_agreed", "referral_submitted", "referral_confirmed", "applied_through_referral"];
const SENT_STATUSES = ["outreach_sent", "follow_up_due", "contact_responded", ...AGREED_STATUSES, "declined", "no_response", "expired"];

/**
 * Outcome rates by how much outreach an application had: none / employee outreach /
 * referral / alumni referral. Correlational, not causal — read with the sample sizes.
 */
export async function getConversionByOutreach(): Promise<OutreachBucket[]> {
  let apps: { id: number; status: Status; referral: string | null }[];
  let refs: { application_id: number | null; contact_id: number | null; status: string }[];
  let contacts: { id: number; relationship_type: string | null }[];

  if (cloudMode()) {
    const [{ data: a }, { data: r }, { data: c }] = await Promise.all([
      supabase.from("applications").select("id, status, referral"),
      supabase.from("referrals").select("application_id, contact_id, status"),
      supabase.from("contacts").select("id, relationship_type"),
    ]);
    apps = (a ?? []) as typeof apps;
    refs = (r ?? []) as typeof refs;
    contacts = (c ?? []) as typeof contacts;
  } else {
    const db = await getDb();
    [apps, refs, contacts] = await Promise.all([
      db.select<typeof apps>("SELECT id, status, referral FROM applications"),
      db.select<typeof refs>("SELECT application_id, contact_id, status FROM referrals"),
      db.select<typeof contacts>("SELECT id, relationship_type FROM contacts"),
    ]);
  }

  const relById = new Map(contacts.map((c) => [c.id, c.relationship_type]));
  const refsByApp = new Map<number, typeof refs>();
  for (const r of refs) if (r.application_id != null) (refsByApp.get(r.application_id) ?? refsByApp.set(r.application_id, []).get(r.application_id)!).push(r);

  const buckets: Record<OutreachBucket["key"], Status[]> = { none: [], outreach: [], referral: [], alumni_referral: [] };
  for (const app of apps) {
    const rs = refsByApp.get(app.id) ?? [];
    const agreed = rs.filter((r) => AGREED_STATUSES.includes(r.status));
    const hasReferral = agreed.length > 0 || !!(app.referral && app.referral.trim());
    const isAlumni = agreed.some((r) => r.contact_id != null && relById.get(r.contact_id) === "alumnus");
    const hasOutreach = rs.some((r) => SENT_STATUSES.includes(r.status));
    const key: OutreachBucket["key"] = isAlumni && hasReferral ? "alumni_referral" : hasReferral ? "referral" : hasOutreach ? "outreach" : "none";
    buckets[key].push(app.status);
  }

  const LABEL: Record<OutreachBucket["key"], string> = {
    none: "No outreach", outreach: "Employee outreach", referral: "Confirmed referral", alumni_referral: "Alumni referral",
  };
  const rate = (rows: Status[], reached: Status[]) => (rows.length ? Math.round((rows.filter((s) => reached.includes(s)).length / rows.length) * 100) : 0);
  return (Object.keys(buckets) as OutreachBucket["key"][]).map((key) => {
    const rows = buckets[key];
    return {
      key, label: LABEL[key], count: rows.length,
      oaRate: rate(rows, ["oa", "interview", "offer"]),
      interviewRate: rate(rows, ["interview", "offer"]),
      offerRate: rate(rows, ["offer"]),
    };
  });
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
  let rows: { d: string }[];
  if (cloudMode()) {
    const { data } = await supabase.from("applications").select("date_applied, date_saved");
    rows = (data ?? [])
      .map((r) => ({ d: (r.date_applied ?? r.date_saved) as string }))
      .filter((r) => !!r.d);
  } else {
    const db = await getDb();
    rows = await db.select<{ d: string }[]>(
      "SELECT COALESCE(date_applied, date_saved) AS d FROM applications WHERE COALESCE(date_applied, date_saved) IS NOT NULL",
    );
  }

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
