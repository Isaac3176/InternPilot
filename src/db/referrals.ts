import { getDb } from "./index";
import type { ReferralRow, ReferralStatus } from "./types";

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
    params(input),
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
    [...params(input), id],
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
