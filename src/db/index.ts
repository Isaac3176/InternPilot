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
