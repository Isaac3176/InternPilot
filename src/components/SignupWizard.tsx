import { useState } from "react";
import { signup } from "../auth";
import { PROFILE_SECTIONS, useProfileForm } from "./useProfileForm";

export default function SignupWizard({ onDone }: { onDone: () => void }) {
  const h = useProfileForm();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const totalSteps = PROFILE_SECTIONS.length + 1; // account step + profile sections
  const isAccount = step === 0;
  const isLast = step === totalSteps - 1;
  const section = isAccount ? null : PROFILE_SECTIONS[step - 1];

  function next() {
    setError("");
    if (isAccount) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      if (password !== confirm) return setError("Passwords do not match.");
      if (!h.s.email) h.set("email", email.trim().toLowerCase());
    }
    setStep((s) => s + 1);
  }

  function back() {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }

  async function finish() {
    setBusy(true);
    setError("");
    try {
      await signup(email.trim().toLowerCase(), password);
      await h.save();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand-lg"><span className="logo">IP</span> InternPilot AI</div>
        <div className="wizard-progress">Step {step + 1} of {totalSteps}</div>
        <div className="wizard-bar">
          <div className="wizard-bar-fill" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
        </div>

        {isAccount ? (
          <>
            <h2>Create your account</h2>
            <p className="hint mb-md">
              Your login is stored locally on this device. Passwords are hashed and never sent anywhere.
            </p>
            <div className="field">
              <label htmlFor="su-email">Email</label>
              <input id="su-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
            </div>
            <div className="field">
              <label htmlFor="su-pw">Password</label>
              <input id="su-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div className="field">
              <label htmlFor="su-pw2">Confirm password</label>
              <input id="su-pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <h2>{section!.title}</h2>
            {section!.render(h)}
          </>
        )}

        {error && <p className="hint text-red">{error}</p>}

        <div className="wizard-actions">
          {step > 0 ? <button type="button" className="secondary" onClick={back}>Back</button> : <span />}
          {isLast ? (
            <button type="button" onClick={finish} disabled={busy}>{busy ? "Creating…" : "Finish"}</button>
          ) : (
            <button type="button" onClick={next}>Next</button>
          )}
        </div>
        {!isAccount && <p className="hint wizard-skip">Optional — you can edit all of this later in Profile.</p>}
      </div>
    </div>
  );
}
