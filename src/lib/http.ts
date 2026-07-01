import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/**
 * HTTP client for external APIs (OpenAI, Google). Routed through the Tauri HTTP
 * plugin so requests are made from Rust, bypassing the webview's CORS
 * restrictions. Same signature as the standard fetch.
 */
export const httpFetch: typeof fetch = tauriFetch;
