import { getProfile } from "../db/profile";
import type { Profile } from "../db/types";
import { fetchAllListings } from "./sources";
import type { Listing, RankedListing } from "./types";

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
export function roleScore(title: string, roles: string[]): number {
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

// Titles that are not internships to apply to (courses, tutoring, talent pools…).
export const NON_ROLE =
  /\b(train(ing|ee)|bootcamp|boot camp|academy|course|certificat\w*|tutor\w*|teaching|instructor|mentorship|ambassador|volunteer|scholarship|workshop|seminar|talent (community|network|pool)|general application|expression of interest)\b/i;

// Signals that a title is a software-engineering role.
export const ENG_SIGNAL =
  /engineer|developer|\bswe\b|\bsde\b|software|programmer|full[\s-]?stack|front[\s-]?end|back[\s-]?end|data scien|machine learning|\bml\b|\bai\b|devops|\bsre\b|embedded|firmware|mobile|\bios\b|android|infrastructure|platform|systems|security|\bqa\b|test/i;

/** Whether the user is broadly targeting software-engineering roles. */
export function isGenericSwe(roles: string[]): boolean {
  return roles.some((r) => /software|full[\s-]?stack|front[\s-]?end|back[\s-]?end|swe|sde|developer|engineer/i.test(r));
}

/** Whether a listing is a real role matching the user's target roles. */
export function matchesTargetRoles(title: string, roles: string[]): boolean {
  if (NON_ROLE.test(title)) return false;
  if (!roles.length) return true;
  if (roleScore(title, roles) >= 0.5) return true;
  return isGenericSwe(roles) && ENG_SIGNAL.test(title);
}

/** Normalized 0-100 profile match, weighted toward target-role fit. */
function scoreListing(listing: Listing, profile: Profile | null): number {
  const roles = splitCsv(profile?.target_roles);
  const skills = splitCsv(profile?.skills);
  const locs = splitCsv(profile?.locations);
  const title = listing.title.toLowerCase();
  const listingLocs = listing.locations.join(" ").toLowerCase();

  // Courses / bootcamps / tutoring / talent pools are not internships — sink them.
  if (NON_ROLE.test(listing.title)) return 3;

  let rScore = roles.length ? roleScore(listing.title, roles) : 0.5;
  // A software-engineer's search should rank any engineering internship highly.
  if (rScore < 0.8 && isGenericSwe(roles) && ENG_SIGNAL.test(listing.title)) rScore = Math.max(rScore, 0.8);

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
 * Build the profile-tailored feed from all enabled sources: normalize + dedupe,
 * rank by relevance, flag brand-new postings (posted within the last few days),
 * and sort by best match then freshness.
 */
export async function getFeed(force = false): Promise<Feed> {
  const [listings, profile] = await Promise.all([fetchAllListings(force), getProfile()]);
  const roles = splitCsv(profile?.target_roles);
  const freshCutoff = Date.now() / 1000 - 5 * 24 * 60 * 60; // posted within 5 days

  const ranked: RankedListing[] = listings.map((l) => ({
    ...l,
    score: scoreListing(l, profile),
    isNew: !!l.datePosted && l.datePosted > freshCutoff,
    matchesRoles: matchesTargetRoles(l.title, roles),
    sponsorshipOk: sponsorshipOk(l, profile),
  }));

  // Best match first, then freshness — so relevant roles top the list, not random new ones.
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.datePosted ?? 0) - (a.datePosted ?? 0);
  });

  return { listings: ranked, newCount: ranked.filter((l) => l.isNew).length };
}
