import { useEffect, useState, type ReactNode } from "react";
import { getProfile, saveProfile, type ProfileInput } from "../db/profile";
import { listResumeVersions } from "../db/resumes";
import TagMultiSelect from "./TagMultiSelect";
import { ROLE_SUGGESTIONS } from "../data/roles";
import { SKILL_SUGGESTIONS } from "../data/skills";
import {
  DEGREE_OPTIONS,
  DISABILITY_OPTIONS,
  GENDER_OPTIONS,
  HISPANIC_OPTIONS,
  RACE_OPTIONS,
  REMOTE_PREFS,
  REMOTE_PREF_LABELS,
  VETERAN_OPTIONS,
  WORK_AUTH_LABELS,
  WORK_AUTH_OPTIONS,
  YES_NO,
  type RemotePref,
  type ResumeVersion,
  type WorkAuth,
} from "../db/types";

type State = Record<string, string>;

const emptyState: State = {
  first_name: "", last_name: "", email: "", phone: "",
  current_city: "", current_state: "", current_country: "",
  linkedin_url: "", github_url: "", portfolio_url: "",
  school: "", degree: "", major: "", minor: "", gpa: "", graduation_date: "", grad_year: "",
  target_roles: "", locations: "", skills: "", remote_pref: "any",
  desired_salary: "", willing_to_relocate: "", earliest_start_date: "", target_date: "",
  work_auth: "", authorized_us: "", requires_sponsorship: "", security_clearance: "",
  gender: "", race_ethnicity: "", hispanic_latino: "", veteran_status: "", disability_status: "",
  preferred_resume_id: "",
};

const LOCATION_SUGGESTIONS = [
  "Remote", "New York, NY", "San Francisco, CA", "Seattle, WA", "Austin, TX",
  "Boston, MA", "Chicago, IL", "Los Angeles, CA", "Atlanta, GA",
];

export interface ProfileFormApi {
  s: State;
  set: (k: string, v: string) => void;
  resumes: ResumeVersion[];
  saving: boolean;
  savedMsg: boolean;
  save: () => Promise<void>;
  text: (k: string, label: string, ph?: string) => ReactNode;
  choice: (k: string, label: string, opts: string[]) => ReactNode;
  tags: (k: string, label: string, suggestions: string[], ph: string) => ReactNode;
}

