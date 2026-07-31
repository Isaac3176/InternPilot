/**
 * Internship listing sources. Defaults to two public feeds — a curated one
 * (SimplifyJobs Summer 2027) and an automated ATS-polling engine (rich fields:
 * skills, salary, sponsorship, first-seen). Both are configurable, and each can
 * be toggled, so the app never depends on a single static dataset.
 */
const K_SIMPLIFY_URL = "internpilot.listings.simplifyUrl";
const K_AUTO_URL = "internpilot.listings.autoUrl";
const K_SIMPLIFY_ON = "internpilot.listings.simplifyOn";
const K_AUTO_ON = "internpilot.listings.autoOn";

export const DEFAULT_SIMPLIFY_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json";
export const DEFAULT_AUTO_URL =
  "https://zshah101.github.io/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships/api/jobs.json";

export function getSimplifyUrl(): string {
  return localStorage.getItem(K_SIMPLIFY_URL) || DEFAULT_SIMPLIFY_URL;
}
export function setSimplifyUrl(v: string): void {
  if (v) localStorage.setItem(K_SIMPLIFY_URL, v);
  else localStorage.removeItem(K_SIMPLIFY_URL);
}
export function getAutoUrl(): string {
  return localStorage.getItem(K_AUTO_URL) || DEFAULT_AUTO_URL;
}
export function setAutoUrl(v: string): void {
  if (v) localStorage.setItem(K_AUTO_URL, v);
  else localStorage.removeItem(K_AUTO_URL);
}
export function isSimplifyOn(): boolean {
  return localStorage.getItem(K_SIMPLIFY_ON) !== "0";
}
export function isAutoOn(): boolean {
  return localStorage.getItem(K_AUTO_ON) !== "0";
}
export function setSimplifyOn(on: boolean): void {
  localStorage.setItem(K_SIMPLIFY_ON, on ? "1" : "0");
}
export function setAutoOn(on: boolean): void {
  localStorage.setItem(K_AUTO_ON, on ? "1" : "0");
}
