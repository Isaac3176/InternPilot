import { httpFetch } from "../lib/http";
import { getProfile } from "../db/profile";
import type { Profile } from "../db/types";
import { getLastSeenPosted, getListingsUrl, setLastSeenPosted } from "./config";
import type { Listing, RankedListing } from "./types";

interface RawListing {
  id?: string;
  company_name?: string;
  title?: string;
  url?: string;
  locations?: string[];
  sponsorship?: string;
  date_posted?: number;
  active?: boolean;
  is_visible?: boolean;
  season?: string;
}

/** Fetch and normalize active, visible listings from the configured source. */
export async function fetchListings(): Promise<Listing[]> {
  const res = await httpFetch(getListingsUrl());
  if (!res.ok) throw new Error(`Failed to fetch listings (${res.status}).`);
  const raw = (await res.json()) as RawListing[];
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((r) => r.is_visible !== false && r.active !== false && r.url && (r.company_name || r.title))
    .map((r) => ({
      id: r.id ?? `${r.company_name ?? ""}-${r.title ?? ""}-${r.url ?? ""}`,
      company: r.company_name ?? "Unknown",
      title: r.title ?? "",
      url: r.url ?? "",
      locations: Array.isArray(r.locations) ? r.locations : [],
      sponsorship: r.sponsorship,
      datePosted: r.date_posted,
      season: r.season,
    }));
}

function splitCsv(value: string | null | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sponsorshipOk(listing: Listing, profile: Profile | null): boolean {
  if (profile?.work_auth !== "need_sponsorship") return true;
  const s = (listing.sponsorship ?? "").toLowerCase();
  return !(s.includes("does not offer") || s.includes("citizenship is required"));
}

/** Heuristic relevance score of a listing against the user's profile. */
function scoreListing(listing: Listing, profile: Profile | null): number {
  if (!profile) return 0;
  let score = 0;
  const title = listing.title.toLowerCase();
  const listingLocs = listing.locations.join(" ").toLowerCase();

  for (const role of splitCsv(profile.target_roles)) if (title.includes(role)) score += 30;
  for (const skill of splitCsv(profile.skills)) if (title.includes(skill)) score += 5;
  for (const loc of splitCsv(profile.locations)) {
    if (listingLocs.includes(loc)) score += 15;
  }
  if (profile.remote_pref === "remote" && listingLocs.includes("remote")) score += 10;
  if (!sponsorshipOk(listing, profile)) score -= 40;

  return score;
}

export interface Feed {
  listings: RankedListing[];
  newCount: number;
}

/**
 * Build the profile-tailored feed: rank by relevance, flag brand-new postings
 * (posted after the last time the feed was reviewed), and sort freshest/most
 * relevant first. Does not mutate the last-seen marker — call markFeedSeen for that.
 */
export async function getFeed(): Promise<Feed> {
  const [listings, profile] = await Promise.all([fetchListings(), getProfile()]);
  const lastSeen = getLastSeenPosted();

  const ranked: RankedListing[] = listings.map((l) => ({
    ...l,
    score: scoreListing(l, profile),
    isNew: !!l.datePosted && l.datePosted > lastSeen,
    sponsorshipOk: sponsorshipOk(l, profile),
  }));

  ranked.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return (b.datePosted ?? 0) - (a.datePosted ?? 0);
  });

  return { listings: ranked, newCount: ranked.filter((l) => l.isNew).length };
}

/** Mark the current newest listing as seen so future syncs only flag newer ones. */
export function markFeedSeen(listings: Listing[]): void {
  const maxPosted = listings.reduce((max, l) => Math.max(max, l.datePosted ?? 0), getLastSeenPosted());
  setLastSeenPosted(maxPosted);
}
