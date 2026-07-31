import { httpFetch } from "../lib/http";
import { getAutoUrl, getSimplifyUrl, isAutoOn, isSimplifyOn } from "./config";
import type { Listing } from "./types";

interface SimplifyRaw {
  company_name?: string;
  title?: string;
  url?: string;
  locations?: string[];
  active?: boolean;
  is_visible?: boolean;
  sponsorship?: string;
  season?: string;
  terms?: string[];
  date_posted?: number;
}

interface AutoRaw {
  id?: string;
  company?: string;
  title?: string;
  season?: string;
  season_inferred?: boolean;
  location?: string;
  url?: string;
  posted_at?: string | null;
  first_seen_at?: string;
  sponsorship?: string;
  salary?: string | null;
  skills?: string[];
  source?: string;
  remote?: boolean;
}

function isoToUnix(s?: string | null): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : Math.floor(t / 1000);
}

/** Curated feed (SimplifyJobs). Human-maintained, stated sponsorship/season. */
async function fetchSimplify(): Promise<Listing[]> {
  const res = await httpFetch(getSimplifyUrl());
  if (!res.ok) throw new Error(`Curated feed responded ${res.status}`);
  const raw = (await res.json()) as SimplifyRaw[];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r.is_visible !== false && r.active !== false && r.url && (r.company_name || r.title))
    .map((r) => ({
      id: `simplify:${r.url}`,
      company: r.company_name ?? "Unknown",
      title: r.title ?? "",
      url: r.url ?? "",
      locations: Array.isArray(r.locations) ? r.locations : [],
      sponsorship: r.sponsorship,
      datePosted: r.date_posted,
      firstSeen: r.date_posted,
      season: r.season ?? (Array.isArray(r.terms) ? r.terms[0] : undefined),
      seasonInferred: false,
      source: "SimplifyJobs",
    }));
}

const SPONSOR_LABEL: Record<string, string> = {
  "citizens-only": "U.S. citizenship is required",
  "no-sponsorship": "Does not offer sponsorship",
};

/** Automated ATS-polling engine. Rich fields: skills, salary, first-seen, source ATS. */
async function fetchAuto(): Promise<Listing[]> {
  const res = await httpFetch(getAutoUrl());
  if (!res.ok) throw new Error(`Automated feed responded ${res.status}`);
  const data = await res.json();
  const jobs: AutoRaw[] = Array.isArray(data) ? data : data?.jobs ?? [];
  return jobs
    .filter((j) => j.url && (j.company || j.title))
    .map((j) => ({
      id: j.id ?? `auto:${j.url}`,
      company: j.company ?? "Unknown",
      title: j.title ?? "",
      url: j.url ?? "",
      locations: j.location ? [j.location] : [],
      sponsorship: j.sponsorship && j.sponsorship !== "unknown" ? SPONSOR_LABEL[j.sponsorship] ?? j.sponsorship : undefined,
      datePosted: isoToUnix(j.posted_at),
      firstSeen: isoToUnix(j.first_seen_at),
      season: j.season ?? undefined,
      seasonInferred: !!j.season_inferred,
      salary: j.salary ?? undefined,
      remote: !!j.remote,
      skills: Array.isArray(j.skills) && j.skills.length ? j.skills : undefined,
      source: j.source ? `AutoEngine:${j.source}` : "AutoEngine",
    }));
}

// ---- merge + dedupe across sources ----
function normStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function dedupeKey(l: Listing): string {
  return [normStr(l.company), normStr(l.title), normStr(l.locations[0] ?? ""), (l.season ?? "").toLowerCase()].join("|");
}
function firstDefined<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) {
    if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)) return v;
  }
  return undefined;
}
function merge(a: Listing, b: Listing): Listing {
  const firstSeen = Math.min(a.firstSeen ?? Number.MAX_SAFE_INTEGER, b.firstSeen ?? Number.MAX_SAFE_INTEGER);
  return {
    id: a.id,
    company: a.company,
    title: a.title,
    url: firstDefined(a.url, b.url) ?? a.url,
    locations: a.locations.length ? a.locations : b.locations,
    sponsorship: firstDefined(a.sponsorship, b.sponsorship),
    datePosted: firstDefined(a.datePosted, b.datePosted),
    firstSeen: firstSeen === Number.MAX_SAFE_INTEGER ? undefined : firstSeen,
    season: firstDefined(a.season, b.season),
    // "confirmed" (inferred=false) wins across sources
    seasonInferred: (a.seasonInferred ?? true) && (b.seasonInferred ?? true),
    salary: firstDefined(a.salary, b.salary),
    remote: !!(a.remote || b.remote),
    skills: firstDefined(a.skills, b.skills),
    source: a.source === b.source ? a.source : `${a.source} + ${b.source}`,
  };
}

/** Fetch every enabled source in parallel, normalize, and de-duplicate. */
export async function fetchAllListings(): Promise<Listing[]> {
  const tasks: Promise<Listing[]>[] = [];
  if (isAutoOn()) tasks.push(fetchAuto()); // richer source first so its fields win merges
  if (isSimplifyOn()) tasks.push(fetchSimplify());

  const results = await Promise.allSettled(tasks);
  const all: Listing[] = [];
  for (const r of results) if (r.status === "fulfilled") all.push(...r.value);

  if (all.length === 0) {
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw failed ? failed.reason : new Error("No listing sources are enabled.");
  }

  const map = new Map<string, Listing>();
  for (const l of all) {
    const k = dedupeKey(l);
    const prev = map.get(k);
    map.set(k, prev ? merge(prev, l) : l);
  }
  return [...map.values()];
}

export interface SourceProbe {
  count: number | null;
  error: string | null;
}

/** Fetch each source's current URL and report how many listings it returns (for Settings). */
export async function probeSources(): Promise<{ simplify: SourceProbe; auto: SourceProbe }> {
  const [s, a] = await Promise.allSettled([fetchSimplify(), fetchAuto()]);
  const of = (r: PromiseSettledResult<Listing[]>): SourceProbe =>
    r.status === "fulfilled"
      ? { count: r.value.length, error: null }
      : { count: null, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
  return { simplify: of(s), auto: of(a) };
}
