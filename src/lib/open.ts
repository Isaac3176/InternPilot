import { isTauri } from "./env";

/** Open an external URL via Tauri's opener on desktop, or a new browser tab on web. */
export async function openExternal(url: string): Promise<void> {
  if (!url) return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.warn("Blocked invalid external URL", url);
    return;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    console.warn("Blocked unsupported external URL scheme", parsed.protocol);
    return;
  }

  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(parsed.toString());
  } else {
    window.open(parsed.toString(), "_blank", "noopener");
  }
}
