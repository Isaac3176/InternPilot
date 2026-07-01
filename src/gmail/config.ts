/**
 * Gmail OAuth configuration and token storage. For the MVP these live in
 * localStorage (single-user local desktop app). A later phase can move the
 * refresh token into the OS keychain for stronger protection.
 */
const K_CLIENT_ID = "internpilot.gmail.clientId";
const K_CLIENT_SECRET = "internpilot.gmail.clientSecret";
const K_TOKENS = "internpilot.gmail.tokens";

/** Pre-provisioned OAuth client ID (desktop app; not secret under PKCE). */
export const DEFAULT_CLIENT_ID =
  "694622706232-5rooa51gtupsaoi9ft19aseki8dcmb16.apps.googleusercontent.com";

export interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  email?: string;
}

export function getClientId(): string {
  return localStorage.getItem(K_CLIENT_ID) || DEFAULT_CLIENT_ID;
}

export function setClientId(value: string): void {
  if (value) localStorage.setItem(K_CLIENT_ID, value);
  else localStorage.removeItem(K_CLIENT_ID);
}

export function getClientSecret(): string {
  return localStorage.getItem(K_CLIENT_SECRET) ?? "";
}

export function setClientSecret(value: string): void {
  if (value) localStorage.setItem(K_CLIENT_SECRET, value);
  else localStorage.removeItem(K_CLIENT_SECRET);
}

export function getTokens(): GmailTokens | null {
  try {
    const raw = localStorage.getItem(K_TOKENS);
    return raw ? (JSON.parse(raw) as GmailTokens) : null;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: GmailTokens): void {
  localStorage.setItem(K_TOKENS, JSON.stringify(tokens));
}

export function clearTokens(): void {
  localStorage.removeItem(K_TOKENS);
}

export function isConnected(): boolean {
  return !!getTokens()?.refreshToken;
}
