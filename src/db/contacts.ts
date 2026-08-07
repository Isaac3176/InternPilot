import { isTauri } from "../lib/env";
import { getDb } from "./index";
import { upsertCompany } from "./companies";
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
  if (!isTauri()) return []; // not migrated to cloud yet — empty in the web build
  const db = await getDb();
  return db.select<ContactRow[]>(
    `SELECT ct.*, c.name AS company_name
     FROM contacts ct
     LEFT JOIN companies c ON c.id = ct.company_id
     ORDER BY ct.name COLLATE NOCASE ASC`,
  );
}

function params(input: ContactInput, companyId: number | null): unknown[] {
  return [
    input.name,
    companyId,
    input.title ?? null,
    input.team ?? null,
    input.email ?? null,
    input.linkedin ?? null,
    input.relationship_type ?? null,
    input.relationship_strength ?? null,
    input.how_you_know ?? null,
    input.contact_again === false ? 0 : 1,
    input.notes ?? null,
  ];
}

export async function createContact(input: ContactInput): Promise<number | null> {
  const db = await getDb();
  const companyId = await upsertCompany(input.company_name);
  const res = await db.execute(
    `INSERT INTO contacts
       (name, company_id, title, team, email, linkedin, relationship_type,
        relationship_strength, how_you_know, contact_again, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params(input, companyId),
  );
  return res.lastInsertId ?? null;
}

export async function updateContact(id: number, input: ContactInput): Promise<void> {
  const db = await getDb();
  const companyId = await upsertCompany(input.company_name);
  await db.execute(
    `UPDATE contacts SET
       name = ?, company_id = ?, title = ?, team = ?, email = ?, linkedin = ?,
       relationship_type = ?, relationship_strength = ?, how_you_know = ?,
       contact_again = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [...params(input, companyId), id],
  );
}

export async function deleteContact(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM contacts WHERE id = ?", [id]);
}
