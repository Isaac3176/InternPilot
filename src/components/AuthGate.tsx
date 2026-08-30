import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { cloudSession, onCloudAuth, onPasswordRecovery } from "../cloud/auth";
import { isOnboarded } from "../db/profile";
import SignupWizard from "./SignupWizard";
import CloudLogin from "./CloudLogin";
import NewPassword from "./NewPassword";

type Mode = "loading" | "login" | "onboarding" | "authed";

/**
 * One account everywhere. The app gates on a Supabase session on desktop, web,
 * and phone — so signing in gives you the same cloud data on every device. New
 * accounts go through profile onboarding (no separate local password).
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [recovering, setRecovering] = useState(false);

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
    const offAuth = onCloudAuth(evalSession);
    // A password-reset link creates a temporary recovery session; intercept it and
    // show the "set new password" screen instead of dropping them into the app.
    const offRecovery = onPasswordRecovery(() => setRecovering(true));
    if (typeof window !== "undefined" && /type=recovery/.test(window.location.hash)) setRecovering(true);
    return () => { offAuth(); offRecovery(); };
  }, [evalSession]);

  // Recovery wins over everything else until a new password is set.
  if (recovering) {
    return <NewPassword onDone={() => {
      setRecovering(false);
      if (typeof window !== "undefined") history.replaceState(null, "", window.location.pathname);
      cloudSession().then(evalSession);
    }} />;
  }
  if (mode === "loading") return null;
  if (mode === "login") return <CloudLogin onDone={() => cloudSession().then(evalSession)} />;
  if (mode === "onboarding") return <SignupWizard skipAccount onDone={() => setMode("authed")} />;
  return <>{children}</>;
}
