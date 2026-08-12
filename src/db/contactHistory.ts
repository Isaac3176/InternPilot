import { getDb } from "./index";
import { cloudMode, supabase } from "../cloud/supabase";

/** One role a contact has held — lets us preserve a person as they change jobs. */
export interface ContactEmployment {
  id: number;
  contact_id: number;
  company: string;
  title: string | null;
  team: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: number; // 0/1
  source: string | null;
  created_at: string;
}

export interface EmploymentInput {
  contact_id: number;
  company: string;
  title?: string | null;
  team?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  source?: string | null;
}

/** Every employment row for the user (for building shared-employer paths). */
export async function listAllEmployment(): Promise<ContactEmployment[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("contact_employment_history").select("*").order("is_current", { ascending: false }).order("id", { ascending: false });
    return (data ?? []) as ContactEmployment[];
  }
  const db = await getDb();
  return db.select<ContactEmployment[]>(
    "SELECT * FROM contact_employment_history ORDER BY is_current DESC, id DESC",
  );
}

export async function listEmployment(contactId: number): Promise<ContactEmployment[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("contact_employment_history").select("*").eq("contact_id", contactId).order("is_current", { ascending: false }).order("id", { ascending: false });
    return (data ?? []) as ContactEmployment[];
  }
  const db = await getDb();
  return db.select<ContactEmployment[]>(
    "SELECT * FROM contact_employment_history WHERE contact_id = ? ORDER BY is_current DESC, id DESC",
    [contactId],
  );
}

export async function addEmployment(input: EmploymentInput): Promise<number | null> {
  const cur = input.is_current ? 1 : 0;
  if (cloudMode()) {
    const { data } = await supabase.from("contact_employment_history").insert({
      contact_id: input.contact_id, company: input.company, title: input.title ?? null, team: input.team ?? null,
      start_date: input.start_date ?? null, end_date: input.end_date ?? null, is_current: cur, source: input.source ?? null,
    }).select("id").single();
    return (data?.id as number) ?? null;
  }
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO contact_employment_history (contact_id, company, title, team, start_date, end_date, is_current, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.contact_id, input.company, input.title ?? null, input.team ?? null, input.start_date ?? null, input.end_date ?? null, cur, input.source ?? null],
  );
  return res.lastInsertId ?? null;
}

export async function deleteEmployment(id: number): Promise<void> {
  if (cloudMode()) { await supabase.from("contact_employment_history").delete().eq("id", id); return; }
  const db = await getDb();
  await db.execute("DELETE FROM contact_employment_history WHERE id = ?", [id]);
}
