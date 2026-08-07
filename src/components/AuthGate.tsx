import { useEffect, useState, type ReactNode } from "react";
import { hasAccount, isLoggedIn } from "../auth";
import { isTauri } from "../lib/env";
import { cloudSession, onCloudAuth } from "../cloud/auth";
import Login from "./Login";
import SignupWizard from "./SignupWizard";
import CloudLogin from "./CloudLogin";

type Mode = "loading" | "signup" | "login" | "cloudlogin" | "authed";

/**
 * Gates the app. In the Tauri desktop app it uses the local account (SQLite);
 * in a browser / the deployed phone build there's no local DB, so it gates on
 * a Supabase (cloud) session instead.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");

  useEffect(() => {
    // Browser / web build → Supabase auth only.
    if (!isTauri()) {
      cloudSession().then((s) => setMode(s ? "authed" : "cloudlogin")).catch(() => setMode("cloudlogin"));
      return onCloudAuth((s) => setMode(s ? "authed" : "cloudlogin"));
    }
    // Desktop → local account.
    (async () => {
      try {
        if (!(await hasAccount())) setMode("signup");
        else setMode(isLoggedIn() ? "authed" : "login");
      } catch (e) {
        console.error(e);
        setMode(isLoggedIn() ? "authed" : "login");
      }
    })();
  }, []);

  if (mode === "loading") return null;
  if (mode === "cloudlogin") return <CloudLogin onDone={() => setMode("authed")} />;
  if (mode === "signup") return <SignupWizard onDone={() => setMode("authed")} />;
  if (mode === "login") return <Login onDone={() => setMode("authed")} />;
  return <>{children}</>;
}
