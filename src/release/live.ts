/**
 * Live opening detection. Polls watchlist companies' real ATS boards (ats.ts) and
 * reports internship / new-grad roles that are posted RIGHT NOW — the ground truth
 * the forecast (history.ts) can only estimate. A detected posting is authoritative:
 * the company is open, today, with a direct apply link.
 */
import { fetchCompanyPostings, type AtsPosting } from "./ats";
import { getWatchlist, type CompanyPriority } from "../ranking/companies";
import { notify } from "../lib/notify";

export interface LiveOpening {
  company: string;
  priority: CompanyPriority;
  title: string;
  url: string;
  location: string;
  postedAt: number | null; // unix seconds
  isNew: boolean; // first time we've seen this posting
}

/** Keep only early-career software/ML roles; drop senior, sales, and non-eng noise. */
export function isInternRole(title: string): boolean {
  const t = title.toLowerCase();
  const early = /\b(interns?|internships?|co-?op|new ?grad|university|early career|apprentice|campus)\b/.test(t);
  if (!early) return false;
  if (/\b(senior|staff|principal|lead|manager|director|mba|phd only)\b/.test(t)) return false;
  const eng = /\b(software|swe|engineer|developer|data|machine learning|\bml\b|\bai\b|backend|back-end|frontend|front-end|full.?stack|infrastructure|platform|security|systems|quant|research)\b/.test(t);
  return eng;
}

/** The user's filter for live openings — from their target season + degree level. */
export interface OpeningFilter { targetSeason: string; undergrad: boolean }

/**
 * Season/year match: if the title names year(s) and none is the target year, it's
 * a different cycle → drop it. Titles with no year are kept (ambiguous, don't
 * over-filter). A clearly-conflicting season word (target Summer, title Fall) also drops.
 */
export function matchesSeason(title: string, targetSeason: string): boolean {
  const t = title.toLowerCase();
  const targetYear = targetSeason.match(/20\d\d/)?.[0];
  const years = t.match(/20\d\d/g);
  if (targetYear && years && years.length > 0 && !years.includes(targetYear)) return false;

  const seasonWords = ["summer", "fall", "autumn", "winter", "spring"];
  const targetWord = targetSeason.toLowerCase().match(/summer|fall|autumn|winter|spring/)?.[0];
  if (targetWord) {
    const mentionsTarget = new RegExp(`\\b${targetWord}\\b`).test(t);
    const mentionsOther = seasonWords.some((s) => s !== targetWord && s !== "autumn" && new RegExp(`\\b${s}\\b`).test(t));
    if (mentionsOther && !mentionsTarget) return false;
  }
  return true;
}

/** True if a title requires a graduate degree (PhD / Master's) an undergrad can't hold. */
export function requiresGradDegree(title: string): boolean {
  const t = ` ${title.toLowerCase()} `;
  return /\bph\.?\s?d\b|\bphd\b|doctoral|post-?doc|graduate student|master'?s|\bmasters\b|\bm\.?eng\b|\bmba\b/.test(t);
}

/** Treat the user as an undergrad unless their profile degree clearly says grad. */
export function isUndergradDegree(degree: string | null | undefined): boolean {
  const d = (degree ?? "").toLowerCase();
  if (!d) return true;
  return !/ph\.?d|doctora|master|\bms\b|\bm\.?eng\b|\bmba\b|graduate/.test(d);
}

/** Full user-tailored filter: an intern SWE role, in the user's season, at their level. */
export function isRelevantOpening(title: string, f: OpeningFilter): boolean {
  if (!isInternRole(title)) return false;
  if (!matchesSeason(title, f.targetSeason)) return false;
  if (f.undergrad && requiresGradDegree(title)) return false;
  return true;
}

const SEEN_KEY = "internpilot.live.seen.v1";
const CACHE_KEY = "internpilot.live.cache.v1";
const CACHE_TTL = 30 * 60 * 1000; // serve cached openings for 30 min between polls

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")); } catch { return new Set(); }
}
function writeSeen(s: Set<string>): void {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-2000))); } catch { /* ignore */ }
}

/** Cached openings from the last poll (instant paint; no network). */
export function getCachedLiveOpenings(): { openings: LiveOpening[]; polledAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

/**
 * Poll every instant/high watchlist company's board and return current early-career
 * openings, newest first. `isNew` marks postings not seen on a prior poll. Companies
 * are probed with limited concurrency to stay polite to the APIs.
 */
export async function detectLiveOpenings(opts: { markSeen?: boolean } = {}): Promise<LiveOpening[]> {
  const targets = getWatchlist().filter((c) => c.priority === "instant" || c.priority === "high");
  const seen = readSeen();
  const fresh = new Set<string>();
  const openings: LiveOpening[] = [];

  // Tailor to the user's target: season/year (prefs) + degree level (profile).
  // Dynamic import keeps the DB layer out of this module's import graph (tests).
  const { getPrefs } = await import("../ranking/prefs");
  let degree: string | null = null;
  try { degree = (await (await import("../db/profile")).getProfile())?.degree ?? null; } catch { /* ignore */ }
  const filter: OpeningFilter = { targetSeason: getPrefs().targetSeason, undergrad: isUndergradDegree(degree) };

  const queue = [...targets];
  const CONCURRENCY = 4;
  async function worker(): Promise<void> {
    for (;;) {
      const c = queue.shift();
      if (!c) return;
      let postings: AtsPosting[] | null = null;
      try { postings = await fetchCompanyPostings(c.name); } catch { postings = null; }
      if (!postings) continue;
      for (const p of postings) {
        if (!isRelevantOpening(p.title, filter) || !p.url) continue;
        fresh.add(p.id);
        openings.push({
          company: c.name, priority: c.priority,
          title: p.title, url: p.url, location: p.location, postedAt: p.postedAt,
          isNew: !seen.has(p.id),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  openings.sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0));

  if (opts.markSeen !== false) {
    fresh.forEach((id) => seen.add(id));
    writeSeen(seen);
  }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ openings, polledAt: Date.now() })); } catch { /* ignore */ }
  return openings;
}

/** Poll only if the cache is stale; otherwise return cached openings. */
export async function getLiveOpenings(): Promise<LiveOpening[]> {
  const cached = getCachedLiveOpenings();
  if (cached && Date.now() - cached.polledAt < CACHE_TTL) return cached.openings;
  return detectLiveOpenings();
}

/**
 * Poll and fire a desktop notification for postings that appeared since last poll.
 * Silent on the very first run (empty seen-set) so we seed instead of flooding.
 * Desktop-only caller.
 */
export async function checkLiveAndNotify(): Promise<void> {
  const firstRun = readSeen().size === 0;
  const openings = await detectLiveOpenings(); // marks seen
  if (firstRun) return;
  const fresh = openings.filter((o) => o.isNew);
  if (fresh.length === 0) return;
  const top = fresh[0];
  const extra = fresh.length > 1 ? ` +${fresh.length - 1} more just posted.` : "";
  await notify(`${top.company} just posted — ${top.title}`, `Live on their careers page.${extra} Apply before the rush.`);
}
