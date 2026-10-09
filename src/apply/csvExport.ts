/** Export the application tracker as a CSV spreadsheet. */
import { STATUS_LABELS, type ApplicationRow } from "../db/types";

/** ISO timestamp or SQLite "YYYY-MM-DD HH:MM:SS" → just the date portion. */
function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const COLUMNS: { label: string; get: (a: ApplicationRow) => string }[] = [
  { label: "Company", get: (a) => a.company_name ?? "" },
  { label: "Role", get: (a) => a.role_title },
  { label: "Status", get: (a) => STATUS_LABELS[a.status] ?? a.status },
  { label: "Location", get: (a) => a.location ?? "" },
  { label: "Date saved", get: (a) => formatDate(a.date_saved) },
  { label: "Date applied", get: (a) => formatDate(a.date_applied) },
  { label: "Résumé version", get: (a) => a.resume_version_name ?? "" },
  { label: "Referral", get: (a) => a.referral ?? "" },
  { label: "Job link", get: (a) => a.job_link ?? "" },
  { label: "Notes", get: (a) => a.notes ?? "" },
];

/** Builds the CSV text (no BOM — add one at the Blob/download layer for Excel). */
export function applicationsToCsv(rows: ApplicationRow[]): string {
  const header = COLUMNS.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((r) => COLUMNS.map((c) => escapeCsvField(c.get(r))).join(","));
  return [header, ...lines].join("\r\n");
}

/** Builds a download filename stamped with today's date. */
export function csvFileName(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `internpilot-applications-${today}.csv`;
}
