import { getOpportunityQueue } from "../ranking/queue";
import { getPrefs, inQuietHours } from "../ranking/prefs";
import { notify } from "../lib/notify";

const K_NOTIFIED = "internpilot.ranking.notifiedIds";
const K_BASELINE = "internpilot.ranking.notifyBaseline";
const K_INSTANT_COUNT = "internpilot.ranking.instantCount"; // { date, count }

function readIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(K_NOTIFIED) ?? "[]")); }
  catch { return new Set(); }
}
function writeIds(set: Set<string>): void {
  // Keep the tail so the store can't grow without bound.
  const arr = [...set].slice(-800);
  localStorage.setItem(K_NOTIFIED, JSON.stringify(arr));
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function instantBudget(max: number): number {
  try {
    const { date, count } = JSON.parse(localStorage.getItem(K_INSTANT_COUNT) ?? "{}");
    if (date !== todayKey()) return max;
    return Math.max(0, max - (count ?? 0));
  } catch { return max; }
}
function spendInstant(n: number): void {
  let count = 0;
  try {
    const cur = JSON.parse(localStorage.getItem(K_INSTANT_COUNT) ?? "{}");
    if (cur.date === todayKey()) count = cur.count ?? 0;
  } catch { /* ignore */ }
  localStorage.setItem(K_INSTANT_COUNT, JSON.stringify({ date: todayKey(), count: count + n }));
}

/**
 * Tiered notifications: instant (Priority-0 companies scoring high) fire
 * individually and urgently, standard tiers are summarized, and everything
 * else stays silent for the digest. Respects quiet hours and the daily instant
 * cap. A job is notified because it's new *and valuable*, never just new.
 */
export async function checkNewListingsAndNotify(): Promise<void> {
  try {
    const { items } = await getOpportunityQueue();
    const seen = readIds();

    // First ever run: establish a baseline silently (no backlog spam).
    if (!localStorage.getItem(K_BASELINE)) {
      items.forEach((o) => seen.add(o.id));
      writeIds(seen);
      localStorage.setItem(K_BASELINE, "1");
      return;
    }

    const fresh = items.filter((o) => (o.tier === "instant" || o.tier === "standard") && !seen.has(o.id));
    if (fresh.length === 0) return;

    const prefs = getPrefs();
    // Defer entirely during quiet hours — re-evaluated on the next launch.
    if (inQuietHours(prefs, new Date().getHours())) return;

    const instants = fresh.filter((o) => o.tier === "instant");
    const standards = fresh.filter((o) => o.tier === "standard");

    // Instant alerts, one per role, capped per day.
    let budget = instantBudget(prefs.maxInstantPerDay);
    let spent = 0;
    for (const o of instants) {
      if (budget <= 0) break;
      await notify(
        `⚡ ${o.company} — ${o.title}`,
        `Priority-0 match · score ${o.priority}. ${o.freshnessLabel}. Apply within 24 hours.`,
      );
      seen.add(o.id);
      budget--; spent++;
    }
    if (spent) spendInstant(spent);

    // Standard tier: a single summary notification.
    if (standards.length > 0) {
      const top = standards[0];
      const extra = standards.length > 1 ? ` and ${standards.length - 1} more` : "";
      await notify(
        `${standards.length} new high-priority match${standards.length > 1 ? "es" : ""}`,
        `${top.company} — ${top.title} · score ${top.priority}${extra}.`,
      );
      standards.forEach((o) => seen.add(o.id));
    }

    writeIds(seen);
  } catch (e) {
    console.error("listing notification check failed", e);
  }
}
