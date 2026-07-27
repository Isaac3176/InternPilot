import { getDb } from "./index";
import type { Profile, RemotePref, WorkAuth } from "./types";

export interface ProfileInput {
  target_roles: string;
  locations: string;
  work_auth: WorkAuth | null;
  grad_year: string;
  skills: string;
  remote_pref: RemotePref;
  preferred_resume_id: number | null;
}

export async function getProfile(): Promise<Profile | null> {
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
  const db = await getDb();
  await db.execute(
    `INSERT INTO profile
       (id, target_roles, locations, work_auth, grad_year, skills, remote_pref, preferred_resume_id, onboarded, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       target_roles = excluded.target_roles,
       locations = excluded.locations,
       work_auth = excluded.work_auth,
       grad_year = excluded.grad_year,
       skills = excluded.skills,
       remote_pref = excluded.remote_pref,
       preferred_resume_id = excluded.preferred_resume_id,
       onboarded = 1,
       updated_at = datetime('now')`,
    [
      input.target_roles,
      input.locations,
      input.work_auth,
      input.grad_year,
      input.skills,
      input.remote_pref,
      input.preferred_resume_id,
    ],
  );
}
