/**
 * Company watchlist: the user maintains a list of target companies, each with a
 * priority tier that drives ranking and notification behavior. Stored locally
 * (localStorage) so it needs no migration; the typed API below is the only
 * surface callers use, so it can move to SQLite later without changing them.
 */

export type CompanyPriority = "instant" | "high" | "normal" | "muted";

export interface TargetCompany {
  id: string;
  name: string;
  priority: CompanyPriority;
  preferredRoles: string[];
  blockedRoles: string[];
  preferredLocations: string[];
  /** Company-specific alert rule: titles that should always match / never match. */
  includeKeywords: string[];
  excludeKeywords: string[];
  notes?: string;
}

export const PRIORITY_LABEL: Record<CompanyPriority, string> = {
  instant: "Instant alert",
  high: "High priority",
  normal: "Normal",
  muted: "Muted",
};

/** Company-priority contribution to the 100-point score (max 30). */
export const PRIORITY_WEIGHT: Record<CompanyPriority, number> = {
  instant: 30,
  high: 22,
  normal: 12,
  muted: 0,
};

const KEY = "internpilot.ranking.watchlist";
const SEED_FLAG = "internpilot.ranking.seeded";

// Default Priority 0 / Priority 1 lists from the spec.
const INSTANT = [
  "Cloudflare", "Datadog", "CrowdStrike", "Microsoft", "Amazon", "Nvidia",
  "Databricks", "Snowflake", "MongoDB", "Confluent", "Bloomberg", "Capital One",
  "Google", "Meta", "Apple",
];
const HIGH = [
  "Salesforce", "Adobe", "Intuit", "ServiceNow", "JPMorgan Chase", "Goldman Sachs",
  "Visa", "Mastercard", "Walmart Global Tech", "Cisco", "Qualcomm",
  "Palo Alto Networks", "Okta", "Elastic", "Fastly", "Akamai",
];

// Common listing-name variants that should map to a watchlist company.
const ALIASES: Record<string, string[]> = {
  amazon: ["aws", "amazon web services", "amazoncom", "a2z", "audible", "twitch"],
  google: ["alphabet", "youtube", "google llc"],
  meta: ["facebook", "instagram", "meta platforms"],
  microsoft: ["msft", "linkedin"],
  "capital one": ["capitalone"],
  "walmart global tech": ["walmart", "walmart labs", "walmartlabs"],
  "jpmorgan chase": ["jpmorgan", "jp morgan", "jpmc", "chase"],
  "goldman sachs": ["goldman"],
  "palo alto networks": ["palo alto", "paloalto"],
};

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function makeCompany(name: string, priority: CompanyPriority): TargetCompany {
  return {
    id: `seed-${norm(name)}`,
    name,
    priority,
    preferredRoles: [],
    blockedRoles: [],
    preferredLocations: [],
    includeKeywords: [],
    excludeKeywords: [],
  };
}

function defaultWatchlist(): TargetCompany[] {
  return [
    ...INSTANT.map((n) => makeCompany(n, "instant")),
    ...HIGH.map((n) => makeCompany(n, "high")),
  ];
}

/** Seed the watchlist once with the default Priority 0/1 companies. */
export function ensureSeeded(): void {
  if (localStorage.getItem(SEED_FLAG)) return;
  if (!localStorage.getItem(KEY)) saveWatchlist(defaultWatchlist());
  localStorage.setItem(SEED_FLAG, "1");
}

export function getWatchlist(): TargetCompany[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as TargetCompany[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveWatchlist(list: TargetCompany[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function upsertCompany(c: TargetCompany): void {
  const list = getWatchlist();
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = c;
  else list.push(c);
  saveWatchlist(list);
}

export function removeCompany(id: string): void {
  saveWatchlist(getWatchlist().filter((c) => c.id !== id));
}

export function setCompanyPriority(id: string, priority: CompanyPriority): void {
  const list = getWatchlist();
  const c = list.find((x) => x.id === id);
  if (c) { c.priority = priority; saveWatchlist(list); }
}

/** Add a company (from a listing) to the watchlist at a given tier, if absent. */
export function addCompanyByName(name: string, priority: CompanyPriority): TargetCompany {
  const existing = matchCompany(name);
  if (existing) { setCompanyPriority(existing.id, priority); return existing; }
  const c: TargetCompany = {
    id: `user-${norm(name)}-${Date.now().toString(36)}`,
    name, priority,
    preferredRoles: [], blockedRoles: [], preferredLocations: [],
    includeKeywords: [], excludeKeywords: [],
  };
  upsertCompany(c);
  return c;
}

/** Match a listing's company name to a watchlist entry (alias-aware, fuzzy). */
export function matchCompany(listingName: string): TargetCompany | null {
  const l = norm(listingName);
  if (!l) return null;
  for (const c of getWatchlist()) {
    const candidates = [c.name, ...(ALIASES[c.name.toLowerCase()] ?? [])].map(norm).filter(Boolean);
    for (const cand of candidates) {
      if (cand.length < 3) continue;
      if (l === cand || l.includes(cand) || cand.includes(l)) return c;
    }
  }
  return null;
}
