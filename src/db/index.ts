import Database from "@tauri-apps/plugin-sql";

const DB_URL = "sqlite:internpilot.db";

let dbPromise: Promise<Database> | null = null;

/**
 * Returns a singleton SQLite connection. The schema itself is created by the
 * Rust-side migrations (see src-tauri/src/lib.rs), so loading the DB here is
 * enough — migrations run automatically on load.
 */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

/**
 * Return `id` only if a row with that id still exists in `table`, else null.
 * Use for nullable foreign-key columns so a stale/wrong id can't trip a
 * FOREIGN KEY constraint (SQLite 787). `table` is always a trusted literal.
 */
export async function validFk(table: string, id: number | null | undefined): Promise<number | null> {
  if (id == null) return null;
  const db = await getDb();
  const rows = await db.select<{ x: number }[]>(`SELECT 1 AS x FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  return rows.length > 0 ? id : null;
}
