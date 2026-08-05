import { getDb } from "./index";
import { upsertCompany } from "./companies";
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
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts?.status && opts.status !== "all") {
    where.push("a.status = ?");
    params.push(opts.status);
  }
  if (opts?.search?.trim()) {
    const term = `%${opts.search.trim()}%`;
    where.push("(a.role_title LIKE ? OR c.name LIKE ? OR a.location LIKE ?)");
    params.push(term, term, term);
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
  const db = await getDb();
  const rows = await db.select<Application[]>("SELECT * FROM applications WHERE id = ?", [id]);
  return rows[0] ?? null;
}

/** Return the id only if that résumé version still exists (else null), so a
 *  stale preferred-résumé id can't trip the resume_version_id foreign key. */
async function validResumeId(id: number | null | undefined): Promise<number | null> {
  if (id == null) return null;
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>("SELECT id FROM resume_versions WHERE id = ? LIMIT 1", [id]);
  return rows.length > 0 ? id : null;
}

export async function createApplication(input: ApplicationInput): Promise<number | null> {
  const db = await getDb();
  const companyId = await upsertCompany(input.company_name);
  const resumeId = await validResumeId(input.resume_version_id);
  const res = await db.execute(
    `INSERT INTO applications
       (company_id, role_title, job_link, location, status, date_applied,
        resume_version_id, job_description, notes, referral)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      input.role_title,
      input.job_link ?? null,
      input.location ?? null,
      input.status,
      input.date_applied ?? null,
      resumeId,
      input.job_description ?? null,
      input.notes ?? null,
      input.referral ?? null,
    ],
  );
  return res.lastInsertId ?? null;
}

export async function updateApplication(id: number, input: ApplicationInput): Promise<void> {
  const db = await getDb();
  const companyId = await upsertCompany(input.company_name);
  const resumeId = await validResumeId(input.resume_version_id);
  await db.execute(
    `UPDATE applications SET
       company_id = ?, role_title = ?, job_link = ?, location = ?, status = ?,
       date_applied = ?, resume_version_id = ?, job_description = ?, notes = ?, referral = ?
     WHERE id = ?`,
    [
      companyId,
      input.role_title,
      input.job_link ?? null,
      input.location ?? null,
      input.status,
      input.date_applied ?? null,
      resumeId,
      input.job_description ?? null,
      input.notes ?? null,
      input.referral ?? null,
      id,
    ],
  );
}

export async function deleteApplication(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM applications WHERE id = ?", [id]);
}

export async function setApplicationStatus(id: number, status: Status): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE applications SET status = ? WHERE id = ?", [status, id]);
}
