import { useState } from "react";
import { cloudSignIn, cloudSignUp } from "../cloud/auth";
import { AscentIcon } from "./Logo";

/** Sign-in gate for the web/phone build (no local account — Supabase only). */
export default function CloudLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run(kind: "in" | "up") {
    setBusy(true); setMsg("");
    try {
      if (kind === "up") {
        await cloudSignUp(email, password);
        setMsg("Account created — signing you in…");
        await cloudSignIn(email, password).catch(() => setMsg("Account created. If it asks to confirm your email, do that, then sign in."));
      } else {
        await cloudSignIn(email, password);
      }
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand-lg"><AscentIcon size={30} /> InternPilot AI</div>
        <h2>Sign in</h2>
        <p className="hint mb-md">Use your InternPilot cloud account to sync across your phone and desktop.</p>
        <div className="field">
          <label htmlFor="cl-email">Email</label>
          <input id="cl-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cl-pass">Password</label>
          <input id="cl-pass" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email && password && run("in")} />
        </div>
        <button type="button" style={{ width: "100%" }} disabled={busy || !email || !password} onClick={() => run("in")}>
          {busy ? "…" : "Log in"}
        </button>
        <button type="button" className="secondary" style={{ width: "100%", marginTop: 9 }} disabled={busy || !email || !password} onClick={() => run("up")}>
          Create account
        </button>
        {msg && <p className="hint" style={{ marginTop: 12 }}>{msg}</p>}
      </div>
    </div>
  );
}
