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
