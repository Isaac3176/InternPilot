import { isTauri } from "./env";

export const GMAIL_SYNC_ENABLED =
  isTauri() ||
  import.meta.env.DEV ||
  import.meta.env.MODE === "e2e" ||
  import.meta.env.VITE_ENABLE_GMAIL_SYNC === "1";
