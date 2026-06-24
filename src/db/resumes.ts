import { getDb } from "./index";
import type { ResumeBullet, ResumeVersion } from "./types";

export interface ResumeVersionInput {
  name: string;
  content?: string | null;
  target_role?: string | null;
  file_path?: string | null;
}

export async function listResumeVersions(): Promise<ResumeVersion[]> {
  const db = await getDb();
  return db.select<ResumeVersion[]>("SELECT * FROM resume_versions ORDER BY created_at DESC, id DESC");
}

export async function createResumeVersion(input: ResumeVersionInput): Promise<number | null> {
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO resume_versions (name, content, target_role, file_path) VALUES (?, ?, ?, ?)",
    [input.name, input.content ?? null, input.target_role ?? null, input.file_path ?? null],
  );
  return res.lastInsertId ?? null;
}

export async function updateResumeVersion(id: number, input: ResumeVersionInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE resume_versions SET name = ?, content = ?, target_role = ?, file_path = ? WHERE id = ?",
    [input.name, input.content ?? null, input.target_role ?? null, input.file_path ?? null, id],
  );
}

export async function deleteResumeVersion(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM resume_versions WHERE id = ?", [id]);
}

export async function saveResumeBullet(
  bullet: Omit<ResumeBullet, "id" | "created_at">,
): Promise<number | null> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO resume_bullets (experience_name, original_text, improved_text, tags, application_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      bullet.experience_name,
      bullet.original_text,
      bullet.improved_text,
      bullet.tags,
      bullet.application_id,
    ],
  );
  return res.lastInsertId ?? null;
}

export async function listResumeBullets(): Promise<ResumeBullet[]> {
  const db = await getDb();
  return db.select<ResumeBullet[]>("SELECT * FROM resume_bullets ORDER BY created_at DESC, id DESC");
}
