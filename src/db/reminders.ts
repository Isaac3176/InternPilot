import { getDb } from "./index";
import { INTERVIEW_TYPE_LABELS, type InterviewType } from "./types";

export interface Reminder {
  /** Stable key so we can avoid re-notifying for the same reminder. */
  key: string;
  kind: "followup" | "interview";
  title: string;
  detail: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Compute actionable reminders:
 * - follow-ups: applications still in "applied" with no response after N days
 * - upcoming interviews/OAs scheduled within the next N days
 */
export async function getReminders(opts?: {
  followupDays?: number;
  upcomingDays?: number;
}): Promise<Reminder[]> {
  const followupDays = opts?.followupDays ?? 10;
  const upcomingDays = opts?.upcomingDays ?? 7;
  const db = await getDb();
  const now = new Date();
  const reminders: Reminder[] = [];

  const stale = await db.select<
    { id: number; role_title: string; company_name: string | null; date_applied: string }[]
  >(
    `SELECT a.id, a.role_title, c.name AS company_name, a.date_applied
     FROM applications a
     LEFT JOIN companies c ON c.id = a.company_id
     WHERE a.status = 'applied' AND a.date_applied IS NOT NULL`,
  );
  for (const a of stale) {
    const applied = new Date(a.date_applied);
    if (Number.isNaN(applied.getTime())) continue;
    const elapsed = daysBetween(applied, now);
    if (elapsed >= followupDays) {
      reminders.push({
        key: `followup-${a.id}`,
        kind: "followup",
        title: "Follow-up suggested",
        detail: `${a.company_name ?? "A company"} · ${a.role_title} — applied ${elapsed} days ago with no response.`,
      });
    }
  }

  const interviews = await db.select<
    { id: number; type: InterviewType; date: string | null; company_name: string | null; role_title: string | null }[]
  >(
    `SELECT i.id, i.type, i.date, c.name AS company_name, a.role_title
     FROM interviews i
     LEFT JOIN applications a ON a.id = i.application_id
     LEFT JOIN companies c ON c.id = a.company_id
     WHERE i.date IS NOT NULL`,
  );
  for (const iv of interviews) {
    const when = new Date(iv.date as string);
    if (Number.isNaN(when.getTime())) continue;
    const inDays = daysBetween(now, when);
    if (inDays >= 0 && inDays <= upcomingDays) {
      reminders.push({
        key: `interview-${iv.id}`,
        kind: "interview",
        title: `${INTERVIEW_TYPE_LABELS[iv.type]} ${inDays === 0 ? "today" : `in ${inDays} day(s)`}`,
        detail: `${iv.company_name ?? "A company"}${iv.role_title ? " · " + iv.role_title : ""} — ${iv.date}.`,
      });
    }
  }

  return reminders;
}
