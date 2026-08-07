import { getDb } from "./index";
import { upsertCompany } from "./companies";
import { cloudMode, supabase } from "../cloud/supabase";
import type { Difficulty, ExperienceRow } from "./types";

export interface ExperienceInput {
  company_name: string;
  role?: string | null;
  source?: string | null;
  difficulty?: Difficulty | null;
  topics?: string | null;
  summary?: string | null;
}

export async function listExperiences(): Promise<ExperienceRow[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("interview_experiences").select("*, companies(name)");
    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const company = row.companies as { name?: string } | null;
      delete row.companies;
      return { ...row, company_name: company?.name ?? null } as ExperienceRow;
    }).sort((a, b) => (a.company_name ?? "").localeCompare(b.company_name ?? ""));
  }
  const db = await getDb();
  return db.select<ExperienceRow[]>(
    `SELECT e.*, c.name AS company_name
     FROM interview_experiences e
     LEFT JOIN companies c ON c.id = e.company_id
     ORDER BY c.name COLLATE NOCASE ASC, e.created_at DESC`,
  );
}

export async function createExperience(input: ExperienceInput): Promise<number | null> {
  const companyId = await upsertCompany(input.company_name);
  if (cloudMode()) {
    const { data, error } = await supabase.from("interview_experiences")
      .insert({ company_id: companyId, role: input.role ?? null, source: input.source ?? null, difficulty: input.difficulty ?? null, topics: input.topics ?? null, summary: input.summary ?? null })
      .select("id").single();
    if (error) throw error;
    return (data?.id as number) ?? null;
  }
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO interview_experiences (company_id, role, source, difficulty, topics, summary)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [companyId, input.role ?? null, input.source ?? null, input.difficulty ?? null, input.topics ?? null, input.summary ?? null],
  );
  return res.lastInsertId ?? null;
}

export async function deleteExperience(id: number): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("interview_experiences").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM interview_experiences WHERE id = ?", [id]);
}
