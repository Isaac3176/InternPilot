import { useEffect, useState } from "react";
import { createReferral, updateReferral, type ReferralInput } from "../db/referrals";
import { listContacts } from "../db/contacts";
import { listApplications } from "../db/applications";
import {
  REFERRAL_STATUSES,
  REFERRAL_STATUS_LABELS,
  type ApplicationRow,
  type ContactRow,
  type ReferralRow,
  type ReferralStatus,
} from "../db/types";

interface Props {
  initial?: ReferralRow | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  contact_id: number | "";
  application_id: number | "";
  status: ReferralStatus;
  first_contacted: string;
  last_interaction: string;
  next_follow_up: string;
  referral_link: string;
  confirmation_note: string;
  thank_you_sent: boolean;
  notes: string;
}

const empty: FormState = {
  contact_id: "",
  application_id: "",
  status: "potential_contact",
  first_contacted: "",
  last_interaction: "",
  next_follow_up: "",
  referral_link: "",
  confirmation_note: "",
  thank_you_sent: false,
  notes: "",
};

export default function ReferralModal({ initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(empty);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listContacts().then(setContacts).catch(console.error);
    listApplications().then(setApps).catch(console.error);
  }, []);

  useEffect(() => {
    if (initial) {
      setForm({
        contact_id: initial.contact_id ?? "",
        application_id: initial.application_id ?? "",
        status: initial.status,
        first_contacted: initial.first_contacted ?? "",
        last_interaction: initial.last_interaction ?? "",
        next_follow_up: initial.next_follow_up ?? "",
        referral_link: initial.referral_link ?? "",
        confirmation_note: initial.confirmation_note ?? "",
        thank_you_sent: initial.thank_you_sent !== 0,
        notes: initial.notes ?? "",
      });
    }
  }, [initial]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const app = apps.find((a) => a.id === form.application_id);
      const contact = contacts.find((c) => c.id === form.contact_id);
      const company_id = app?.company_id ?? contact?.company_id ?? null;
      const payload: ReferralInput = {
        contact_id: form.contact_id === "" ? null : form.contact_id,
        application_id: form.application_id === "" ? null : form.application_id,
        company_id,
        status: form.status,
        first_contacted: form.first_contacted || null,
        last_interaction: form.last_interaction || null,
        next_follow_up: form.next_follow_up || null,
        referral_link: form.referral_link || null,
        confirmation_note: form.confirmation_note || null,
        thank_you_sent: form.thank_you_sent,
        notes: form.notes || null,
      };
      if (initial) await updateReferral(initial.id, payload);
      else await createReferral(payload);
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? "Edit referral" : "New referral"}</h2>

        <div className="field-row">
          <div className="field">
            <label htmlFor="rf-contact">Contact</label>
            <select id="rf-contact" value={form.contact_id} onChange={(e) => set("contact_id", e.target.value ? Number(e.target.value) : "")}>
              <option value="">— none —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.company_name ? ` (${c.company_name})` : ""}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rf-status">Status</label>
            <select id="rf-status" value={form.status} onChange={(e) => set("status", e.target.value as ReferralStatus)}>
              {REFERRAL_STATUSES.map((s) => (
                <option key={s} value={s}>{REFERRAL_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="rf-app">Application</label>
          <select id="rf-app" value={form.application_id} onChange={(e) => set("application_id", e.target.value ? Number(e.target.value) : "")}>
            <option value="">— link an application (optional) —</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>{(a.company_name ?? "Unknown") + " — " + a.role_title}</option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="rf-first">First contacted</label>
            <input id="rf-first" type="date" value={form.first_contacted} onChange={(e) => set("first_contacted", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rf-follow">Next follow-up</label>
            <input id="rf-follow" type="date" value={form.next_follow_up} onChange={(e) => set("next_follow_up", e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="rf-link">Referral link</label>
          <input id="rf-link" value={form.referral_link} onChange={(e) => set("referral_link", e.target.value)} placeholder="https://…" />
        </div>
        <div className="field">
          <label htmlFor="rf-confirm">Confirmation note</label>
          <input id="rf-confirm" value={form.confirmation_note} onChange={(e) => set("confirmation_note", e.target.value)} placeholder="e.g. Confirmed submitted on 9/12 via email" />
        </div>
        <label className="check-row">
          <input type="checkbox" checked={form.thank_you_sent} onChange={(e) => set("thank_you_sent", e.target.checked)} />
          <span>Thank-you sent</span>
        </label>
        <div className="field">
          <label htmlFor="rf-notes">Notes</label>
          <textarea id="rf-notes" className="notes-sm" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Conversation notes…" />
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
