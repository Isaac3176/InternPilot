import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/** Ensure desktop-notification permission, requesting it once if needed. */
export async function ensureNotificationPermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    granted = result === "granted";
  }
  return granted;
}

/** Send a desktop notification if permission is (or can be) granted. */
export async function notify(title: string, body: string): Promise<void> {
  try {
    if (await ensureNotificationPermission()) {
      sendNotification({ title, body });
    }
  } catch (e) {
    console.error("notification failed", e);
  }
}

const SEEN_KEY = "internpilot.notifiedReminders";

/** Fire desktop notifications only for reminders not seen before (by key). */
export async function notifyNewReminders(
  items: { key: string; title: string; detail: string }[],
): Promise<void> {
  let seen: Set<string>;
  try {
    seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"));
  } catch {
    seen = new Set();
  }
  const fresh = items.filter((r) => !seen.has(r.key));
  for (const r of fresh) await notify(r.title, r.detail);
  if (fresh.length) {
    fresh.forEach((r) => seen.add(r.key));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  }
}
