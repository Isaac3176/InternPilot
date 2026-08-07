import { getDb } from "./index";
import { upsertCompany } from "./companies";
import { cloudMode, supabase } from "../cloud/supabase";
import type { ContactRow, RelationshipType } from "./types";

export interface ContactInput {
  name: string;
  company_name: string;
  title?: string | null;
  team?: string | null;
  email?: string | null;
  linkedin?: string | null;
  relationship_type?: RelationshipType | null;
  relationship_strength?: number | null;
  how_you_know?: string | null;
  contact_again?: boolean;
  notes?: string | null;
}

export async function listContacts(): Promise<ContactRow[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("contacts").select("*, companies(name)").order("name");
    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const company = row.companies as { name?: string } | null;
      delete row.companies;
      return { ...row, company_name: company?.name ?? null } as ContactRow;
    });
  }
  const db = await getDb();
  return db.select<ContactRow[]>(
    `SELECT ct.*, c.name AS company_name
     FROM contacts ct
     LEFT JOIN companies c ON c.id = ct.company_id
     ORDER BY ct.name COLLATE NOCASE ASC`,
  );
}

function row(input: ContactInput, companyId: number | null): Record<string, unknown> {
  return {
    name: input.name, company_id: companyId, title: input.title ?? null, team: input.team ?? null,
    email: input.email ?? null, linkedin: input.linkedin ?? null,
    relationship_type: input.relationship_type ?? null, relationship_strength: input.relationship_strength ?? null,
    how_you_know: input.how_you_know ?? null, contact_again: input.contact_again === false ? 0 : 1,
    notes: input.notes ?? null,
  };
}

export async function createContact(input: ContactInput): Promise<number | null> {
  const companyId = await upsertCompany(input.company_name);
  if (cloudMode()) {
    const { data, error } = await supabase.from("contacts").insert(row(input, companyId)).select("id").single();
    if (error) throw error;
    return (data?.id as number) ?? null;
  }
  const db = await getDb();
  const r = row(input, companyId);
  const res = await db.execute(
    `INSERT INTO contacts
       (name, company_id, title, team, email, linkedin, relationship_type,
        relationship_strength, how_you_know, contact_again, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.name, r.company_id, r.title, r.team, r.email, r.linkedin, r.relationship_type, r.relationship_strength, r.how_you_know, r.contact_again, r.notes],
  );
  return res.lastInsertId ?? null;
}

export async function updateContact(id: number, input: ContactInput): Promise<void> {
  const companyId = await upsertCompany(input.company_name);
  if (cloudMode()) {
    const { error } = await supabase.from("contacts").update(row(input, companyId)).eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  const r = row(input, companyId);
  await db.execute(
    `UPDATE contacts SET
       name = ?, company_id = ?, title = ?, team = ?, email = ?, linkedin = ?,
       relationship_type = ?, relationship_strength = ?, how_you_know = ?,
       contact_again = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [r.name, r.company_id, r.title, r.team, r.email, r.linkedin, r.relationship_type, r.relationship_strength, r.how_you_know, r.contact_again, r.notes, id],
  );
}

export async function deleteContact(id: number): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM contacts WHERE id = ?", [id]);
}
