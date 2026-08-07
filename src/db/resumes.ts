import { getDb } from "./index";
import { cloudMode, supabase } from "../cloud/supabase";
import type { ResumeBullet, ResumeVersion } from "./types";

export interface ResumeVersionInput {
  name: string;
  content?: string | null;
  target_role?: string | null;
  file_path?: string | null;
}

export async function listResumeVersions(): Promise<ResumeVersion[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("resume_versions").select("*").order("created_at", { ascending: false });
    return (data ?? []) as ResumeVersion[];
  }
  const db = await getDb();
  return db.select<ResumeVersion[]>("SELECT * FROM resume_versions ORDER BY created_at DESC, id DESC");
}

export async function getResumeVersion(id: number): Promise<ResumeVersion | null> {
  if (cloudMode()) {
    const { data } = await supabase.from("resume_versions").select("*").eq("id", id).maybeSingle();
    return (data as ResumeVersion) ?? null;
  }
  const db = await getDb();
  const rows = await db.select<ResumeVersion[]>("SELECT * FROM resume_versions WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function createResumeVersion(input: ResumeVersionInput): Promise<number | null> {
  if (cloudMode()) {
    const { data, error } = await supabase.from("resume_versions")
      .insert({ name: input.name, content: input.content ?? null, target_role: input.target_role ?? null, file_path: input.file_path ?? null })
      .select("id").single();
    if (error) throw error;
    return (data?.id as number) ?? null;
  }
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO resume_versions (name, content, target_role, file_path) VALUES (?, ?, ?, ?)",
    [input.name, input.content ?? null, input.target_role ?? null, input.file_path ?? null],
  );
  return res.lastInsertId ?? null;
}

export async function updateResumeVersion(id: number, input: ResumeVersionInput): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("resume_versions")
      .update({ name: input.name, content: input.content ?? null, target_role: input.target_role ?? null, file_path: input.file_path ?? null })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute(
    "UPDATE resume_versions SET name = ?, content = ?, target_role = ?, file_path = ? WHERE id = ?",
    [input.name, input.content ?? null, input.target_role ?? null, input.file_path ?? null, id],
  );
}

export async function deleteResumeVersion(id: number): Promise<void> {
  if (cloudMode()) {
    // profiles.preferred_resume_id is ON DELETE SET NULL in the cloud schema,
    // so Postgres clears the pointer automatically.
    const { error } = await supabase.from("resume_versions").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  // profile.preferred_resume_id has no FK, so ON DELETE SET NULL won't fire —
  // clear it here or it becomes a stale pointer that breaks later inserts.
  await db.execute("UPDATE profile SET preferred_resume_id = NULL WHERE preferred_resume_id = ?", [id]);
  await db.execute("DELETE FROM resume_versions WHERE id = ?", [id]);
}

export async function saveResumeBullet(
  bullet: Omit<ResumeBullet, "id" | "created_at">,
): Promise<number | null> {
  if (cloudMode()) {
    const { data, error } = await supabase.from("resume_bullets")
      .insert({ experience_name: bullet.experience_name, original_text: bullet.original_text, improved_text: bullet.improved_text, tags: bullet.tags, application_id: bullet.application_id })
      .select("id").single();
    if (error) throw error;
    return (data?.id as number) ?? null;
  }
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO resume_bullets (experience_name, original_text, improved_text, tags, application_id)
     VALUES (?, ?, ?, ?, ?)`,
    [bullet.experience_name, bullet.original_text, bullet.improved_text, bullet.tags, bullet.application_id],
  );
  return res.lastInsertId ?? null;
}

export async function listResumeBullets(): Promise<ResumeBullet[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("resume_bullets").select("*").order("created_at", { ascending: false });
    return (data ?? []) as ResumeBullet[];
  }
  const db = await getDb();
  return db.select<ResumeBullet[]>("SELECT * FROM resume_bullets ORDER BY created_at DESC, id DESC");
}

export async function deleteResumeBullet(id: number): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("resume_bullets").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM resume_bullets WHERE id = ?", [id]);
}

export async function updateResumeBulletText(id: number, improvedText: string): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("resume_bullets").update({ improved_text: improvedText }).eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE resume_bullets SET improved_text = ? WHERE id = ?", [improvedText, id]);
}
