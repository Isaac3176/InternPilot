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
  const early = /\b(intern|internship|co-?op|new ?grad|university|early career|apprentice|campus)\b/.test(t);
  if (!early) return false;
  if (/\b(senior|staff|principal|lead|manager|director|mba|phd only)\b/.test(t)) return false;
  const eng = /\b(software|swe|engineer|developer|data|machine learning|\bml\b|\bai\b|backend|back-end|frontend|front-end|full.?stack|infrastructure|platform|security|systems|quant|research)\b/.test(t);
  return eng;
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
        if (!isInternRole(p.title) || !p.url) continue;
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