export function useProfileForm(onSaved?: () => void): ProfileFormApi {
  const [s, setS] = useState<State>(emptyState);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    listResumeVersions().then(setResumes).catch(console.error);
    getProfile()
      .then((p) => {
        if (!p) return;
        const next = { ...emptyState };
        for (const k of Object.keys(emptyState)) {
          const v = (p as unknown as Record<string, unknown>)[k];
          next[k] = v == null ? "" : String(v);
        }
        if (!next.remote_pref) next.remote_pref = "any";
        setS(next);
      })
      .catch(console.error);
  }, []);

  function set(k: string, v: string) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const str = (v: string) => (v.trim() ? v.trim() : null);
      const payload: ProfileInput = {
        first_name: str(s.first_name), last_name: str(s.last_name), email: str(s.email), phone: str(s.phone),
        current_city: str(s.current_city), current_state: str(s.current_state), current_country: str(s.current_country),
        linkedin_url: str(s.linkedin_url), github_url: str(s.github_url), portfolio_url: str(s.portfolio_url),
        school: str(s.school), degree: str(s.degree), major: str(s.major), minor: str(s.minor),
        gpa: str(s.gpa), graduation_date: str(s.graduation_date), grad_year: str(s.grad_year),
        target_roles: str(s.target_roles), locations: str(s.locations), skills: str(s.skills),
        remote_pref: (s.remote_pref || "any") as RemotePref,
        preferred_resume_id: s.preferred_resume_id ? Number(s.preferred_resume_id) : null,
        desired_salary: str(s.desired_salary), willing_to_relocate: str(s.willing_to_relocate),
        earliest_start_date: str(s.earliest_start_date), target_date: str(s.target_date),
        work_auth: (s.work_auth || null) as WorkAuth | null,
        authorized_us: str(s.authorized_us), requires_sponsorship: str(s.requires_sponsorship),
        security_clearance: str(s.security_clearance),
        gender: str(s.gender), race_ethnicity: str(s.race_ethnicity), hispanic_latino: str(s.hispanic_latino),
        veteran_status: str(s.veteran_status), disability_status: str(s.disability_status),
      };
      await saveProfile(payload);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 1600);
      onSaved?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const text = (k: string, label: string, ph?: string) => (
    <div className="field">
      <label htmlFor={`pf-${k}`}>{label}</label>
      <input id={`pf-${k}`} value={s[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} />
    </div>
  );
  const choice = (k: string, label: string, opts: string[]) => (
    <div className="field">
      <label htmlFor={`pf-${k}`}>{label}</label>
      <select id={`pf-${k}`} value={s[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">—</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
  const tags = (k: string, label: string, suggestions: string[], ph: string) => (
    <div className="field">
      <label htmlFor={`pf-${k}`}>{label}</label>
      <TagMultiSelect
        id={`pf-${k}`}
        values={s[k] ? s[k].split(",").map((x) => x.trim()).filter(Boolean) : []}
        onChange={(vals) => set(k, vals.join(", "))}
        suggestions={suggestions}
        placeholder={ph}
      />
    </div>
  );

  return { s, set, resumes, saving, savedMsg, save, text, choice, tags };
}

/** Profile questionnaire sections, reused by the Profile page and the signup wizard. */
export const PROFILE_SECTIONS: { title: string; render: (h: ProfileFormApi) => ReactNode }[] = [
  {
    title: "Personal",
    render: (h) => (
      <>
        <div className="field-row">{h.text("first_name", "First name")}{h.text("last_name", "Last name")}</div>
        <div className="field-row">{h.text("phone", "Phone", "(555) 555-5555")}{h.text("current_city", "City")}</div>
        <div className="field-row">{h.text("current_state", "State/Province")}{h.text("current_country", "Country", "United States")}</div>
      </>
    ),
  },
  {
    title: "Links",
    render: (h) => (
      <>
        {h.text("linkedin_url", "LinkedIn", "linkedin.com/in/…")}
        {h.text("github_url", "GitHub", "github.com/…")}
        {h.text("portfolio_url", "Portfolio / Website", "https://…")}
      </>
    ),
  },
  {
    title: "Education",
    render: (h) => (
      <>
        {h.text("school", "School")}
        <div className="field-row">{h.choice("degree", "Degree", DEGREE_OPTIONS)}{h.text("gpa", "GPA", "3.8")}</div>
        <div className="field-row">{h.text("major", "Major")}{h.text("minor", "Minor")}</div>
        <div className="field-row">{h.text("graduation_date", "Graduation date", "May 2027")}{h.text("grad_year", "Graduation year", "2027")}</div>
      </>
    ),
  },
  {
    title: "Job preferences",
    render: (h) => (
      <>
        {h.tags("target_roles", "Target roles", ROLE_SUGGESTIONS, "Search roles — e.g. Backend, Machine Learning…")}
        {h.tags("skills", "Key skills", SKILL_SUGGESTIONS, "Search skills — e.g. Python, React…")}
        {h.tags("locations", "Preferred locations", LOCATION_SUGGESTIONS, "Add locations…")}
        <div className="field-row">
          <div className="field">
            <label htmlFor="pf-remote_pref">Work style</label>
            <select id="pf-remote_pref" value={h.s.remote_pref} onChange={(e) => h.set("remote_pref", e.target.value)}>
              {REMOTE_PREFS.map((r) => <option key={r} value={r}>{REMOTE_PREF_LABELS[r]}</option>)}
            </select>
          </div>
          {h.choice("willing_to_relocate", "Willing to relocate?", YES_NO)}
        </div>
        <div className="field-row">{h.text("desired_salary", "Desired salary", "$40/hr")}{h.text("earliest_start_date", "Earliest start date", "June 2026")}</div>
        <div className="field">
          <label htmlFor="pf-target_date">Target job-by date</label>
          <input id="pf-target_date" type="date" value={h.s.target_date} onChange={(e) => h.set("target_date", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pf-resume">Preferred resume</label>
          <select id="pf-resume" value={h.s.preferred_resume_id} onChange={(e) => h.set("preferred_resume_id", e.target.value)}>
            <option value="">— none —</option>
            {h.resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </>
    ),
  },
  {
    title: "Work authorization",
    render: (h) => (
      <>
        <div className="field">
          <label htmlFor="pf-work_auth">Work authorization</label>
          <select id="pf-work_auth" value={h.s.work_auth} onChange={(e) => h.set("work_auth", e.target.value)}>
            <option value="">—</option>
            {WORK_AUTH_OPTIONS.map((w) => <option key={w} value={w}>{WORK_AUTH_LABELS[w]}</option>)}
          </select>
        </div>
        <div className="field-row">
          {h.choice("authorized_us", "Authorized to work in the U.S.?", YES_NO)}
          {h.choice("requires_sponsorship", "Require sponsorship now or in future?", YES_NO)}
        </div>
        {h.choice("security_clearance", "Have an active security clearance?", YES_NO)}
      </>
    ),
  },
  {
    title: "Demographics (optional, for EEO questions)",
    render: (h) => (
      <>
        <div className="field-row">{h.choice("gender", "Gender", GENDER_OPTIONS)}{h.choice("hispanic_latino", "Hispanic or Latino?", HISPANIC_OPTIONS)}</div>
        {h.choice("race_ethnicity", "Race / Ethnicity", RACE_OPTIONS)}
        <div className="field-row">{h.choice("veteran_status", "Veteran status", VETERAN_OPTIONS)}{h.choice("disability_status", "Disability status", DISABILITY_OPTIONS)}</div>
      </>
    ),
  },
];
