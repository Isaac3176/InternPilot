/**
 * Tiny per-session cache for the mobile shell. Each tab remounts when you
 * switch to it, so without this every switch would refetch the feed, apps,
 * metrics, etc. Each entry memoizes its promise AND its last resolved value,
 * so a revisited tab paints instantly from `peek()` and never re-hits the
 * network. `clear()` invalidates after a mutation (e.g. saving a role).
 */
import { getFeed } from "../../listings/service";
import { getOpportunityQueue } from "../../ranking/queue";
import { listApplications } from "../../db/applications";
import { listResumeVersions } from "../../db/resumes";
import { getProfile } from "../../db/profile";
import { getStatusCounts, getFunnelRates, getResumeVersionPerformance } from "../../db/metrics";

interface Entry<T> { peek: () => T | null; load: () => Promise<T>; clear: () => void }

function make<T>(loader: () => Promise<T>): Entry<T> {
  let value: T | null = null;
  let promise: Promise<T> | null = null;
  return {
    peek: () => value,
    load: () => (promise ??= loader().then(
      (v) => { value = v; return v; },
      (e) => { promise = null; throw e; },
    )),
    clear: () => { value = null; promise = null; },
  };
}

export const feedC = make(() => getFeed().then((f) => f.listings));
export const queueC = make(() => getOpportunityQueue().then((q) => q.today));
export const appsC = make(() => listApplications());
export const countsC = make(() => getStatusCounts());
export const perfC = make(() => getResumeVersionPerformance());
export const resumesC = make(() => listResumeVersions());
export const ratesC = make(() => getFunnelRates());
export const profileC = make(() => getProfile());

/** After saving/creating an application, the pipeline-derived data is stale. */
export function invalidateAfterSave(): void {
  appsC.clear(); countsC.clear(); ratesC.clear(); queueC.clear();
}

/** Drop every cache so the next tab load refetches (e.g. app regained focus). */
export function invalidateAll(): void {
  [feedC, queueC, appsC, countsC, perfC, resumesC, ratesC, profileC].forEach((c) => c.clear());
}
