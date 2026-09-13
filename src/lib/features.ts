import { isTauri } from "./env";

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "").trim();
export const AUTH_CAPTCHA_ENABLED = TURNSTILE_SITE_KEY.length > 0;

export const GMAIL_SYNC_ENABLED =
  isTauri() ||
  import.meta.env.DEV ||
  import.meta.env.MODE === "e2e" ||
  import.meta.env.VITE_ENABLE_GMAIL_SYNC === "1";
