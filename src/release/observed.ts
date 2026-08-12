/**
 * Self-learning layer for Release Radar. The app sees the live feed on every
 * load; here we persist each company's ACTUAL earliest posting date per cycle so
 * that a real open becomes a data point in future forecasts. Over cycles this
 * turns the static release-history bundle into a dataset that improves with use.
 */
const KEY = "internpilot.release.observed";

export interface Observation { year: number; e: number } // cycle season year, earliest post (unix seconds)
type Store = Record<string, Observation[]>; // companyKey → observations

function read(): Store {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store; } catch { return {}; }
}
function write(s: Store): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function getObserved(companyKey: string): Observation[] {
  return read()[companyKey] ?? [];
}

/** Record (or tighten) the earliest observed post for a company in a cycle. */
export function recordOpen(companyKey: string, year: number, earliestUnix: number): void {
  if (!companyKey || !earliestUnix || !Number.isFinite(earliestUnix)) return;
  const store = read();
  const arr = store[companyKey] ?? [];
  const existing = arr.find((o) => o.year === year);
  if (existing) {
    if (earliestUnix >= existing.e) return; // already have an earlier/equal date
    existing.e = earliestUnix;
  } else {
    arr.push({ year, e: earliestUnix });
  }
  store[companyKey] = arr;
  write(store);
}
