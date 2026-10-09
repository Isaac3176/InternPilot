import { describe, expect, it } from "vitest";
import { applicationsToCsv } from "./csvExport";
import type { ApplicationRow } from "../db/types";

function row(overrides: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: 1, company_id: 1, company_name: "Acme", resume_version_name: null,
    role_title: "Software Engineer Intern", job_link: "https://example.com/job",
    location: "Remote", status: "applied", date_saved: "2026-01-05T00:00:00.000Z",
    date_applied: "2026-01-06T00:00:00.000Z", resume_version_id: null,
    job_description: null, notes: null, referral: null, created_at: "2026-01-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("applicationsToCsv", () => {
  it("writes a header row and one row per application with human-readable status", () => {
    const csv = applicationsToCsv([row()]);
    const [header, data] = csv.split("\r\n");
    expect(header).toBe("Company,Role,Status,Location,Date saved,Date applied,Résumé version,Referral,Job link,Notes");
    expect(data).toBe("Acme,Software Engineer Intern,Applied,Remote,2026-01-05,2026-01-06,,,https://example.com/job,");
  });

  it("quotes fields containing commas, quotes, or newlines, doubling internal quotes", () => {
    const csv = applicationsToCsv([row({
      company_name: "Acme, Inc.",
      notes: 'Recruiter said "fast turnaround"\nFollow up Friday',
    })]);
    const [, data] = csv.split("\r\n");
    expect(data).toContain('"Acme, Inc."');
    expect(data).toContain('"Recruiter said ""fast turnaround""\nFollow up Friday"');
  });

  it("leaves missing fields blank rather than writing \"null\" or \"undefined\"", () => {
    const csv = applicationsToCsv([row({ company_name: null, notes: null, referral: null })]);
    const [, data] = csv.split("\r\n");
    expect(data).not.toMatch(/null|undefined/i);
  });

  it("produces only a header row for an empty tracker", () => {
    const csv = applicationsToCsv([]);
    expect(csv.split("\r\n")).toHaveLength(1);
  });
});
