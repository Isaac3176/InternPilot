import { getDb } from "./index";
import type { EmailCategory, EmailRow } from "./types";

export interface EmailInput {
  sender?: string | null;
  subject?: string | null;
  body?: string | null;
  received_at?: string | null;
  application_id?: number | null;
}

export async function listEmails(): Promise<EmailRow[]> {
  const db = await getDb();
  return db.select<EmailRow[]>(
    `SELECT e.*, c.name AS company_name, a.role_title
     FROM emails e
     LEFT JOIN applications a ON a.id = e.application_id
     LEFT JOIN companies c ON c.id = a.company_id
     ORDER BY (e.received_at IS NULL), e.received_at DESC, e.id DESC`,
  );
}

export async function createEmail(input: EmailInput): Promise<number | null> {
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO emails (sender, subject, body, received_at, application_id) VALUES (?, ?, ?, ?, ?)",
    [input.sender ?? null, input.subject ?? null, input.body ?? null, input.received_at ?? null, input.application_id ?? null],
  );
  return res.lastInsertId ?? null;
}

export async function setEmailClassification(
  id: number,
  classification: EmailCategory,
  confidence: number,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE emails SET classification = ?, confidence = ? WHERE id = ?", [
    classification,
    confidence,
    id,
  ]);
}

export async function linkEmailApplication(id: number, applicationId: number | null): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE emails SET application_id = ? WHERE id = ?", [applicationId, id]);
}

export async function deleteEmail(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM emails WHERE id = ?", [id]);
}
