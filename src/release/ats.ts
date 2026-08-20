/**
 * Live ATS client. Instead of only *predicting* when a company opens (see
 * history.ts — capped at ~45d by year-over-year noise), this reads the company's
 * actual applicant-tracking job board and reports roles that are posted RIGHT NOW.
 *
 * Coverage strategy, tuned to never show the wrong company's jobs:
 *  - Greenhouse is the most common tech ATS AND its board exposes the company
 *    name, so we AUTO-DISCOVER a company's board by probing slug candidates and
 *    verifying the returned board name matches. Safe to run for any watchlist co.
 *  - Lever / Ashby boards don't expose a verifiable company name, so we only use
 *    them from the curated ATS_OVERRIDES map (known-correct tokens).
 *
 * All requests go through httpFetch (Rust on desktop → no CORS; the public
 * board APIs also send permissive CORS headers, so the web build works too).
 */
import { httpFetch } from "../lib/http";

export type AtsProvider = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workday";

export interface AtsPosting {
  id: string;
  title: string;
  url: string;
  location: string;
  postedAt: number | null; // unix seconds, when known
}

/** Workday needs a full per-tenant address (host + tenant + site), not just a slug. */
interface WorkdayCfg { host: string; tenant: string; site: string }
interface AtsRef { provider: AtsProvider; token: string; wd?: WorkdayCfg }

/**
 * Curated boards for the providers we can't safely auto-discover:
 *  - Lever / Ashby expose no verifiable company name.
 *  - Workday is per-tenant (host + tenant + site) with no probeable slug.
 * Every entry below was confirmed live against the real API. Greenhouse and
 * SmartRecruiters ARE auto-discovered (their responses carry the company name),
 * so they don't need entries here.
 *
 * To add a Workday company: open its careers site (…myworkdayjobs.com/…), the URL
 * is https://{host}/{site}/… and the tenant is the first path segment after cxs.
 */
const ATS_OVERRIDES: Record<string, AtsRef> = {
  openai: { provider: "ashby", token: "openai" },
  ramp: { provider: "ashby", token: "ramp" },
  notion: { provider: "ashby", token: "notion" },
  linear: { provider: "ashby", token: "linear" },
  cursor: { provider: "ashby", token: "cursor" },
  anysphere: { provider: "ashby", token: "cursor" },
  perplexity: { provider: "ashby", token: "perplexity" },
  cohere: { provider: "ashby", token: "cohere" },
  palantir: { provider: "lever", token: "palantir" },
  // Workday (confirmed live):
  nvidia: { provider: "workday", token: "nvidia", wd: { host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" } },
  salesforce: { provider: "workday", token: "salesforce", wd: { host: "salesforce.wd12.myworkdayjobs.com", tenant: "salesforce", site: "External_Career_Site" } },
  adobe: { provider: "workday", token: "adobe", wd: { host: "adobe.wd5.myworkdayjobs.com", tenant: "adobe", site: "external_experienced" } },
  hp: { provider: "workday", token: "hp", wd: { host: "hp.wd5.myworkdayjobs.com", tenant: "hp", site: "ExternalCareerSite" } },
  mastercard: { provider: "workday", token: "mastercard", wd: { host: "mastercard.wd1.myworkdayjobs.com", tenant: "mastercard", site: "CorporateCareers" } },
  dell: { provider: "workday", token: "dell", wd: { host: "dell.wd1.myworkdayjobs.com", tenant: "dell", site: "External" } },
  workday: { provider: "workday", token: "workday", wd: { host: "workday.wd5.myworkdayjobs.com", tenant: "workday", site: "Workday" } },
};

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Slug candidates to probe for a company's Greenhouse board. */
function slugCandidates(company: string): string[] {
  const n = norm(company);
  const words = company.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/);
  const out = new Set<string>([n, words.join("-"), words[0]]);
  // Drop common suffixes that boards usually omit.
  const stripped = words.filter((w) => !["inc", "labs", "technologies", "corp", "co", "the"].includes(w));
  if (stripped.length) { out.add(stripped.join("")); out.add(stripped.join("-")); }
  return [...out].filter((s) => s && s.length >= 2);
}

const withTimeout = async (url: string, ms = 9000): Promise<Response | null> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await httpFetch(url, { signal: ctrl.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const nameMatches = (boardName: string, company: string): boolean => {
  const b = norm(boardName), c = norm(company);
  if (!b || !c) return false;
  return b === c || b.includes(c) || c.includes(b) || norm(company.split(/\s+/)[0]) === norm(boardName.split(/\s+/)[0]);
};

// --- Per-provider fetchers → normalized AtsPosting[] (null on failure) ---

async function fetchGreenhouse(token: string): Promise<AtsPosting[] | null> {
  const res = await withTimeout(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
  if (!res) return null;
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.jobs)) return null;
  return data.jobs.map((j: any) => ({
    id: `gh:${token}:${j.id}`,
    title: String(j.title ?? ""),
    url: String(j.absolute_url ?? ""),
    location: String(j.location?.name ?? ""),
    postedAt: j.updated_at ? Math.floor(Date.parse(j.updated_at) / 1000) : null,
  }));
}

async function fetchLever(token: string): Promise<AtsPosting[] | null> {
  const res = await withTimeout(`https://api.lever.co/v0/postings/${token}?mode=json`);
  if (!res) return null;
  const arr = await res.json().catch(() => null);
  if (!Array.isArray(arr)) return null;
  return arr.map((j: any) => ({
    id: `lever:${token}:${j.id}`,
    title: String(j.text ?? ""),
    url: String(j.hostedUrl ?? j.applyUrl ?? ""),
    location: String(j.categories?.location ?? ""),
    postedAt: j.createdAt ? Math.floor(j.createdAt / 1000) : null,
  }));
}

async function fetchAshby(token: string): Promise<AtsPosting[] | null> {
  const res = await withTimeout(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
  if (!res) return null;
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.jobs)) return null;
  return data.jobs.filter((j: any) => j.isListed !== false).map((j: any) => ({
    id: `ashby:${token}:${j.id ?? j.jobId}`,
    title: String(j.title ?? ""),
    url: String(j.jobUrl ?? j.applyUrl ?? ""),
    location: String(j.location ?? j.locationName ?? ""),
    postedAt: j.publishedAt ? Math.floor(Date.parse(j.publishedAt) / 1000) : null,
  }));
}

async function fetchSmartRecruiters(token: string): Promise<AtsPosting[] | null> {
  const res = await withTimeout(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100`);
  if (!res) return null;
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.content)) return null;
  return data.content.map((j: any) => ({
    id: `sr:${token}:${j.id}`,
    title: String(j.name ?? ""),
    url: `https://jobs.smartrecruiters.com/${token}/${j.id}`,
    location: [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(", ") || (j.location?.remote ? "Remote" : ""),
    postedAt: j.releasedDate ? Math.floor(Date.parse(j.releasedDate) / 1000) : null,
  }));
}

