import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client. The publishable (anon) key is designed to be shipped in the
 * client — Row-Level Security in cloud/schema.sql is what actually protects
 * data. Both values can be overridden via .env (VITE_SUPABASE_URL / _KEY).
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://sdminkbpouqdjgqawdqc.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_MHwlEX21gJ019Fus0mB9JQ_8zvHGUTX";

// "Remember this device": when on, the session lives in localStorage and
// survives restarts (stay logged in). When off, it lives in sessionStorage and
// is cleared when the window closes (log in each launch — good for shared PCs).
const REMEMBER_KEY = "internpilot.remember";
export function getRemember(): boolean {
  try { return localStorage.getItem(REMEMBER_KEY) !== "0"; } catch { return true; }
}
export function setRemember(on: boolean): void {
  try { localStorage.setItem(REMEMBER_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}
const authStorage = {
  getItem: (k: string) => {
    try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch { return null; }
  },
  setItem: (k: string, v: string) => {
    try {
      const persist = getRemember();
      (persist ? localStorage : sessionStorage).setItem(k, v);
      (persist ? sessionStorage : localStorage).removeItem(k);
    } catch { /* ignore */ }
  },
  removeItem: (k: string) => {
    try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* ignore */ }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: authStorage },
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
