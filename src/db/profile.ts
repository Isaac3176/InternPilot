import { getDb } from "./index";
import { cloudMode, cloudUserId, supabase } from "../cloud/supabase";
import type { Profile, RemotePref, WorkAuth } from "./types";

/** Every writable profile column, in a fixed order used to build the upsert. */
const PROFILE_COLUMNS = [
  "first_name", "last_name", "email", "phone", "current_city", "current_state", "current_country",
  "linkedin_url", "github_url", "portfolio_url",
  "school", "degree", "major", "minor", "gpa", "graduation_date", "grad_year",
  "target_roles", "locations", "skills", "remote_pref", "preferred_resume_id",
  "desired_salary", "willing_to_relocate", "earliest_start_date", "target_date",
  "work_auth", "authorized_us", "requires_sponsorship", "security_clearance",
  "gender", "race_ethnicity", "hispanic_latino", "veteran_status", "disability_status",
] as const;

export type ProfileInput = {
  work_auth: WorkAuth | null;
  remote_pref: RemotePref | null;
  preferred_resume_id: number | null;
} & Record<Exclude<(typeof PROFILE_COLUMNS)[number], "work_auth" | "remote_pref" | "preferred_resume_id">, string | null>;

export async function getProfile(): Promise<Profile | null> {
  if (cloudMode()) {
    const { data } = await supabase.from("profiles").select("*").maybeSingle();
    return data ? ({ id: 1, ...(data as Record<string, unknown>) } as unknown as Profile) : null;
  }
  const db = await getDb();
  const rows = await db.select<Profile[]>("SELECT * FROM profile WHERE id = 1");
  return rows[0] ?? null;
}

export async function isOnboarded(): Promise<boolean> {
  const p = await getProfile();
  return !!p?.onboarded;
}

/** Upsert the single profile row and mark it onboarded. */
export async function saveProfile(input: ProfileInput): Promise<void> {
  if (cloudMode()) {
    const row: Record<string, unknown> = { user_id: cloudUserId(), onboarded: 1 };
    for (const c of PROFILE_COLUMNS) row[c] = (input as Record<string, unknown>)[c] ?? null;
    const { error } = await supabase.from("profiles").upsert(row, { onConflict: "user_id" });
    if (error) throw error;
    return;
  }
  const db = await getDb();
  const cols = PROFILE_COLUMNS.join(", ");
  const placeholders = PROFILE_COLUMNS.map(() => "?").join(", ");
  const updates = PROFILE_COLUMNS.map((c) => `${c} = excluded.${c}`).join(", ");
  const values = PROFILE_COLUMNS.map((c) => (input as Record<string, unknown>)[c] ?? null);

  await db.execute(
    `INSERT INTO profile (id, ${cols}, onboarded, updated_at)
     VALUES (1, ${placeholders}, 1, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET ${updates}, onboarded = 1, updated_at = datetime('now')`,
    values,
  );
}
