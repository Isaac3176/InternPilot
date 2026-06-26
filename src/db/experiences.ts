import { getDb } from "./index";
import { upsertCompany } from "./companies";
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
  const db = await getDb();
  return db.select<ExperienceRow[]>(
    `SELECT e.*, c.name AS company_name
     FROM interview_experiences e
     LEFT JOIN companies c ON c.id = e.company_id
     ORDER BY c.name COLLATE NOCASE ASC, e.created_at DESC`,
  );
}

export async function createExperience(input: ExperienceInput): Promise<number | null> {
  const db = await getDb();
  const companyId = await upsertCompany(input.company_name);
  const res = await db.execute(
    `INSERT INTO interview_experiences (company_id, role, source, difficulty, topics, summary)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      input.role ?? null,
      input.source ?? null,
      input.difficulty ?? null,
      input.topics ?? null,
      input.summary ?? null,
    ],
  );
  return res.lastInsertId ?? null;
}

export async function deleteExperience(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM interview_experiences WHERE id = ?", [id]);
}
