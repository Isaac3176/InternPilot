import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type SignUpResult = "created" | "confirm_email" | "already_exists";

/**
 * Create an account. Supabase hides duplicate emails to prevent enumeration — a
 * signup for an existing account returns a user with no identities (or, with
 * confirmation off, an "already registered" error). We surface that as
 * "already_exists" so the UI can steer the user to sign in / reset instead of
 * silently pretending to create a second account.
 */
export async function cloudSignUp(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return "already_exists";
    throw error;
  }
  if (data.user && (data.user.identities?.length ?? 0) === 0) return "already_exists";
  if (!data.session) return "confirm_email"; // email confirmation required
  return "created";
}
export async function cloudSignIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}
// Where the password-reset email should send the user back to. On web that's the
// current origin (incl. localhost in dev); on desktop (tauri://…, which a browser
// can't open) fall back to the hosted web app. This URL must also be allow-listed
// in Supabase → Auth → URL Configuration → Redirect URLs.
const WEB_APP_URL = "https://intern-pilot-seven.vercel.app";
function resetRedirectTo(): string {
  if (typeof window !== "undefined" && window.location.origin.startsWith("http")) return window.location.origin;
  return WEB_APP_URL;
}

export async function cloudResetPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: resetRedirectTo() });
  if (error) throw error;
}

/** Set a new password once the user is in a recovery session (from the email link). */
export async function cloudUpdatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Fires when the user arrives via a password-reset link (Supabase PASSWORD_RECOVERY). */
export function onPasswordRecovery(cb: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") cb(); });
  return () => data.subscription.unsubscribe();
}
export async function cloudSignOut(): Promise<void> {
  await supabase.auth.signOut();
}
export async function cloudSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onCloudAuth(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

/**
 * Verify the project URL + key + schema + RLS are all wired: a signed-in user
 * can read their (own, RLS-scoped) applications without error.
 */
export async function cloudTestConnection(): Promise<void> {
  const { error } = await supabase.from("applications").select("id").limit(1);
  if (error) throw error;
}
