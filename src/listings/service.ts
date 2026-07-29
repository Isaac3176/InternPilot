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

// Generic words that don't help distinguish a role.
const ROLE_STOP = new Set([
  "engineer", "engineering", "developer", "development", "intern", "internship",
  "co", "op", "coop", "i", "ii", "iii", "senior", "staff", "jr", "sr", "new",
  "grad", "graduate", "university", "the", "and", "of", "for", "a", "an", "role", "roles",
]);

/** Break a target role into distinguishing tokens + synonym phrases. */
function roleKeywords(role: string): { tokens: string[]; phrases: string[] } {
  const clean = role.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = clean.split(/\s+/).filter((t) => t && !ROLE_STOP.has(t));
  const phrases: string[] = [];
  if (/software/.test(clean)) phrases.push("swe", "sde", "software");
  if (/machine learning|\bai\b|\bml\b/.test(clean)) phrases.push("machine learning", "ml", "ai");
  if (/full[\s-]?stack/.test(clean)) phrases.push("full stack", "fullstack", "full-stack");
  if (/front[\s-]?end/.test(clean)) phrases.push("frontend", "front end", "front-end");
  if (/back[\s-]?end/.test(clean)) phrases.push("backend", "back end", "back-end");
  if (/data scien/.test(clean)) phrases.push("data scien");
  return { tokens, phrases };
}

/** 0..1 best match of the title against any of the user's target roles. */
function roleScore(title: string, roles: string[]): number {
  const t = title.toLowerCase();
  let best = 0;
  for (const role of roles) {
    const { tokens, phrases } = roleKeywords(role);
    if (phrases.some((p) => t.includes(p))) {
      best = 1;
      continue;
    }
    if (tokens.length === 0) continue;
    const matched = tokens.filter((tok) => t.includes(tok)).length;
    best = Math.max(best, matched / tokens.length);
  }
  return best;
}

/** Normalized 0-100 profile match, weighted toward target-role fit. */
function scoreListing(listing: Listing, profile: Profile | null): number {
  const roles = splitCsv(profile?.target_roles);
  const skills = splitCsv(profile?.skills);
  const locs = splitCsv(profile?.locations);
  const title = listing.title.toLowerCase();
  const listingLocs = listing.locations.join(" ").toLowerCase();

  const rScore = roles.length ? roleScore(listing.title, roles) : 0.5;
  const skillHit = skills.length ? skills.filter((s) => title.includes(s)).length / skills.length : 0;
  const locHit = locs.length ? (locs.some((l) => listingLocs.includes(l)) ? 1 : 0) : 0;

  let score = 0.8 * rScore + 0.12 * skillHit + 0.08 * locHit;
  if (!sponsorshipOk(listing, profile)) score *= 0.5;
  return Math.round(score * 100);
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
  const roles = splitCsv(profile?.target_roles);

  const ranked: RankedListing[] = listings.map((l) => ({
    ...l,
    score: scoreListing(l, profile),
    isNew: !!l.datePosted && l.datePosted > lastSeen,
    matchesRoles: roles.length ? roleScore(l.title, roles) >= 0.5 : true,
    sponsorshipOk: sponsorshipOk(l, profile),
  }));

  // Best match first, then freshness — so relevant roles top the list, not random new ones.
  ranked.sort((a, b) => {
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
