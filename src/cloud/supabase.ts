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
