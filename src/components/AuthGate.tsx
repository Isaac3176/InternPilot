import { useEffect, useState, type ReactNode } from "react";
import { hasAccount, isLoggedIn } from "../auth";
import Login from "./Login";
import SignupWizard from "./SignupWizard";

type Mode = "loading" | "signup" | "login" | "authed";

/** Gates the app behind local signup/login. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");

  useEffect(() => {
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
  if (mode === "signup") return <SignupWizard onDone={() => setMode("authed")} />;
  if (mode === "login") return <Login onDone={() => setMode("authed")} />;
  return <>{children}</>;
}
