import { getDb, validFk, blankToNull } from "./index";
import { cloudMode, supabase } from "../cloud/supabase";
import type { ReferralRow, ReferralStatus, Status } from "./types";

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

/** Null out any foreign-key id that no longer references a live row (SQLite). */
async function withValidFks(input: ReferralInput): Promise<ReferralInput> {
  return {
    ...input,
    contact_id: await validFk("contacts", input.contact_id),
    application_id: await validFk("applications", input.application_id),
    company_id: await validFk("companies", input.company_id),
  };
}

function row(input: ReferralInput): Record<string, unknown> {
  return {
    contact_id: input.contact_id, application_id: input.application_id, company_id: input.company_id,
    status: input.status, first_contacted: blankToNull(input.first_contacted), last_interaction: blankToNull(input.last_interaction),
    next_follow_up: blankToNull(input.next_follow_up), confirmation_note: input.confirmation_note ?? null,
    referral_link: input.referral_link ?? null, thank_you_sent: input.thank_you_sent ? 1 : 0, notes: input.notes ?? null,
  };
}
function params(input: ReferralInput): unknown[] {
  const r = row(input);
  return [r.contact_id, r.application_id, r.company_id, r.status, r.first_contacted, r.last_interaction,
    r.next_follow_up, r.confirmation_note, r.referral_link, r.thank_you_sent, r.notes];
}

export async function listReferrals(): Promise<ReferralRow[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("referrals")
      .select("*, contacts(name, companies(name)), companies(name), applications(role_title)");
    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const ct = row.contacts as { name?: string; companies?: { name?: string } } | null;
      const co = row.companies as { name?: string } | null;
      const app = row.applications as { role_title?: string } | null;
      delete row.contacts; delete row.companies; delete row.applications;
      return {
        ...row, contact_name: ct?.name ?? null,
        company_name: co?.name ?? ct?.companies?.name ?? null, role_title: app?.role_title ?? null,
      } as ReferralRow;
    });
  }
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

export async function createReferral(input: ReferralInput): Promise<number | null> {
  if (cloudMode()) {
    const { data, error } = await supabase.from("referrals").insert(row(input)).select("id").single();
    if (error) throw error;
    return (data?.id as number) ?? null;
  }
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
  if (cloudMode()) {
    const { error } = await supabase.from("referrals").update(row(input)).eq("id", id);
    if (error) throw error;
    return;
  }
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
  if (cloudMode()) {
    const { error } = await supabase.from("referrals").update({ status, last_interaction: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute(
    "UPDATE referrals SET status = ?, last_interaction = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [status, id],
  );
}

export async function deleteReferral(id: number): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("referrals").delete().eq("id", id);
    if (error) throw error;
    return;
  }
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
  let refs: { status: ReferralStatus; next_follow_up: string | null; application_id: number | null }[];
  let apps: { id: number; status: Status }[];

  if (cloudMode()) {
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase.from("referrals").select("status, next_follow_up, application_id"),
      supabase.from("applications").select("id, status"),
    ]);
    refs = (r ?? []) as typeof refs;
    apps = (a ?? []) as typeof apps;
  } else {
    const db = await getDb();
    refs = await db.select("SELECT status, next_follow_up, application_id FROM referrals");
    apps = await db.select("SELECT id, status FROM applications");
  }

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

  // Which applications have an agreed-or-better referral.
  const referredApps = new Set(
    refs.filter((r) => r.application_id != null && inSet(AGREED, r.status)).map((r) => r.application_id),
  );

  const rates = (rows: { status: Status }[]): OutcomeRates => {
    const count = rows.length;
    const oa = rows.filter((r) => ["oa", "interview", "offer"].includes(r.status)).length;
    const interview = rows.filter((r) => ["interview", "offer"].includes(r.status)).length;
    return { count, oaRate: pct(oa, count), interviewRate: pct(interview, count) };
  };

  return {
    totalPaths: refs.length, outreachSent, responded, agreed, confirmed,
    requestResponseRate: pct(responded, outreachSent),
    agreementRate: pct(agreed, outreachSent),
    confirmedRate: pct(confirmed, outreachSent),
    followUpsDue,
    withReferral: rates(apps.filter((a) => referredApps.has(a.id))),
    withoutReferral: rates(apps.filter((a) => !referredApps.has(a.id))),
  };
}
