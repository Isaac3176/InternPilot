import { getDb } from "./index";
import { upsertCompany } from "./companies";
import { cloudMode, supabase } from "../cloud/supabase";
import type { Application, ApplicationRow, Status } from "./types";

export interface ApplicationInput {
  company_name: string;
  role_title: string;
  job_link?: string | null;
  location?: string | null;
  status: Status;
  date_applied?: string | null;
  resume_version_id?: number | null;
  job_description?: string | null;
  notes?: string | null;
  referral?: string | null;
}

export async function listApplications(opts?: {
  search?: string;
  status?: Status | "all";
}): Promise<ApplicationRow[]> {
  if (cloudMode()) {
    let q = supabase.from("applications").select("*, companies(name), resume_versions(name)").order("date_saved", { ascending: false });
    if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
    const { data } = await q;
    let rows = (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const company = row.companies as { name?: string } | null;
      const resume = row.resume_versions as { name?: string } | null;
      delete row.companies; delete row.resume_versions;
      return { ...row, company_name: company?.name ?? null, resume_version_name: resume?.name ?? null } as ApplicationRow;
    });
    const term = opts?.search?.trim().toLowerCase();
    if (term) {
      rows = rows.filter((a) =>
        a.role_title.toLowerCase().includes(term) ||
        (a.company_name ?? "").toLowerCase().includes(term) ||
        (a.location ?? "").toLowerCase().includes(term));
    }
    return rows;
  }

  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts?.status && opts.status !== "all") { where.push("a.status = ?"); params.push(opts.status); }
  if (opts?.search?.trim()) {
    const t = `%${opts.search.trim()}%`;
    where.push("(a.role_title LIKE ? OR c.name LIKE ? OR a.location LIKE ?)");
    params.push(t, t, t);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.select<ApplicationRow[]>(
    `SELECT a.*, c.name AS company_name, r.name AS resume_version_name
     FROM applications a
     LEFT JOIN companies c ON c.id = a.company_id
     LEFT JOIN resume_versions r ON r.id = a.resume_version_id
     ${clause}
     ORDER BY a.date_saved DESC, a.id DESC`,
    params,
  );
}

export async function getApplication(id: number): Promise<Application | null> {
  if (cloudMode()) {
    const { data } = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
    return (data as Application) ?? null;
  }
  const db = await getDb();
  const rows = await db.select<Application[]>("SELECT * FROM applications WHERE id = ?", [id]);
  return rows[0] ?? null;
}

async function validResumeId(id: number | null | undefined): Promise<number | null> {
  if (id == null) return null;
  if (cloudMode()) {
    const { data } = await supabase.from("resume_versions").select("id").eq("id", id).maybeSingle();
    return data ? id : null;
  }
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>("SELECT id FROM resume_versions WHERE id = ? LIMIT 1", [id]);
  return rows.length > 0 ? id : null;
}

// A blank date must become NULL — Postgres rejects "" for a `date` column
// (and SQLite is cleaner storing null than an empty string).
function dateOrNull(s: string | null | undefined): string | null {
  return s && s.trim() ? s : null;
}

export async function createApplication(input: ApplicationInput): Promise<number | null> {
  const companyId = await upsertCompany(input.company_name);
  const resumeId = await validResumeId(input.resume_version_id);
  if (cloudMode()) {
    const { data, error } = await supabase.from("applications").insert({
      company_id: companyId, role_title: input.role_title, job_link: input.job_link ?? null,
      location: input.location ?? null, status: input.status, date_applied: dateOrNull(input.date_applied),
      resume_version_id: resumeId, job_description: input.job_description ?? null,
      notes: input.notes ?? null, referral: input.referral ?? null,
    }).select("id").single();
    if (error) throw error;
    return (data?.id as number) ?? null;
  }
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO applications
       (company_id, role_title, job_link, location, status, date_applied,
        resume_version_id, job_description, notes, referral)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [companyId, input.role_title, input.job_link ?? null, input.location ?? null, input.status,
      dateOrNull(input.date_applied), resumeId, input.job_description ?? null, input.notes ?? null, input.referral ?? null],
  );
  return res.lastInsertId ?? null;
}

export async function updateApplication(id: number, input: ApplicationInput): Promise<void> {
  const companyId = await upsertCompany(input.company_name);
  const resumeId = await validResumeId(input.resume_version_id);
  if (cloudMode()) {
    const { error } = await supabase.from("applications").update({
      company_id: companyId, role_title: input.role_title, job_link: input.job_link ?? null,
      location: input.location ?? null, status: input.status, date_applied: dateOrNull(input.date_applied),
      resume_version_id: resumeId, job_description: input.job_description ?? null,
      notes: input.notes ?? null, referral: input.referral ?? null,
    }).eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute(
    `UPDATE applications SET
       company_id = ?, role_title = ?, job_link = ?, location = ?, status = ?,
       date_applied = ?, resume_version_id = ?, job_description = ?, notes = ?, referral = ?
     WHERE id = ?`,
    [companyId, input.role_title, input.job_link ?? null, input.location ?? null, input.status,
      dateOrNull(input.date_applied), resumeId, input.job_description ?? null, input.notes ?? null, input.referral ?? null, id],
  );
}

export async function deleteApplication(id: number): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("applications").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM applications WHERE id = ?", [id]);
}

export async function setApplicationStatus(id: number, status: Status): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("applications").update({ status }).eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE applications SET status = ? WHERE id = ?", [status, id]);
}
