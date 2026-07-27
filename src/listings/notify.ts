import { getFeed } from "./service";
import { notify } from "../lib/notify";

const K_LAST_NOTIFIED = "internpilot.listings.lastNotifiedPosted";

function getLastNotified(): number {
  return Number(localStorage.getItem(K_LAST_NOTIFIED)) || 0;
}

function setLastNotified(ts: number): void {
  localStorage.setItem(K_LAST_NOTIFIED, String(ts));
}

/**
 * Fire a desktop notification for newly-posted listings that match the profile
 * (score > 0), so the user can be among the first to apply. Tracks a separate
 * "last notified" marker from the feed's "last seen" so alerts and NEW badges
 * are independent. On first ever run it just sets a baseline (no spam).
 */
export async function checkNewListingsAndNotify(): Promise<void> {
  try {
    const { listings } = await getFeed();
    const maxPosted = listings.reduce((m, l) => Math.max(m, l.datePosted ?? 0), 0);
    const lastNotified = getLastNotified();

    if (lastNotified === 0) {
      setLastNotified(maxPosted); // establish baseline silently
      return;
    }

    const fresh = listings.filter((l) => l.score > 0 && (l.datePosted ?? 0) > lastNotified);
    if (fresh.length > 0) {
      const top = fresh[0];
      const extra = fresh.length > 1 ? ` and ${fresh.length - 1} more` : "";
      await notify(
        `${fresh.length} new internship${fresh.length > 1 ? "s" : ""} match your profile`,
        `${top.company} — ${top.title}${extra}. Be among the first to apply.`,
      );
      setLastNotified(maxPosted);
    }
  } catch (e) {
    console.error("listing notification check failed", e);
  }
}
