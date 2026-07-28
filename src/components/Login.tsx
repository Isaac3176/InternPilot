import { useState } from "react";
import { login } from "../auth";

export default function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand-lg"><span className="logo">IP</span> InternPilot AI</div>
        <h2>Welcome back</h2>
        <p className="hint mb-md">Log in to your local account.</p>
        <div className="field">
          <label htmlFor="lg-email">Email</label>
          <input id="lg-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <div className="field">
          <label htmlFor="lg-pw">Password</label>
          <input id="lg-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        {error && <p className="hint text-red">{error}</p>}
        <button type="button" onClick={submit} disabled={busy || !email || !password}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </div>
    </div>
  );
}
