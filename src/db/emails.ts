import { getDb } from "./index";
import { isTauri } from "../lib/env";
import { cloudMode, supabase } from "../cloud/supabase";
import type { EmailCategory, EmailRow } from "./types";

export interface EmailInput {
  sender?: string | null;
  subject?: string | null;
  body?: string | null;
  received_at?: string | null;
  application_id?: number | null;
  gmail_id?: string | null;
}

export async function listEmails(): Promise<EmailRow[]> {
  if (cloudMode()) {
    const { data } = await supabase
      .from("emails")
      .select("*, applications(role_title, companies(name))")
      .order("received_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false });
    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const app = row.applications as { role_title?: string; companies?: { name?: string } | null } | null;
      delete row.applications;
      return { ...row, role_title: app?.role_title ?? null, company_name: app?.companies?.name ?? null } as EmailRow;
    });
  }
  if (!isTauri()) return []; // no local DB in a plain browser (and no cloud session)
  const db = await getDb();
  return db.select<EmailRow[]>(
    `SELECT e.*, c.name AS company_name, a.role_title
     FROM emails e
     LEFT JOIN applications a ON a.id = e.application_id
     LEFT JOIN companies c ON c.id = a.company_id
     ORDER BY (e.received_at IS NULL), e.received_at DESC, e.id DESC`,
  );
}

export async function createEmail(input: EmailInput): Promise<number | null> {
  if (cloudMode()) {
    const { data } = await supabase.from("emails").insert({
      sender: input.sender ?? null,
      subject: input.subject ?? null,
      body: input.body ?? null,
      received_at: input.received_at ?? null,
      application_id: input.application_id ?? null,
      gmail_id: input.gmail_id ?? null,
    }).select("id").single();
    return (data?.id as number) ?? null;
  }
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO emails (sender, subject, body, received_at, application_id, gmail_id) VALUES (?, ?, ?, ?, ?, ?)",
    [
      input.sender ?? null,
      input.subject ?? null,
      input.body ?? null,
      input.received_at ?? null,
      input.application_id ?? null,
      input.gmail_id ?? null,
    ],
  );
  return res.lastInsertId ?? null;
}

/** Gmail message ids already stored, used to avoid re-importing on sync. */
export async function getExistingGmailIds(): Promise<string[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("emails").select("gmail_id").not("gmail_id", "is", null);
    return (data ?? []).map((r) => r.gmail_id as string).filter(Boolean);
  }
  if (!isTauri()) return [];
  const db = await getDb();
  const rows = await db.select<{ gmail_id: string }[]>(
    "SELECT gmail_id FROM emails WHERE gmail_id IS NOT NULL",
  );
  return rows.map((r) => r.gmail_id);
}

export async function setEmailClassification(
  id: number,
  classification: EmailCategory,
  confidence: number,
): Promise<void> {
  if (cloudMode()) {
    await supabase.from("emails").update({ classification, confidence }).eq("id", id);
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE emails SET classification = ?, confidence = ? WHERE id = ?", [
    classification,
    confidence,
    id,
  ]);
}

export async function linkEmailApplication(id: number, applicationId: number | null): Promise<void> {
  if (cloudMode()) {
    await supabase.from("emails").update({ application_id: applicationId }).eq("id", id);
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE emails SET application_id = ? WHERE id = ?", [applicationId, id]);
}

export async function deleteEmail(id: number): Promise<void> {
  if (cloudMode()) {
    await supabase.from("emails").delete().eq("id", id);
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM emails WHERE id = ?", [id]);
}
