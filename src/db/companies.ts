import { getDb } from "./index";
import { cloudMode, supabase } from "../cloud/supabase";
import type { Company } from "./types";

export async function listCompanies(): Promise<Company[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("companies").select("*").order("name");
    return (data ?? []) as Company[];
  }
  const db = await getDb();
  return db.select<Company[]>("SELECT * FROM companies ORDER BY name COLLATE NOCASE ASC");
}

/** Find an existing company by name (case-insensitive) or create one. Returns its id. */
export async function upsertCompany(name: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (cloudMode()) {
    const found = await supabase.from("companies").select("id").ilike("name", trimmed).limit(1);
    if (found.data && found.data.length > 0) return found.data[0].id as number;
    const ins = await supabase.from("companies").insert({ name: trimmed }).select("id").single();
    if (ins.error) throw ins.error;
    return (ins.data?.id as number) ?? null;
  }
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM companies WHERE name = ? COLLATE NOCASE LIMIT 1",
    [trimmed],
  );
  if (existing.length > 0) return existing[0].id;

  // Insert only if still absent, then resolve the id by name. We deliberately
  // avoid execute().lastInsertId: it is shared per pooled connection, so under
  // concurrent writes it can return another table's rowid — which then fails the
  // applications.company_id foreign key. Re-selecting by name is race-safe.
  await db.execute(
    "INSERT INTO companies (name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = ? COLLATE NOCASE)",
    [trimmed, trimmed],
  );
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM companies WHERE name = ? COLLATE NOCASE ORDER BY id LIMIT 1",
    [trimmed],
  );
  return rows[0]?.id ?? null;
}
