import { useState } from "react";
import { cloudUpdatePassword } from "../cloud/auth";
import { AscentIcon } from "./Logo";

/** Shown after the user opens a password-reset link (they're in a recovery session). */
export default function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    if (password !== confirm) { setMsg("Passwords don't match."); return; }
    if (password.length < 8) { setMsg("Use at least 8 characters."); return; }
    setBusy(true); setMsg("");
    try {
      await cloudUpdatePassword(password);
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand-lg"><AscentIcon size={30} /> InternPilot AI</div>
        <h2>Set a new password</h2>
        <p className="hint mb-md">Choose a new password for your account, then you'll be signed in.</p>
        <div className="field">
          <label htmlFor="np-pass">New password</label>
          <input id="np-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="np-confirm">Confirm password</label>
          <input id="np-confirm" type="password" autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && password && confirm) save(); }} />
        </div>
        <button type="button" style={{ width: "100%" }} disabled={busy || !password || !confirm} onClick={save}>
          {busy ? "…" : "Save new password"}
        </button>
        {msg && <p className="hint" style={{ marginTop: 12 }}>{msg}</p>}
      </div>
    </div>
  );
}
