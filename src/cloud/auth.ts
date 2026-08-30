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
export async function cloudResetPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
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
