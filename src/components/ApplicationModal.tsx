import { useEffect, useState } from "react";
import {
  createApplication,
  updateApplication,
  type ApplicationInput,
} from "../db/applications";
import { listResumeVersions } from "../db/resumes";
import { STATUSES, STATUS_LABELS, type ApplicationRow, type ResumeVersion, type Status } from "../db/types";

interface Props {
  initial?: ApplicationRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const empty: ApplicationInput = {
  company_name: "",
  role_title: "",
  job_link: "",
  location: "",
  status: "interested",
  date_applied: "",
  resume_version_id: null,
  job_description: "",
  notes: "",
  referral: "",
};

export default function ApplicationModal({ initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ApplicationInput>(empty);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listResumeVersions().then(setResumes).catch(console.error);
  }, []);

  useEffect(() => {
    if (initial) {
      setForm({
        company_name: initial.company_name ?? "",
        role_title: initial.role_title,
        job_link: initial.job_link ?? "",
        location: initial.location ?? "",
        status: initial.status,
        date_applied: initial.date_applied ?? "",
        resume_version_id: initial.resume_version_id,
        job_description: initial.job_description ?? "",
        notes: initial.notes ?? "",
      });
    }
  }, [initial]);

  function set<K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.role_title.trim()) return;
    setSaving(true);
    try {
      if (initial) await updateApplication(initial.id, form);
      else await createApplication(form);
      onSaved();
    } catch (e) {
      console.error(e);
      alert("Failed to save application. See console for details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? "Edit application" : "New application"}</h2>

        <div className="field-row">
          <div className="field">
            <label>Company</label>
            <input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Capital One" />
          </div>
          <div className="field">
            <label>Role title *</label>
            <input value={form.role_title} onChange={(e) => set("role_title", e.target.value)} placeholder="Software Engineering Intern" />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="am-status">Status</label>
            <select id="am-status" value={form.status} onChange={(e) => set("status", e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Location</label>
            <input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="Remote / NYC" />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="am-date">Date applied</label>
            <input id="am-date" type="date" value={form.date_applied ?? ""} onChange={(e) => set("date_applied", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="am-resume">Resume version</label>
            <select
              id="am-resume"
              value={form.resume_version_id ?? ""}
              onChange={(e) => set("resume_version_id", e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— none —</option>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Job link</label>
          <input value={form.job_link ?? ""} onChange={(e) => set("job_link", e.target.value)} placeholder="https://..." />
        </div>

        <div className="field">
          <label>Job description</label>
          <textarea value={form.job_description ?? ""} onChange={(e) => set("job_description", e.target.value)} placeholder="Paste the job description here (used for AI resume matching)." />
        </div>

        <div className="field">
          <label htmlFor="am-referral">Referral</label>
          <input id="am-referral" value={form.referral ?? ""} onChange={(e) => set("referral", e.target.value)} placeholder="Referrer name / source (leave blank if none)" />
        </div>

        <div className="field">
          <label htmlFor="am-notes">Notes</label>
          <textarea id="am-notes" className="notes-sm" value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Recruiter name, deadlines, special requirements..." />
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving || !form.role_title.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
