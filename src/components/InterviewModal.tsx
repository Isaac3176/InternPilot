import { useEffect, useState } from "react";
import { createInterview } from "../db/interviews";
import { listApplications } from "../db/applications";
import { INTERVIEW_TYPES, INTERVIEW_TYPE_LABELS, type ApplicationRow, type InterviewType } from "../db/types";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function InterviewModal({ onClose, onSaved }: Props) {
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [applicationId, setApplicationId] = useState<number | "">("");
  const [type, setType] = useState<InterviewType>("oa");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listApplications().then(setApps).catch(console.error);
  }, []);

  async function save() {
    setSaving(true);
    try {
      await createInterview({
        application_id: applicationId === "" ? null : applicationId,
        type,
        date: date || null,
        notes: notes || null,
      });
      onSaved();
    } catch (e) {
      console.error(e);
      alert("Failed to save event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New interview / OA event</h2>

        <div className="field">
          <label htmlFor="iv-app">Application</label>
          <select id="iv-app" value={applicationId} onChange={(e) => setApplicationId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— link an application (optional) —</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {(a.company_name ?? "Unknown") + " — " + a.role_title}
              </option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="iv-type">Type</label>
            <select id="iv-type" value={type} onChange={(e) => setType(e.target.value as InterviewType)}>
              {INTERVIEW_TYPES.map((t) => (
                <option key={t} value={t}>{INTERVIEW_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="iv-date">Date</label>
            <input id="iv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="iv-notes">Notes</label>
          <textarea id="iv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Recruiter, round details, links..." />
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="button" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
