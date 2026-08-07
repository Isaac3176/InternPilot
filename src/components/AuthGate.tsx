import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { cloudSession, onCloudAuth } from "../cloud/auth";
import { isOnboarded } from "../db/profile";
import SignupWizard from "./SignupWizard";
import CloudLogin from "./CloudLogin";

type Mode = "loading" | "login" | "onboarding" | "authed";

/**
 * One account everywhere. The app gates on a Supabase session on desktop, web,
 * and phone — so signing in gives you the same cloud data on every device. New
 * accounts go through profile onboarding (no separate local password).
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");

  const evalSession = useCallback(async (session: Session | null) => {
    if (!session) { setMode("login"); return; }
    try {
      setMode((await isOnboarded()) ? "authed" : "onboarding");
    } catch {
      setMode("authed"); // don't lock the user out if the profile check fails
    }
  }, []);

  useEffect(() => {
    cloudSession().then(evalSession).catch(() => setMode("login"));
    return onCloudAuth(evalSession);
  }, [evalSession]);

  if (mode === "loading") return null;
  if (mode === "login") return <CloudLogin onDone={() => cloudSession().then(evalSession)} />;
  if (mode === "onboarding") return <SignupWizard skipAccount onDone={() => setMode("authed")} />;
  return <>{children}</>;
}
