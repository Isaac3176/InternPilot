import { isTauri } from "../lib/env";
import { getDb, validFk } from "./index";
import type { ReferralRow, ReferralStatus, Status } from "./types";

/** Null out any foreign-key id that no longer references a live row. */
async function withValidFks(input: ReferralInput): Promise<ReferralInput> {
  return {
    ...input,
    contact_id: await validFk("contacts", input.contact_id),
    application_id: await validFk("applications", input.application_id),
    company_id: await validFk("companies", input.company_id),
  };
}

export interface ReferralInput {
  contact_id: number | null;
  application_id: number | null;
  company_id: number | null;
  status: ReferralStatus;
  first_contacted?: string | null;
  last_interaction?: string | null;
  next_follow_up?: string | null;
  confirmation_note?: string | null;
  referral_link?: string | null;
  thank_you_sent?: boolean;
  notes?: string | null;
}

export async function listReferrals(): Promise<ReferralRow[]> {
  if (!isTauri()) return []; // not migrated to cloud yet — empty in the web build
  const db = await getDb();
  return db.select<ReferralRow[]>(
    `SELECT r.*, ct.name AS contact_name, c.name AS company_name, a.role_title
     FROM referrals r
     LEFT JOIN contacts ct ON ct.id = r.contact_id
     LEFT JOIN companies c ON c.id = COALESCE(r.company_id, ct.company_id)
     LEFT JOIN applications a ON a.id = r.application_id
     ORDER BY (r.next_follow_up IS NULL), r.next_follow_up ASC, r.updated_at DESC`,
  );
}

function params(input: ReferralInput): unknown[] {
  return [
    input.contact_id,
    input.application_id,
    input.company_id,
    input.status,
    input.first_contacted ?? null,
    input.last_interaction ?? null,
    input.next_follow_up ?? null,
    input.confirmation_note ?? null,
    input.referral_link ?? null,
    input.thank_you_sent ? 1 : 0,
    input.notes ?? null,
  ];
}

export async function createReferral(input: ReferralInput): Promise<number | null> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO referrals
       (contact_id, application_id, company_id, status, first_contacted, last_interaction,
        next_follow_up, confirmation_note, referral_link, thank_you_sent, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params(await withValidFks(input)),
  );
  return res.lastInsertId ?? null;
}

export async function updateReferral(id: number, input: ReferralInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE referrals SET
       contact_id = ?, application_id = ?, company_id = ?, status = ?, first_contacted = ?,
       last_interaction = ?, next_follow_up = ?, confirmation_note = ?, referral_link = ?,
       thank_you_sent = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [...params(await withValidFks(input)), id],
  );
}

export async function setReferralStatus(id: number, status: ReferralStatus): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE referrals SET status = ?, last_interaction = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [status, id],
  );
}

export async function deleteReferral(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM referrals WHERE id = ?", [id]);
}

const SENT: ReferralStatus[] = [
  "outreach_sent", "follow_up_due", "contact_responded", "referral_agreed",
  "referral_submitted", "referral_confirmed", "applied_through_referral",
  "declined", "no_response", "expired",
];
const RESPONDED: ReferralStatus[] = [
  "contact_responded", "referral_agreed", "referral_submitted",
  "referral_confirmed", "applied_through_referral", "declined",
];
const AGREED: ReferralStatus[] = [
  "referral_agreed", "referral_submitted", "referral_confirmed", "applied_through_referral",
];
const CONFIRMED: ReferralStatus[] = ["referral_confirmed", "applied_through_referral"];
const TERMINAL: ReferralStatus[] = ["declined", "no_response", "expired", "applied_through_referral"];

export interface OutcomeRates {
  count: number;
  oaRate: number;
  interviewRate: number;
}

export interface NetworkingStats {
  totalPaths: number;
  outreachSent: number;
  responded: number;
  agreed: number;
  confirmed: number;
  requestResponseRate: number;
  agreementRate: number;
  confirmedRate: number;
  followUpsDue: number;
  withReferral: OutcomeRates;
  withoutReferral: OutcomeRates;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/**
 * Networking funnel + referral-vs-no-referral outcome rates. Rates are reported
 * alongside their denominators so the UI can flag small, unreliable samples.
 * Referral association is correlational, not causal.
 */
export async function getNetworkingStats(): Promise<NetworkingStats> {
  const db = await getDb();
  const refs = await db.select<{ status: ReferralStatus; next_follow_up: string | null }[]>(
    "SELECT status, next_follow_up FROM referrals",
  );

  const inSet = (set: ReferralStatus[], s: ReferralStatus) => set.includes(s);
  const outreachSent = refs.filter((r) => inSet(SENT, r.status)).length;
  const responded = refs.filter((r) => inSet(RESPONDED, r.status)).length;
  const agreed = refs.filter((r) => inSet(AGREED, r.status)).length;
  const confirmed = refs.filter((r) => inSet(CONFIRMED, r.status)).length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const followUpsDue = refs.filter(
    (r) => r.next_follow_up && !inSet(TERMINAL, r.status) && new Date(r.next_follow_up) < today,
  ).length;

  const quoted = AGREED.map((s) => `'${s}'`).join(",");
  const appRows = await db.select<{ status: Status; has_referral: number }[]>(
    `SELECT a.status,
       EXISTS(SELECT 1 FROM referrals r WHERE r.application_id = a.id AND r.status IN (${quoted})) AS has_referral
     FROM applications a`,
  );

  const rates = (rows: { status: Status }[]): OutcomeRates => {
    const count = rows.length;
    const oa = rows.filter((r) => ["oa", "interview", "offer"].includes(r.status)).length;
    const interview = rows.filter((r) => ["interview", "offer"].includes(r.status)).length;
    return { count, oaRate: pct(oa, count), interviewRate: pct(interview, count) };
  };

  return {
    totalPaths: refs.length,
    outreachSent,
    responded,
    agreed,
    confirmed,
    requestResponseRate: pct(responded, outreachSent),
    agreementRate: pct(agreed, outreachSent),
    confirmedRate: pct(confirmed, outreachSent),
    followUpsDue,
    withReferral: rates(appRows.filter((r) => r.has_referral === 1)),
    withoutReferral: rates(appRows.filter((r) => r.has_referral !== 1)),
  };
}
