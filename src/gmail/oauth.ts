import { start, cancel, onUrl } from "@fabianlars/tauri-plugin-oauth";
import { openUrl } from "@tauri-apps/plugin-opener";
import { httpFetch } from "../lib/http";
import {
  clearTokens,
  getClientId,
  getClientSecret,
  getTokens,
  saveTokens,
  type GmailTokens,
} from "./config";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// ---- PKCE helpers ----
function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

function randomVerifier(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

/**
 * Run the desktop OAuth loopback + PKCE flow: open the system browser to
 * Google's consent screen, capture the redirect on a localhost port, and
 * exchange the code for tokens.
 */
export async function connectGmail(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error("Set your Gmail Client ID in Settings first.");

  const verifier = randomVerifier();
  const challenge = base64url(await sha256(verifier));
  const port = await start();
  const redirectUri = `http://127.0.0.1:${port}`;

  let unlisten: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const codePromise = new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Timed out waiting for Google authorization.")), 300000);
      onUrl((url) => {
        try {
          const u = new URL(url);
          const err = u.searchParams.get("error");
          const code = u.searchParams.get("code");
          if (err) reject(new Error(`Google returned an error: ${err}`));
          else if (code) resolve(code);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      }).then((un) => {
        unlisten = un;
      });
    });

    const authUrl = new URL(AUTH_ENDPOINT);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPE);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    await openUrl(authUrl.toString());

    const code = await codePromise;
    const tokens = await exchangeCode(code, verifier, redirectUri);
    saveTokens(tokens);
  } finally {
    if (timer) clearTimeout(timer);
    unlisten?.();
    await cancel(port).catch(() => {});
  }
}

async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<GmailTokens> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const secret = getClientSecret();
  if (secret) body.set("client_secret", secret);

  const res = await httpFetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.refresh_token) {
    throw new Error("Google did not return a refresh token. Revoke access and reconnect (prompt=consent).");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

/** Return a valid access token, refreshing it if it has expired. */
export async function getValidAccessToken(): Promise<string> {
  const t = getTokens();
  if (!t?.refreshToken) throw new Error("Gmail is not connected.");
  if (t.accessToken && Date.now() < t.expiresAt - 60_000) return t.accessToken;

  const body = new URLSearchParams({
    client_id: getClientId(),
    grant_type: "refresh_token",
    refresh_token: t.refreshToken,
  });
  const secret = getClientSecret();
  if (secret) body.set("client_secret", secret);

  const res = await httpFetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const updated: GmailTokens = {
    ...t,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  saveTokens(updated);
  return updated.accessToken;
}

export function disconnectGmail(): void {
  clearTokens();
}
