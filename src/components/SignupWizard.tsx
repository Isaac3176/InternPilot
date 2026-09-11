import { useState, type ChangeEvent } from "react";
import { signup } from "../auth";
import { AscentIcon } from "./Logo";
import { useProfileForm } from "./useProfileForm";
import { ACCEPTED_RESUME_TYPES, extractTextFromFile } from "../lib/extractText";
import { parseResume } from "../ai/resumeParse";
import { createResumeVersion } from "../db/resumes";
import { mirrorLocalSetting } from "../cloud/userSettings";
import { getPrefs, savePrefs } from "../ranking/prefs";
import OptionChips from "./OptionChips";
import { ROLE_SUGGESTIONS } from "../data/roles";
import { REMOTE_PREF_LABELS, REMOTE_PREFS, YES_NO } from "../db/types";

const EMPLOYMENT_TYPES = [
  { value: "internship", label: "Internship" },
  { value: "new_grad", label: "New grad" },
  { value: "parttime", label: "Part-time" },
  { value: "coop", label: "Co-op" },
];

const COLLEGE_YEAR_OPTIONS = [
  { value: "first_year", label: "First-year" },
  { value: "sophomore", label: "Sophomore" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "masters", label: "Master's" },
  { value: "new_grad", label: "New grad" },
  { value: "not_in_college", label: "Not in college" },
];

const TIMELINE_OPTIONS = [
  { value: "asap", label: "ASAP" },
  { value: "three_months", label: "Within 3 months" },
  { value: "six_months", label: "Within 6 months" },
  { value: "passive", label: "Passively browsing" },
];

const LOCATION_SUGGESTIONS = [
  "Remote in USA",
  "New York City",
  "San Francisco Bay Area",
  "Los Angeles",
  "Seattle",
  "Boston",
  "Chicago",
  "Austin",
  "Atlanta",
  "Washington, DC",
  "Toronto",
  "Vancouver",
  "London",
];

const ONBOARDING_KEY = "internpilot.onboarding.answers";

