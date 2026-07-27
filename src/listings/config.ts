/**
 * Internship listings source configuration. Defaults to the community
 * SimplifyJobs Summer-Internships listings.json (updated daily). Configurable
 * so it can point at a newer cycle's repo without a code change.
 */
const K_URL = "internpilot.listings.url";
const K_LAST_SEEN = "internpilot.listings.lastSeenPosted";

export const DEFAULT_LISTINGS_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json";

export function getListingsUrl(): string {
  return localStorage.getItem(K_URL) || DEFAULT_LISTINGS_URL;
}

export function setListingsUrl(value: string): void {
  if (value) localStorage.setItem(K_URL, value);
  else localStorage.removeItem(K_URL);
}

/** Timestamp (unix seconds) of the newest listing seen so far, for new-since detection. */
export function getLastSeenPosted(): number {
  const raw = localStorage.getItem(K_LAST_SEEN);
  return raw ? Number(raw) || 0 : 0;
}

export function setLastSeenPosted(ts: number): void {
  localStorage.setItem(K_LAST_SEEN, String(ts));
}
