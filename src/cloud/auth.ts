import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export async function cloudSignUp(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
}
export async function cloudSignIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
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
