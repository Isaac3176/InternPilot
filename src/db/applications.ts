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

export async function createApplication(input: ApplicationInput): Promise<number | null> {
  const db = await getDb();
  const companyId = await upsertCompany(input.company_name);
  const res = await db.execute(
    `INSERT INTO applications
       (company_id, role_title, job_link, location, status, date_applied,
        resume_version_id, job_description, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      input.role_title,
      input.job_link ?? null,
      input.location ?? null,
      input.status,
      input.date_applied ?? null,
      input.resume_version_id ?? null,
      input.job_description ?? null,
      input.notes ?? null,
    ],
  );
  return res.lastInsertId ?? null;
}

export async function updateApplication(id: number, input: ApplicationInput): Promise<void> {
  const db = await getDb();
  const companyId = await upsertCompany(input.company_name);
  await db.execute(
    `UPDATE applications SET
       company_id = ?, role_title = ?, job_link = ?, location = ?, status = ?,
       date_applied = ?, resume_version_id = ?, job_description = ?, notes = ?
     WHERE id = ?`,
    [
      companyId,
      input.role_title,
      input.job_link ?? null,
      input.location ?? null,
      input.status,
      input.date_applied ?? null,
      input.resume_version_id ?? null,
      input.job_description ?? null,
      input.notes ?? null,
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
