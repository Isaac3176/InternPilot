import { getDb } from "../db";

/**
 * Local, on-device authentication for the desktop app. Passwords are hashed with
 * PBKDF2 (SHA-256, 100k iterations) + a random salt via the Web Crypto API and
 * stored locally — never in plaintext and never sent anywhere. This is a local
 * gate over local data, not a cloud account.
 */

interface AccountRow {
  id: number;
  email: string;
  password_hash: string;
  salt: string;
}

const SESSION_KEY = "internpilot.session.accountId";
const PBKDF2_ITERATIONS = 100_000;

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return arr;
}

function randomSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return bytesToBase64(a);
}

async function deriveHash(password: string, saltB64: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64ToBytes(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

export async function hasAccount(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM accounts");
  return (rows[0]?.n ?? 0) > 0;
}

export async function getAccountEmail(): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ email: string }[]>("SELECT email FROM accounts ORDER BY id LIMIT 1");
  return rows[0]?.email ?? null;
}

export async function signup(email: string, password: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Email is required.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (await hasAccount()) throw new Error("An account already exists on this device.");

  const salt = randomSalt();
  const hash = await deriveHash(password, salt);
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO accounts (email, password_hash, salt) VALUES (?, ?, ?)",
    [normalized, hash, salt],
  );
  if (res.lastInsertId) localStorage.setItem(SESSION_KEY, String(res.lastInsertId));
}

export async function login(email: string, password: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<AccountRow[]>(
    "SELECT * FROM accounts WHERE email = ? COLLATE NOCASE LIMIT 1",
    [email.trim().toLowerCase()],
  );
  const account = rows[0];
  if (!account) throw new Error("No account found for that email.");
  const hash = await deriveHash(password, account.salt);
  if (hash !== account.password_hash) throw new Error("Incorrect password.");
  localStorage.setItem(SESSION_KEY, String(account.id));
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem(SESSION_KEY);
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}
