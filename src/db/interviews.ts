import { getDb, validFk, blankToNull } from "./index";
import { cloudMode, supabase } from "../cloud/supabase";
import type { InterviewRow, InterviewType, PrepStatus } from "./types";

export interface InterviewInput {
  application_id: number | null;
  type: InterviewType;
  date?: string | null;
  notes?: string | null;
}

export async function listInterviews(): Promise<InterviewRow[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("interviews")
      .select("*, applications(role_title, job_description, resume_version_id, companies(name))");
    const rows = (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const app = row.applications as { role_title?: string; job_description?: string; resume_version_id?: number; companies?: { name?: string } } | null;
      delete row.applications;
      return {
        ...row,
        role_title: app?.role_title ?? null, job_description: app?.job_description ?? null,
        resume_version_id: app?.resume_version_id ?? null, company_name: app?.companies?.name ?? null,
      } as InterviewRow;
    });
    // Undated last, then soonest date first.
    return rows.sort((a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || (a.date ?? "").localeCompare(b.date ?? ""));
  }
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
  if (cloudMode()) {
    const { data, error } = await supabase.from("interviews")
      .insert({ application_id: input.application_id, type: input.type, date: blankToNull(input.date), notes: input.notes ?? null, prep_status: "not_started" })
      .select("id").single();
    if (error) throw error;
    return (data?.id as number) ?? null;
  }
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO interviews (application_id, type, date, notes, prep_status) VALUES (?, ?, ?, ?, 'not_started')",
    [await validFk("applications", input.application_id), input.type, blankToNull(input.date), input.notes ?? null],
  );
  return res.lastInsertId ?? null;
}

export async function deleteInterview(id: number): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("interviews").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM interviews WHERE id = ?", [id]);
}

export async function setPrepStatus(id: number, status: PrepStatus): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("interviews").update({ prep_status: status }).eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE interviews SET prep_status = ? WHERE id = ?", [status, id]);
}

export async function savePrepPlan(id: number, planJson: string): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("interviews").update({ prep_plan: planJson }).eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE interviews SET prep_plan = ? WHERE id = ?", [planJson, id]);
}
