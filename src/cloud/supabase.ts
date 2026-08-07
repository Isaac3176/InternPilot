import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client. The publishable (anon) key is designed to be shipped in the
 * client — Row-Level Security in cloud/schema.sql is what actually protects
 * data. Both values can be overridden via .env (VITE_SUPABASE_URL / _KEY).
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://sdminkbpouqdjgqawdqc.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_MHwlEX21gJ019Fus0mB9JQ_8zvHGUTX";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Track the session synchronously so the data layer can route to cloud vs local
// without an await on every call. When signed in, db modules use Supabase.
let currentUserId: string | null = null;
supabase.auth.getSession().then(({ data }) => { currentUserId = data.session?.user?.id ?? null; });
supabase.auth.onAuthStateChange((_e, s) => { currentUserId = s?.user?.id ?? null; });

/** True when a cloud user is signed in — the data layer should use Supabase. */
export function cloudMode(): boolean {
  return currentUserId !== null;
}
export function cloudUserId(): string | null {
  return currentUserId;
}
