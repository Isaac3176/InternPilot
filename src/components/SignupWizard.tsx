import { useState, type ChangeEvent } from "react";
import { signup } from "../auth";
import { AscentIcon } from "./Logo";
import { PROFILE_SECTIONS, useProfileForm } from "./useProfileForm";
import { ACCEPTED_RESUME_TYPES, extractTextFromFile } from "../lib/extractText";
import { parseResume } from "../ai/resumeParse";
import { createResumeVersion } from "../db/resumes";
import { getPrefs, savePrefs } from "../ranking/prefs";
import { ROLE_SUGGESTIONS } from "../data/roles";

const EMPLOYMENT_TYPES = [
  { value: "internship", label: "Internship" },
  { value: "fulltime", label: "Full-time" },
  { value: "parttime", label: "Part-time" },
  { value: "coop", label: "Co-op" },
];

export default function SignupWizard({ onDone, skipAccount = false }: { onDone: () => void; skipAccount?: boolean }) {
  const h = useProfileForm();
  const [step, setStep] = useState(skipAccount ? 1 : 0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeMsg, setResumeMsg] = useState("");
  const [resumeErr, setResumeErr] = useState("");
  const [empTypes, setEmpTypes] = useState<string[]>(getPrefs().employmentTypes?.length ? getPrefs().employmentTypes : ["internship"]);
  const toggleEmp = (v: string) => setEmpTypes((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);

  // Steps: 0 = account, 1 = resume, 2 = goal, 3.. = profile sections
  const totalSteps = PROFILE_SECTIONS.length + 3;
  const isAccount = step === 0;
  const isResume = step === 1;
  const isGoal = step === 2;
  const isLast = step === totalSteps - 1;
  const section = step >= 3 ? PROFILE_SECTIONS[step - 3] : null;

  async function handleResume(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setResumeBusy(true);
    setResumeMsg("");
    setResumeErr("");
    try {
      const text = await extractTextFromFile(file);
      const parsed = await parseResume(text);
      let filled = 0;
      for (const [k, v] of Object.entries(parsed)) {
        if (v) {
          h.set(k, v);
          filled++;
        }
      }
      const id = await createResumeVersion({ name: file.name.replace(/\.[^.]+$/, "") || "My Resume", content: text });
      if (id) h.set("preferred_resume_id", String(id));
      setResumeMsg(`Parsed ${file.name} — autofilled ${filled} field${filled === 1 ? "" : "s"}. Review them in the next steps.`);
    } catch (err) {
      setResumeErr(err instanceof Error ? err.message : String(err));
    } finally {
      setResumeBusy(false);
    }
  }

  function next() {
    setError("");
    if (isAccount) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      if (password !== confirm) return setError("Passwords do not match.");
      if (!h.s.email) h.set("email", email.trim().toLowerCase());
    }
    setStep((x) => x + 1);
  }

  function back() {
    setError("");
    setStep((x) => Math.max(skipAccount ? 1 : 0, x - 1));
  }

  async function finish() {
    setBusy(true);
    setError("");
    try {
      if (!skipAccount) await signup(email.trim().toLowerCase(), password); // local desktop account (legacy)
      savePrefs({ employmentTypes: empTypes.length ? empTypes : ["internship"] });
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
        <div className="brand-lg"><AscentIcon size={30} /> InternPilot AI</div>
        <div className="wizard-progress">Step {step + 1} of {totalSteps}</div>
        <div className="wizard-bar">
          <div className="wizard-bar-fill" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
        </div>

        {isAccount && (
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
        )}

        {isResume && (
          <>
            <h2>Upload your resume</h2>
            <p className="hint mb-md">
              We'll parse it and autofill everything we can — you review and complete the rest in the next steps.
              PDF, DOCX, or TXT.
            </p>
            <label className="resume-drop">
              {resumeBusy ? "Parsing…" : "Choose resume file"}
              <input type="file" accept={ACCEPTED_RESUME_TYPES} onChange={handleResume} disabled={resumeBusy} hidden />
            </label>
            {resumeMsg && <p className="hint">✓ {resumeMsg}</p>}
            {resumeErr && <p className="hint text-red">{resumeErr}</p>}
            <p className="hint">Prefer to fill manually? Just click Next.</p>
          </>
        )}

        {isGoal && (
          <>
            <h2>Your goal</h2>
            <p className="hint mb-md">We'll use this to surface and prioritize the right postings for you.</p>
            <div className="field">
              <label>What type of roles?</label>
              <div className="emp-types">
                {EMPLOYMENT_TYPES.map((e) => (
                  <button type="button" key={e.value} className={`emp-type${empTypes.includes(e.value) ? " on" : ""}`} onClick={() => toggleEmp(e.value)}>
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
            {h.tags("target_roles", "What roles are you looking for?", ROLE_SUGGESTIONS, "Search roles — e.g. Backend, Machine Learning…")}
            <div className="field">
              <label htmlFor="su-target-date">When do you want a job by?</label>
              <input id="su-target-date" type="date" value={h.s.target_date} onChange={(e) => h.set("target_date", e.target.value)} />
            </div>
          </>
        )}

        {section && (
          <>
            <h2>{section.title}</h2>
            {section.render(h)}
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
        {section && <p className="hint wizard-skip">Optional — you can edit all of this later in Profile.</p>}
      </div>
    </div>
  );
}
