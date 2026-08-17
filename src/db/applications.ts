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
  // Recruiting-diagnostics signals — captured by the apply flows; all optional.
  discovered_at?: string | null;
  applied_at?: string | null;
  posting_posted_at?: string | null;
  match_score?: number | null;
  eligibility?: string | null;
  source?: string | null;
  company_priority?: string | null;
}

const FUNNEL_RANK: Record<string, number> = { interested: 0, applied: 1, oa: 2, interview: 3, offer: 4 };
const nowIso = () => new Date().toISOString();

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
  // Diagnostics signals: default the timestamps so every new row is measurable.
  const discovered = input.discovered_at ?? nowIso();
  const applied = input.applied_at ?? (input.status === "applied" ? nowIso() : null);
  const furthest = FUNNEL_RANK[input.status] != null ? input.status : "applied";
  const diag = {
    discovered_at: discovered, applied_at: applied,
    posting_posted_at: input.posting_posted_at ?? null,
    match_score: input.match_score ?? null, eligibility: input.eligibility ?? null,
    source: input.source ?? null, company_priority: input.company_priority ?? null,
    furthest_stage: furthest,
  };
  if (cloudMode()) {
    const { data, error } = await supabase.from("applications").insert({
      company_id: companyId, role_title: input.role_title, job_link: input.job_link ?? null,
      location: input.location ?? null, status: input.status, date_applied: dateOrNull(input.date_applied),
      resume_version_id: resumeId, job_description: input.job_description ?? null,
      notes: input.notes ?? null, referral: input.referral ?? null, ...diag,
    }).select("id").single();
    if (error) throw error;
    return (data?.id as number) ?? null;
  }
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO applications
       (company_id, role_title, job_link, location, status, date_applied,
        resume_version_id, job_description, notes, referral,
        discovered_at, applied_at, posting_posted_at, match_score, eligibility, source, company_priority, furthest_stage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [companyId, input.role_title, input.job_link ?? null, input.location ?? null, input.status,
      dateOrNull(input.date_applied), resumeId, input.job_description ?? null, input.notes ?? null, input.referral ?? null,
      diag.discovered_at, diag.applied_at, diag.posting_posted_at, diag.match_score, diag.eligibility,
      diag.source, diag.company_priority, diag.furthest_stage],
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

/** True if a row is missing signals we can legitimately derive from its dates. */
export function needsBackfill(a: ApplicationRow): boolean {
  return (!a.discovered_at && !!a.date_saved) ||
    (!a.applied_at && !!a.date_applied) ||
    (!a.furthest_stage);
}

/**
 * Fill diagnostics signals on pre-capture rows from dates we already have:
 * discovered_at ← date_saved, applied_at ← date_applied, furthest_stage ← status
 * (a rejection is assumed to have at least Applied). Only fills blanks — never
 * overwrites captured data — and deliberately does NOT invent result_date, since a
 * fabricated reject timestamp would poison the rejection-timing view.
 */
export async function backfillDiagnostics(): Promise<number> {
  const stageFor = (status: string, hasApplied: boolean): string =>
    ["interested", "applied", "oa", "interview", "offer"].includes(status) ? status : hasApplied ? "applied" : "interested";

  if (cloudMode()) {
    const { data } = await supabase.from("applications").select("id, status, date_saved, date_applied, discovered_at, applied_at, furthest_stage");
    const rows = (data ?? []) as ApplicationRow[];
    let n = 0;
    for (const a of rows) {
      const patch: Record<string, unknown> = {};
      if (!a.discovered_at && a.date_saved) patch.discovered_at = a.date_saved;
      if (!a.applied_at && a.date_applied) patch.applied_at = a.date_applied;
      if (!a.furthest_stage) patch.furthest_stage = stageFor(a.status, !!a.date_applied);
      if (Object.keys(patch).length) {
        const { error } = await supabase.from("applications").update(patch).eq("id", a.id);
        if (!error) n++;
      }
    }
    return n;
  }

  const db = await getDb();
  const r1 = await db.execute("UPDATE applications SET discovered_at = date_saved WHERE discovered_at IS NULL AND date_saved IS NOT NULL");
  const r2 = await db.execute("UPDATE applications SET applied_at = date_applied WHERE applied_at IS NULL AND date_applied IS NOT NULL");
  const r3 = await db.execute(
    `UPDATE applications SET furthest_stage = CASE
        WHEN status IN ('interested','applied','oa','interview','offer') THEN status
        WHEN date_applied IS NOT NULL THEN 'applied'
        ELSE 'interested' END
     WHERE furthest_stage IS NULL`);
  return Math.max(r1.rowsAffected ?? 0, r2.rowsAffected ?? 0, r3.rowsAffected ?? 0);
}

export async function setApplicationStatus(id: number, status: Status): Promise<void> {
  // Also advance the diagnostics signals: keep the deepest funnel stage ever
  // reached (so a rejection still remembers it got to OA/interview), stamp
  // applied_at on first apply, and record result_date on a terminal outcome.
  const patch: Record<string, unknown> = { status };
  let cur: { furthest_stage?: string | null; applied_at?: string | null } | null = null;
  if (cloudMode()) {
    const { data } = await supabase.from("applications").select("furthest_stage, applied_at").eq("id", id).maybeSingle();
    cur = (data as typeof cur) ?? null;
  } else {
    const rows = await (await getDb()).select<{ furthest_stage: string | null; applied_at: string | null }[]>(
      "SELECT furthest_stage, applied_at FROM applications WHERE id = ? LIMIT 1", [id]);
    cur = rows[0] ?? null;
  }
  const curRank = cur?.furthest_stage != null ? FUNNEL_RANK[cur.furthest_stage] ?? -1 : -1;
  if (FUNNEL_RANK[status] != null && FUNNEL_RANK[status] > curRank) patch.furthest_stage = status;
  if (status === "applied" && !cur?.applied_at) patch.applied_at = nowIso();
  if (status === "offer" || status === "rejected") patch.result_date = nowIso();

  if (cloudMode()) {
    const { error } = await supabase.from("applications").update(patch).eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  const cols = Object.keys(patch);
  const set = cols.map((c) => `${c} = ?`).join(", ");
  await db.execute(`UPDATE applications SET ${set} WHERE id = ?`, [...cols.map((c) => patch[c]), id]);
}
