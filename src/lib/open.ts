import { isTauri } from "./env";

/** Open an external URL — Tauri's opener on desktop, a new tab in the browser. */
export async function openExternal(url: string): Promise<void> {
  if (!url) return;
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
