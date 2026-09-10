import { cloudMode, supabase, throwIfSupabaseError } from "./supabase";

const EXACT_KEYS = new Set([
  "internpilot.answers",
  "internpilot.answers.seeded",
  "internpilot.ranking.dismissed",
  "internpilot.ranking.learning",
  "internpilot.ranking.mutedPatterns",
  "internpilot.ranking.prefs",
  "internpilot.ranking.seeded",
  "internpilot.ranking.watchlist",
  "internpilot.release.observed",
  "internpilot.listings.autoOn",
  "internpilot.listings.autoUrl",
  "internpilot.listings.logosOn",
  "internpilot.listings.simplifyOn",
  "internpilot.listings.simplifyUrl",
  "internpilot.trackResumes",
]);

const PREFIXES = [
  "internpilot.mission.",
  "internpilot.packet.check.",
  "internpilot.radar.notified.",
];

function isSyncedKey(key: string): boolean {
  return EXACT_KEYS.has(key) || PREFIXES.some((prefix) => key.startsWith(prefix));
}

function parseStoredValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function stringifyStoredValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function localSnapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isSyncedKey(key)) continue;
    const raw = localStorage.getItem(key);
    if (raw != null) out[key] = parseStoredValue(raw);
  }
  return out;
}

async function upsertSetting(key: string, value: unknown): Promise<void> {
  if (!cloudMode() || !isSyncedKey(key)) return;
  const { error } = await supabase.from("user_settings").upsert({ key, value }, { onConflict: "user_id,key" });
  throwIfSupabaseError(error);
}

async function deleteSetting(key: string): Promise<void> {
  if (!cloudMode() || !isSyncedKey(key)) return;
  const { error } = await supabase.from("user_settings").delete().eq("key", key);
  throwIfSupabaseError(error);
}

export function mirrorLocalSetting(key: string): void {
  if (!isSyncedKey(key)) return;
  const raw = localStorage.getItem(key);
  if (raw == null) {
    void deleteSetting(key).catch(console.error);
    return;
  }
  void upsertSetting(key, parseStoredValue(raw)).catch(console.error);
}

export function removeMirroredLocalSetting(key: string): void {
  if (!isSyncedKey(key)) return;
  void deleteSetting(key).catch(console.error);
}

/**
 * Pull account-scoped localStorage-backed settings into this device. If the
 * cloud store is empty, seed it from this device so existing beta users keep
 * their preferences when they first sign in after the sync bridge ships.
 */
export async function syncLocalSettingsFromCloud(): Promise<void> {
  if (!cloudMode()) return;
  const { data, error } = await supabase.from("user_settings").select("key, value");
  throwIfSupabaseError(error);

  if (!data || data.length === 0) {
    const snapshot = localSnapshot();
    await Promise.all(Object.entries(snapshot).map(([key, value]) => upsertSetting(key, value)));
    return;
  }

  const cloudKeys = new Set<string>();
  for (const row of data) {
    if (!isSyncedKey(row.key)) continue;
    cloudKeys.add(row.key);
    localStorage.setItem(row.key, stringifyStoredValue(row.value));
  }

  for (const key of Object.keys(localSnapshot())) {
    if (!cloudKeys.has(key)) localStorage.removeItem(key);
  }
}
