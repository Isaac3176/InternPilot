import { useEffect, useState } from "react";
import { deleteContact, listContacts } from "../db/contacts";
import { deleteReferral, listReferrals, setReferralStatus } from "../db/referrals";
import {
  REFERRAL_STATUSES,
  REFERRAL_STATUS_LABELS,
  RELATIONSHIP_TYPE_LABELS,
  type ContactRow,
  type ReferralRow,
  type ReferralStatus,
} from "../db/types";
import ContactModal from "../components/ContactModal";
import ReferralModal from "../components/ReferralModal";

const TERMINAL: ReferralStatus[] = ["declined", "no_response", "expired", "applied_through_referral"];

function statusBadgeClass(s: ReferralStatus): string {
  if (s === "referral_confirmed" || s === "applied_through_referral") return "offer";
  if (s === "declined" || s === "no_response" || s === "expired") return "rejected";
  if (s === "referral_agreed" || s === "referral_submitted") return "oa";
  return "interested";
}

function referralWarnings(r: ReferralRow): string[] {
  const warnings: string[] = [];
  if (r.status === "referral_agreed" && !r.confirmation_note?.trim()) {
    warnings.push("Marked agreed, but no confirmation recorded.");
  }
  if (r.status === "referral_confirmed" && r.thank_you_sent === 0) {
    warnings.push("Confirmed — no thank-you sent yet.");
  }
  if (r.next_follow_up && !TERMINAL.includes(r.status)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(r.next_follow_up) < today) warnings.push("Follow-up overdue.");
  }
  return warnings;
}

export default function Networking() {
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactModal, setContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);
  const [referralModal, setReferralModal] = useState(false);
  const [editingReferral, setEditingReferral] = useState<ReferralRow | null>(null);

  function load() {
    listReferrals().then(setReferrals).catch(console.error);
    listContacts().then(setContacts).catch(console.error);
  }
  useEffect(load, []);

  async function changeStatus(id: number, status: ReferralStatus) {
    await setReferralStatus(id, status);
    load();
  }
  async function removeReferral(id: number) {
    if (!confirm("Delete this referral?")) return;
    await deleteReferral(id);
    load();
  }
  async function removeContact(id: number) {
    if (!confirm("Delete this contact?")) return;
    await deleteContact(id);
    load();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Networking</h1>
          <p>Track contacts and referral paths from first outreach to confirmed referral.</p>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => { setEditingContact(null); setContactModal(true); }}>+ Contact</button>
          <button type="button" onClick={() => { setEditingReferral(null); setReferralModal(true); }}>+ Referral</button>
        </div>
      </div>

      <div className="card">
        <h2>Referral pipeline</h2>
        {referrals.length === 0 ? (
          <div className="empty">No referrals yet. Add one to start tracking a referral path.</div>
        ) : (
          referrals.map((r) => {
            const warnings = referralWarnings(r);
            return (
              <div className="card card-inset" key={r.id}>
                <div className="row-between">
                  <div>
                    <strong>{r.contact_name ?? "Unknown contact"}</strong>
                    <span className="muted">{r.company_name ? ` · ${r.company_name}` : ""}{r.role_title ? ` · ${r.role_title}` : ""}</span>
                    <div className="mt-xs">
                      <span className={`badge ${statusBadgeClass(r.status)}`}>{REFERRAL_STATUS_LABELS[r.status]}</span>
                      {r.next_follow_up && <span className="muted ml-xs">Follow up {r.next_follow_up}</span>}
                    </div>
                  </div>
                  <div className="actions">
                    <select aria-label="Referral status" value={r.status} onChange={(e) => changeStatus(r.id, e.target.value as ReferralStatus)}>
                      {REFERRAL_STATUSES.map((s) => (
                        <option key={s} value={s}>{REFERRAL_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    <button type="button" className="secondary small" onClick={() => { setEditingReferral(r); setReferralModal(true); }}>Edit</button>
                    <button type="button" className="danger small" onClick={() => removeReferral(r.id)}>Delete</button>
                  </div>
                </div>
                {warnings.map((w, i) => (
                  <p className="hint text-red mt-xs" key={i}>⚠ {w}</p>
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="card">
        <h2>Contacts</h2>
        {contacts.length === 0 ? (
          <div className="empty">No contacts yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Company</th><th>Relationship</th><th>Strength</th><th style={{ width: 130 }}></th></tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}{c.title ? <span className="muted"> · {c.title}</span> : ""}</td>
                  <td className="muted">{c.company_name ?? "—"}</td>
                  <td className="muted">{c.relationship_type ? RELATIONSHIP_TYPE_LABELS[c.relationship_type] : "—"}</td>
                  <td className="muted">{c.relationship_strength ?? "—"}</td>
                  <td>
                    <div className="actions">
                      <button type="button" className="secondary small" onClick={() => { setEditingContact(c); setContactModal(true); }}>Edit</button>
                      <button type="button" className="danger small" onClick={() => removeContact(c.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {contactModal && (
        <ContactModal initial={editingContact} onClose={() => setContactModal(false)} onSaved={() => { setContactModal(false); load(); }} />
      )}
      {referralModal && (
        <ReferralModal initial={editingReferral} onClose={() => setReferralModal(false)} onSaved={() => { setReferralModal(false); load(); }} />
      )}
    </>
  );
}