async function fetchWorkday(ref: AtsRef): Promise<AtsPosting[] | null> {
  const wd = ref.wd;
  if (!wd) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    // searchText 'internship' narrows a huge board to intern-relevant postings;
    // isInternRole (live.ts) then keeps only the real early-career SWE ones.
    const res = await httpFetch(`https://${wd.host}/wday/cxs/${wd.tenant}/${wd.site}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: "internship" }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.jobPostings)) return null;
    return data.jobPostings.map((j: any) => ({
      id: `wd:${wd.tenant}:${j.externalPath ?? j.title}`,
      title: String(j.title ?? ""),
      url: `https://${wd.host}/${wd.site}${j.externalPath ?? ""}`,
      location: String(j.locationsText ?? ""),
      postedAt: null, // Workday reports "Posted N days ago", not a real date
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const fetchByProvider = (ref: AtsRef): Promise<AtsPosting[] | null> =>
  ref.provider === "greenhouse" ? fetchGreenhouse(ref.token)
  : ref.provider === "lever" ? fetchLever(ref.token)
  : ref.provider === "ashby" ? fetchAshby(ref.token)
  : ref.provider === "smartrecruiters" ? fetchSmartRecruiters(ref.token)
  : fetchWorkday(ref);

// --- Resolution cache: company → board (or a negative result with TTL) ---

const CACHE_KEY = "internpilot.ats.resolve.v1";
const NEG_TTL = 14 * 24 * 3600 * 1000; // re-probe unresolved companies every 2 weeks
type CacheVal = { ref: AtsRef } | { none: true; ts: number };

function readCache(): Record<string, CacheVal> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}"); } catch { return {}; }
}
function writeCache(c: Record<string, CacheVal>): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

/** Resolve a company to its ATS board: overrides → cache → verified Greenhouse probe. */
export async function resolveAts(company: string): Promise<AtsRef | null> {
  const key = norm(company);
  if (!key) return null;
  if (ATS_OVERRIDES[key]) return ATS_OVERRIDES[key];

  const cache = readCache();
  const hit = cache[key];
  if (hit) {
    if ("ref" in hit) return hit.ref;
    if (Date.now() - hit.ts < NEG_TTL) return null; // still within negative TTL
  }

  // Auto-discover a Greenhouse board by verifying the board name matches.
  for (const token of slugCandidates(company)) {
    const meta = await withTimeout(`https://boards-api.greenhouse.io/v1/boards/${token}`);
    if (!meta) continue;
    const data = await meta.json().catch(() => null);
    if (data?.name && nameMatches(String(data.name), company)) {
      const ref: AtsRef = { provider: "greenhouse", token };
      cache[key] = { ref }; writeCache(cache);
      return ref;
    }
  }
  // Then SmartRecruiters — its postings carry company.name, so it's verifiable too.
  for (const token of slugCandidates(company)) {
    const res = await withTimeout(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=1`);
    if (!res) continue;
    const data = await res.json().catch(() => null);
    const nm = data?.content?.[0]?.company?.name;
    if (nm && nameMatches(String(nm), company)) {
      const ref: AtsRef = { provider: "smartrecruiters", token };
      cache[key] = { ref }; writeCache(cache);
      return ref;
    }
  }
  cache[key] = { none: true, ts: Date.now() }; writeCache(cache);
  return null;
}

/** All current postings from a company's board, or null if it has no known/reachable board. */
export async function fetchCompanyPostings(company: string): Promise<AtsPosting[] | null> {
  const ref = await resolveAts(company);
  if (!ref) return null;
  return fetchByProvider(ref);
}
