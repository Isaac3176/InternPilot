import { useEffect, useState } from "react";
import { getProfile, saveProfile } from "../db/profile";
import { listResumeVersions } from "../db/resumes";
import TagMultiSelect from "./TagMultiSelect";
import { ROLE_SUGGESTIONS } from "../data/roles";
import {
  REMOTE_PREFS,
  REMOTE_PREF_LABELS,
  WORK_AUTH_LABELS,
  WORK_AUTH_OPTIONS,
  type RemotePref,
  type ResumeVersion,
  type WorkAuth,
} from "../db/types";

interface Props {
  submitLabel?: string;
  onSaved?: () => void;
}

const empty = {
  target_roles: "",
  locations: "",
  work_auth: "" as WorkAuth | "",
  grad_year: "",
  skills: "",
  remote_pref: "any" as RemotePref,
  preferred_resume_id: "" as number | "",
};

export default function ProfileForm({ submitLabel = "Save profile", onSaved }: Props) {
  const [form, setForm] = useState(empty);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    listResumeVersions().then(setResumes).catch(console.error);
    getProfile()
      .then((p) => {
        if (p) {
          setForm({
            target_roles: p.target_roles ?? "",
            locations: p.locations ?? "",
            work_auth: (p.work_auth as WorkAuth) ?? "",
            grad_year: p.grad_year ?? "",
            skills: p.skills ?? "",
            remote_pref: (p.remote_pref as RemotePref) ?? "any",
            preferred_resume_id: p.preferred_resume_id ?? "",
          });
        }
      })
      .catch(console.error);
  }, []);

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setSaving(true);
    try {
      await saveProfile({
        target_roles: form.target_roles,
        locations: form.locations,
        work_auth: form.work_auth || null,
        grad_year: form.grad_year,
        skills: form.skills,
        remote_pref: form.remote_pref,
        preferred_resume_id: form.preferred_resume_id === "" ? null : form.preferred_resume_id,
      });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 1600);
      onSaved?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="field">
        <label htmlFor="pf-roles">Target roles</label>
        <TagMultiSelect
          id="pf-roles"
          values={form.target_roles ? form.target_roles.split(",").map((s) => s.trim()).filter(Boolean) : []}
          onChange={(vals) => set("target_roles", vals.join(", "))}
          suggestions={ROLE_SUGGESTIONS}
          placeholder="Search roles — e.g. Backend, Machine Learning…"
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="pf-locs">Preferred locations</label>
          <input id="pf-locs" value={form.locations} onChange={(e) => set("locations", e.target.value)} placeholder="NYC, Remote, Bay Area" />
        </div>
        <div className="field">
          <label htmlFor="pf-remote">Work style</label>
          <select id="pf-remote" value={form.remote_pref} onChange={(e) => set("remote_pref", e.target.value as RemotePref)}>
            {REMOTE_PREFS.map((r) => (
              <option key={r} value={r}>{REMOTE_PREF_LABELS[r]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="pf-auth">Work authorization</label>
          <select id="pf-auth" value={form.work_auth} onChange={(e) => set("work_auth", e.target.value as WorkAuth | "")}>
            <option value="">—</option>
            {WORK_AUTH_OPTIONS.map((w) => (
              <option key={w} value={w}>{WORK_AUTH_LABELS[w]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pf-grad">Graduation year</label>
          <input id="pf-grad" value={form.grad_year} onChange={(e) => set("grad_year", e.target.value)} placeholder="2027" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pf-skills">Key skills</label>
        <input id="pf-skills" value={form.skills} onChange={(e) => set("skills", e.target.value)} placeholder="Python, React, SQL, AWS (comma-separated)" />
      </div>
      <div className="field">
        <label htmlFor="pf-resume">Preferred resume</label>
        <select id="pf-resume" value={form.preferred_resume_id} onChange={(e) => set("preferred_resume_id", e.target.value ? Number(e.target.value) : "")}>
          <option value="">— none —</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>
      <button type="button" onClick={submit} disabled={saving}>
        {saving ? "Saving…" : savedMsg ? "Saved ✓" : submitLabel}
      </button>
    </>
  );
}
