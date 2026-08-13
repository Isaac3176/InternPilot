/**
 * Maps each résumé TRACK (General / Infra / AI / Full-stack) to a real résumé
 * version, so once you've assigned them, opening a company resolves to the exact
 * résumé to lead with — the last link in the apply-fast chain.
 */
import { trackFor, type ResumeTrack } from "./companies";

const KEY = "internpilot.trackResumes";
type TrackMap = Partial<Record<ResumeTrack, number>>;

export function getTrackResumes(): TrackMap {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as TrackMap; } catch { return {}; }
}
export function setTrackResume(track: ResumeTrack, versionId: number | null): void {
  const m = getTrackResumes();
  if (versionId == null) delete m[track]; else m[track] = versionId;
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ }
}
export function trackResumeId(track: ResumeTrack): number | null {
  return getTrackResumes()[track] ?? null;
}

/** The résumé version id to lead with for a company (via its track), or null. */
export function resumeIdForCompany(company: string): number | null {
  return trackResumeId(trackFor(company));
}
