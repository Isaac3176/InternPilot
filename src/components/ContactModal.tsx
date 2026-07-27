import { useEffect, useState } from "react";
import { createContact, updateContact, type ContactInput } from "../db/contacts";
import {
  RELATIONSHIP_TYPES,
  RELATIONSHIP_TYPE_LABELS,
  type ContactRow,
  type RelationshipType,
} from "../db/types";

interface Props {
  initial?: ContactRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const empty: ContactInput = {
  name: "",
  company_name: "",
  title: "",
  team: "",
  email: "",
  linkedin: "",
  relationship_type: null,
  relationship_strength: null,
  how_you_know: "",
  contact_again: true,
  notes: "",
};

export default function ContactModal({ initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ContactInput>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name,
        company_name: initial.company_name ?? "",
        title: initial.title ?? "",
        team: initial.team ?? "",
        email: initial.email ?? "",
        linkedin: initial.linkedin ?? "",
        relationship_type: initial.relationship_type,
        relationship_strength: initial.relationship_strength,
        how_you_know: initial.how_you_know ?? "",
        contact_again: initial.contact_again !== 0,
        notes: initial.notes ?? "",
      });
    }
  }, [initial]);

  function set<K extends keyof ContactInput>(k: K, v: ContactInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (initial) await updateContact(initial.id, form);
      else await createContact(form);
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
        <h2>{initial ? "Edit contact" : "New contact"}</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="ct-name">Name *</label>
            <input id="ct-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Jordan Lee" />
          </div>
          <div className="field">
            <label htmlFor="ct-company">Company</label>
            <input id="ct-company" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Capital One" />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="ct-title">Title</label>
            <input id="ct-title" value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Software Engineer" />
          </div>
          <div className="field">
            <label htmlFor="ct-team">Team</label>
            <input id="ct-team" value={form.team ?? ""} onChange={(e) => set("team", e.target.value)} placeholder="Payments" />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="ct-email">Email</label>
            <input id="ct-email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="name@company.com" />
          </div>
          <div className="field">
            <label htmlFor="ct-linkedin">LinkedIn</label>
            <input id="ct-linkedin" value={form.linkedin ?? ""} onChange={(e) => set("linkedin", e.target.value)} placeholder="linkedin.com/in/…" />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="ct-rel">Relationship</label>
            <select id="ct-rel" value={form.relationship_type ?? ""} onChange={(e) => set("relationship_type", (e.target.value || null) as RelationshipType | null)}>
              <option value="">—</option>
              {RELATIONSHIP_TYPES.map((r) => (
                <option key={r} value={r}>{RELATIONSHIP_TYPE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ct-strength">Relationship strength (1–5)</label>
            <select id="ct-strength" value={form.relationship_strength ?? ""} onChange={(e) => set("relationship_strength", e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ct-how">How you know them</label>
          <input id="ct-how" value={form.how_you_know ?? ""} onChange={(e) => set("how_you_know", e.target.value)} placeholder="Centre alum, met at career fair…" />
        </div>
        <label className="check-row">
          <input type="checkbox" checked={form.contact_again !== false} onChange={(e) => set("contact_again", e.target.checked)} />
          <span>OK to contact again for other roles</span>
        </label>
        <div className="field">
          <label htmlFor="ct-notes">Notes</label>
          <textarea id="ct-notes" className="notes-sm" value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Conversation notes…" />
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="button" onClick={save} disabled={saving || !form.name.trim()}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
