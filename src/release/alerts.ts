/**
 * Proactive Release Radar alerts. Instead of waiting for you to open the Radar
 * page, surface watchlist companies that are entering their likely opening window
 * (or that cohort drift has made imminent) — on Home and via a desktop
 * notification — so you line up your résumé and contacts before the role posts.
 */
import { getReleaseRadar, type RadarEntry } from "./radar";
import { notify } from "../lib/notify";
import { getPrefs } from "../ranking/prefs";

/** Top-tier watchlist companies about to open: inside/near the window or high near-term probability. */
export async function getOpeningSoon(): Promise<RadarEntry[]> {
  const entries = await getReleaseRadar();
  return entries
    .filter((e) =>
      (e.priority === "instant" || e.priority === "high") &&
      e.state !== "open" && // already-open targets have their own alert
      ((e.daysUntilWindow != null && e.daysUntilWindow <= 7 && e.daysUntilWindow >= -10) || e.probabilityNext7 >= 0.4))
    .sort((a, b) => (a.daysUntilWindow ?? 999) - (b.daysUntilWindow ?? 999));
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
  const when = top.daysUntilWindow != null && top.daysUntilWindow > 0
    ? `window starts in ~${top.daysUntilWindow} days`
    : "in its opening window now";
  const extra = fresh.length > 1 ? ` +${fresh.length - 1} more opening soon.` : "";
  await notify(`${top.company} is opening soon`, `${top.company} — ${when}.${extra} Line up your résumé and contacts before the rush.`);

  fresh.forEach((e) => seen.add(e.company));
  try { localStorage.setItem(key, JSON.stringify([...seen])); } catch { /* ignore */ }
}
