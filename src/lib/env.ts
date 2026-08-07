/** True when running inside the Tauri desktop runtime (vs a plain browser tab). */
export function isTauri(): boolean {
  return typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}
