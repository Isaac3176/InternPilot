import { getDb } from "./index";
import type { Company } from "./types";

export async function listCompanies(): Promise<Company[]> {
  const db = await getDb();
  return db.select<Company[]>("SELECT * FROM companies ORDER BY name COLLATE NOCASE ASC");
}

/** Find an existing company by name (case-insensitive) or create one. Returns its id. */
export async function upsertCompany(name: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM companies WHERE name = ? COLLATE NOCASE LIMIT 1",
    [trimmed],
  );
  if (existing.length > 0) return existing[0].id;
  const res = await db.execute("INSERT INTO companies (name) VALUES (?)", [trimmed]);
  return res.lastInsertId ?? null;
}
