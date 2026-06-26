import { getDb } from "./index";
import type { InterviewRow, InterviewType, PrepStatus } from "./types";

export interface InterviewInput {
  application_id: number | null;
  type: InterviewType;
  date?: string | null;
  notes?: string | null;
}

export async function listInterviews(): Promise<InterviewRow[]> {
  const db = await getDb();
  return db.select<InterviewRow[]>(
    `SELECT i.*, c.name AS company_name, a.role_title, a.job_description, a.resume_version_id
     FROM interviews i
     LEFT JOIN applications a ON a.id = i.application_id
     LEFT JOIN companies c ON c.id = a.company_id
     ORDER BY (i.date IS NULL), i.date ASC, i.id DESC`,
  );
}

export async function createInterview(input: InterviewInput): Promise<number | null> {
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO interviews (application_id, type, date, notes, prep_status) VALUES (?, ?, ?, ?, 'not_started')",
    [input.application_id, input.type, input.date ?? null, input.notes ?? null],
  );
  return res.lastInsertId ?? null;
}

export async function deleteInterview(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM interviews WHERE id = ?", [id]);
}

export async function setPrepStatus(id: number, status: PrepStatus): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE interviews SET prep_status = ? WHERE id = ?", [status, id]);
}

export async function savePrepPlan(id: number, planJson: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE interviews SET prep_plan = ? WHERE id = ?", [planJson, id]);
}
