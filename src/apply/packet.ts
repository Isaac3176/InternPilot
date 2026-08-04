/**
 * Application packet: everything you need to apply, assembled before you click —
 * JD snapshot, eligibility, recommended résumé + match, referral contacts, and a
 * checklist. Built from pieces the app already has so "Prepare" and "Apply now"
 * open a ready-to-go screen instead of a blank posting.
 */
import type { RankedListing } from "../listings/types";
import type { ContactRow, Profile, ResumeVersion } from "../db/types";
import { getProfile } from "../db/profile";
import { listContacts } from "../db/contacts";
import { listResumeVersions, getResumeVersion } from "../db/resumes";
import { fetchJobDescription } from "../listings/description";
import { jdSkillMatch, type JdMatch } from "../listings/match";
import { assessEligibility, type Eligibility } from "../listings/eligibility";
import { recommendResume } from "../ranking/queue";

export interface ApplicationPacket {
  listing: RankedListing;
  eligibility: Eligibility;
  jd: string; // description text ("" if unavailable)
  jdOk: boolean;
  resume: ResumeVersion | null;
  match: JdMatch | null;
  contacts: ContactRow[]; // saved contacts at this company
}

function normName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Assemble the full packet for a listing (network for the JD; rest is local). */
export async function buildPacket(listing: RankedListing): Promise<ApplicationPacket> {
  const [profile, resumes, contacts] = await Promise.all([
    getProfile(),
    listResumeVersions(),
    listContacts(),
  ]);

  let jd = "";
  try { jd = await fetchJobDescription(listing.url); } catch { /* JD is best-effort */ }
  const jdOk = jd.trim().length > 0;

  const eligibility = assessEligibility(profile as Profile | null, listing, jdOk ? jd : undefined);

  const resume = recommendResume(listing, resumes);
  let match: JdMatch | null = null;
  if (resume) {
    const content = resume.content ?? (resume.id ? (await getResumeVersion(resume.id))?.content ?? "" : "");
    const resumeText = `${content} ${profile?.skills ?? ""}`;
    match = jdSkillMatch(jdOk ? jd : listing.title, resumeText);
  }

  const key = normName(listing.company);
  const relevant = contacts.filter((c) => {
    const ck = normName(c.company_name ?? "");
    return ck && (ck === key || ck.includes(key) || key.includes(ck));
  });

  return { listing, eligibility, jd, jdOk, resume, match, contacts: relevant };
}

// ---- checklist (persisted per job) ----
export const PACKET_CHECKLIST = [
  "Résumé reviewed & exported",
  "Application questions / short answers ready",
  "Portfolio & GitHub links verified",
  "Work authorization answer confirmed",
  "Referral contacted (if available)",
  "Application submitted",
];

function checkKey(jobId: string): string {
  return `internpilot.packet.check.${jobId}`;
}
export function getChecklist(jobId: string): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(checkKey(jobId)) ?? "[]")); }
  catch { return new Set(); }
}
export function setChecklistItem(jobId: string, index: number, done: boolean): void {
  const s = getChecklist(jobId);
  if (done) s.add(index); else s.delete(index);
  localStorage.setItem(checkKey(jobId), JSON.stringify([...s]));
}
