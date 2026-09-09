import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "./env";

/**
 * HTTP client for external APIs (feeds, ATS boards, OpenAI, Google).
 *
 * On the **desktop** it routes through the Tauri HTTP plugin (requests made from
 * Rust, bypassing the webview's CORS restrictions). In a **browser** (web/PWA) that
 * plugin isn't available — calling it throws "Cannot read properties of undefined
 * (reading 'invoke')" — so we fall back to the native `fetch`. Public feeds
 * (raw.githubusercontent.com) and ATS boards send permissive CORS headers, so they
 * work directly; CORS-restricted APIs (e.g. OpenAI) need a proxy on web — see the
 * Edge-Function item in docs/PRODUCTION.md.
 */
export const httpFetch: typeof fetch = (input, init) =>
  isTauri() ? tauriFetch(input, init) : fetch(input, init);