function dateMonthsFromNow(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function graduationYearFor(collegeYear: string): string {
  const y = new Date().getFullYear();
  const map: Record<string, number> = {
    first_year: y + 4,
    sophomore: y + 3,
    junior: y + 2,
    senior: y + 1,
    masters: y + 1,
    new_grad: y,
  };
  return map[collegeYear] ? String(map[collegeYear]) : "";
}

function targetDateFor(timeline: string): string {
  if (timeline === "asap") return dateMonthsFromNow(1);
  if (timeline === "three_months") return dateMonthsFromNow(3);
  if (timeline === "six_months") return dateMonthsFromNow(6);
  return "";
}

export default function SignupWizard({
  onDone,
  onSignOut,
  skipAccount = false,
}: {
  onDone: () => void;
  onSignOut?: () => void;
  skipAccount?: boolean;
}) {
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
  const [collegeYear, setCollegeYear] = useState("");
  const [timeline, setTimeline] = useState("");

  // Steps: 0 = account, 1..6 = guided setup.
  const totalSteps = 7;
  const isAccount = step === 0;
  const isRoles = step === 1;
  const isExperience = step === 2;
  const isTiming = step === 3;
  const isLocation = step === 4;
  const isResume = step === 5;
  const isScreening = step === 6;
  const isLast = step === totalSteps - 1;
  const visibleTotalSteps = skipAccount ? totalSteps - 1 : totalSteps;
  const visibleStep = skipAccount ? step : step + 1;

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
      setResumeMsg(`Parsed ${file.name} and autofilled ${filled} field${filled === 1 ? "" : "s"}.`);
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
    if (isRoles && (!h.s.target_roles.trim() || empTypes.length === 0)) return setError("Pick at least one role and one job type.");
    if (isExperience && !collegeYear) return setError("Choose the option that fits you best.");
    if (isTiming && !timeline) return setError("Choose how soon you want to land a job.");
    if (isLocation && !h.s.locations.trim()) return setError("Pick at least one location or add your own.");
    setStep((x) => x + 1);
  }

  function back() {
    setError("");
    setStep((x) => Math.max(skipAccount ? 1 : 0, x - 1));
  }

  function chooseCollegeYear(value: string) {
    setCollegeYear(value);
    const gradYear = graduationYearFor(value);
    if (gradYear) h.set("grad_year", gradYear);
    if (["first_year", "sophomore", "junior", "senior"].includes(value) && !h.s.degree) h.set("degree", "Bachelor's");
  }

  function chooseTimeline(value: string) {
    setTimeline(value);
    const targetDate = targetDateFor(value);
    if (targetDate) h.set("target_date", targetDate);
  }

  async function finish() {
    setBusy(true);
    setError("");
    try {
      if (!skipAccount) await signup(email.trim().toLowerCase(), password);

      const gradYear = graduationYearFor(collegeYear);
      const roles = h.s.target_roles.split(",").map((x) => x.trim()).filter(Boolean);
      savePrefs({
        employmentTypes: empTypes.length ? empTypes : ["internship"],
        graduationYear: gradYear ? Number(gradYear) : getPrefs().graduationYear,
        targetRoles: roles.length ? roles.map((r) => empTypes.includes("internship") && !/intern/i.test(r) ? `${r} Intern` : r) : getPrefs().targetRoles,
      });
      localStorage.setItem(ONBOARDING_KEY, JSON.stringify({
        collegeYear,
        timeline,
        employmentTypes: empTypes,
        targetRoles: roles,
        locations: h.s.locations.split(",").map((x) => x.trim()).filter(Boolean),
      }));
      mirrorLocalSetting(ONBOARDING_KEY);

      await h.save();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen onboarding-screen">
      <header className="onboarding-top">
        <div className="brand-lg"><AscentIcon size={30} /> InternPilot AI</div>
        {onSignOut && <button type="button" className="linklike onboarding-signout" onClick={onSignOut}>Sign out</button>}
      </header>

      <main className="onboarding-panel">
        <div className="wizard-nav">
          {step > (skipAccount ? 1 : 0) ? <button type="button" className="wizard-back" aria-label="Back" onClick={back}>{"<"}</button> : <span />}
          <div className="wizard-bar">
            <div className="wizard-bar-fill" style={{ width: `${(visibleStep / visibleTotalSteps) * 100}%` }} />
          </div>
        </div>

        {isAccount && (
          <section className="onboarding-step narrow">
            <h2>Create your account</h2>
            <p className="hint mb-md">Your login is stored locally on this device. Passwords are hashed and never sent anywhere.</p>
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
          </section>
        )}

        {isRoles && (
          <section className="onboarding-step">
            <h2>What kind of jobs are you looking for?</h2>
            <div className="field">
              <label>Job type</label>
              <OptionChips multi options={EMPLOYMENT_TYPES} value={empTypes} onChange={(v) => setEmpTypes(v as string[])} />
            </div>
            {h.tags("target_roles", "Roles", ROLE_SUGGESTIONS, "Search roles, like Backend or Machine Learning")}
          </section>
        )}

        {isExperience && (
          <section className="onboarding-step narrow">
            <h2>What year are you in college?</h2>
            <p className="onboarding-sub">Pick the closest match.</p>
            <OptionChips options={COLLEGE_YEAR_OPTIONS} value={collegeYear} onChange={(v) => chooseCollegeYear(v as string)} />
          </section>
        )}

        {isTiming && (
          <section className="onboarding-step narrow">
            <h2>How soon are you looking to land your job?</h2>
            <OptionChips options={TIMELINE_OPTIONS} value={timeline} onChange={(v) => chooseTimeline(v as string)} />
          </section>
        )}

        {isLocation && (
          <section className="onboarding-step">
            <h2>What locations do you want to work in?</h2>
            {h.tags("locations", "Locations", LOCATION_SUGGESTIONS, "Search regions, cities, or remote")}
            <div className="field">
              <label>Work style</label>
              <OptionChips options={REMOTE_PREFS.map((r) => ({ value: r, label: REMOTE_PREF_LABELS[r] }))} value={h.s.remote_pref} onChange={(v) => h.set("remote_pref", v as string)} />
            </div>
          </section>
        )}

        {isResume && (
          <section className="onboarding-step">
            <h2>Upload your resume to get matched with jobs</h2>
            <div className="onboarding-note">
              <b>We'll analyze your resume</b>
              <span> and match your background to roles that fit.</span>
            </div>
            <label className="resume-drop onboarding-drop">
              <span className="resume-drop-icon">+</span>
              <b>{resumeBusy ? "Parsing..." : "Upload a file"}</b>
              <small>PDF, DOCX, or TXT up to 5 MB</small>
              <input type="file" accept={ACCEPTED_RESUME_TYPES} onChange={handleResume} disabled={resumeBusy} hidden />
            </label>
            {resumeMsg && <p className="hint onboarding-success">{resumeMsg}</p>}
            {resumeErr && <p className="hint text-red">{resumeErr}</p>}
            <div className="privacy-strip"><b>Privacy first.</b> Your resume is only used to power your profile and matching.</div>
          </section>
        )}

        {isScreening && (
          <section className="onboarding-step">
            <h2>Before you start applying</h2>
            <p className="onboarding-sub">These answers help screen out roles that will waste your time.</p>
            <div className="field">
              <label htmlFor="pf-target_date">Target job-by date</label>
              <input id="pf-target_date" type="date" value={h.s.target_date || targetDateFor(timeline)} onChange={(e) => h.set("target_date", e.target.value)} />
            </div>
            {h.cards("authorized_us", "Are you authorized to work in the U.S.?", YES_NO.map((o) => ({ value: o, label: o })))}
            {h.cards("requires_sponsorship", "Will you need visa sponsorship (now or in the future)?", YES_NO.map((o) => ({ value: o, label: o })))}
          </section>
        )}

        {error && <p className="hint text-red onboarding-error">{error}</p>}
        {h.error && <p className="hint text-red onboarding-error">{h.error}</p>}

        <div className="wizard-actions">
          {step > (skipAccount ? 1 : 0) ? <button type="button" className="secondary mobile-back" onClick={back}>Back</button> : <span />}
          {isLast ? (
            <button type="button" onClick={finish} disabled={busy || h.saving}>{busy || h.saving ? "Saving..." : "Finish"}</button>
          ) : (
            <button type="button" onClick={next}>Next</button>
          )}
        </div>
      </main>
    </div>
  );
}
