/**
 * Proactive Release Radar alerts. Instead of waiting for you to open the Radar
 * page, surface watchlist companies that are entering their likely opening window
 * (or that cohort drift has made imminent) — on Home and via a desktop
 * notification — so you line up your résumé and contacts before the role posts.
 */
import { getReleaseRadar, type RadarEntry } from "./radar";
import { notify } from "../lib/notify";
import { getPrefs } from "../ranking/prefs";

/** Top-tier watchlist companies where it's time to START reaching out (before they open). */
export async function getOpeningSoon(): Promise<RadarEntry[]> {
  const entries = await getReleaseRadar();
  return entries
    .filter((e) =>
      (e.priority === "instant" || e.priority === "high") &&
      e.state !== "open" && // already-open targets have their own alert
      ((e.daysUntilOutreach != null && e.daysUntilOutreach <= 7 && e.daysUntilWindow != null && e.daysUntilWindow >= -10) || e.probabilityNext7 >= 0.4))
    .sort((a, b) => (a.daysUntilOutreach ?? 999) - (b.daysUntilOutreach ?? 999));
}

/** Fire a notification for newly-imminent companies (deduped per season). Desktop-only caller. */
export async function checkRadarAndNotify(): Promise<void> {
  const soon = await getOpeningSoon();
  if (soon.length === 0) return;

  const key = `internpilot.radar.notified.${getPrefs().targetSeason.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  let notified: string[];
  try { notified = JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { notified = []; }
  const seen = new Set(notified);

  const fresh = soon.filter((e) => !seen.has(e.company));
  if (fresh.length === 0) return;

  const top = fresh[0];
  const opensIn = top.daysUntilWindow != null && top.daysUntilWindow > 0 ? `likely opens in ~${top.daysUntilWindow} days` : "opening imminent";
  const extra = fresh.length > 1 ? ` +${fresh.length - 1} more.` : "";
  await notify(`Time to reach out — ${top.company}`, `${top.company} — start reaching out now (${opensIn}).${extra} Line up contacts before the rush.`);

  fresh.forEach((e) => seen.add(e.company));
  try { localStorage.setItem(key, JSON.stringify([...seen])); } catch { /* ignore */ }
}
