/**
 * AI provider settings. For the MVP these live in localStorage (single-user,
 * local desktop app). A later phase can move the key into the OS keychain via a
 * Tauri plugin for stronger protection.
 */
const KEY_API = "internpilot.openai.apiKey";
const KEY_MODEL = "internpilot.openai.model";

export const DEFAULT_MODEL = "gpt-4o-mini";

export function getApiKey(): string {
  return localStorage.getItem(KEY_API) ?? "";
}

export function setApiKey(value: string): void {
  if (value) localStorage.setItem(KEY_API, value);
  else localStorage.removeItem(KEY_API);
}

export function getModel(): string {
  return localStorage.getItem(KEY_MODEL) || DEFAULT_MODEL;
}

export function setModel(value: string): void {
  localStorage.setItem(KEY_MODEL, value || DEFAULT_MODEL);
}

export function hasApiKey(): boolean {
  return getApiKey().trim().length > 0;
}
