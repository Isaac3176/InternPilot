const TOKEN_KEY = "internpilot.bridge.token";

export const BRIDGE_PORT = 8765;

/** Fired on window after the extension records a job, so open pages can refresh. */
export const APP_RECORDED_EVENT = "internpilot:application-recorded";

/** Stable per-device token the extension must send to read/write the bridge. */
export function getBridgeToken(): string {
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    t = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}
