import { useEffect, useState } from "react";
import {
  createEmail,
  deleteEmail,
  linkEmailApplication,
  listEmails,
  setEmailClassification,
} from "../db/emails";
import { listApplications, setApplicationStatus } from "../db/applications";
import {
  CATEGORY_TO_STATUS,
  EMAIL_CATEGORY_LABELS,
  STATUS_LABELS,
  type ApplicationRow,
  type EmailCategory,
  type EmailRow,
} from "../db/types";
import { classifyEmail } from "../ai/email";
import { hasApiKey } from "../ai/settings";
import { isConnected } from "../gmail/config";
import { syncGmail } from "../gmail/sync";
import { userErrorMessage } from "../lib/errors";

const CATEGORY_BADGE: Record<EmailCategory, string> = {
  confirmation: "applied",
  rejection: "rejected",
  oa: "oa",
  interview: "interview",
  recruiter: "interested",
  offer: "offer",
  other: "interested",
};

const emptyForm = { sender: "", subject: "", body: "", received_at: "" };

export default function Emails() {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "error">("info");
  const gmailConnected = isConnected();

  function showInfo(text: string) {
    setMessageKind("info");
    setMessage(text);
  }

  function showError(error: unknown, fallback: string) {
    setMessageKind("error");
    setMessage(userErrorMessage(error, fallback));
  }

  async function sync() {
    setSyncing(true);
    setMessage("");
    try {
      const result = await syncGmail();
      showInfo(`Synced Gmail: ${result.added} new email(s), ${result.classified} classified.`);
      load();
    } catch (e) {
      showError(e, "Couldn't sync Gmail.");
    } finally {
      setSyncing(false);
    }
  }

  function load() {
    listEmails().then(setRows).catch((e) => showError(e, "Couldn't load emails."));
    listApplications().then(setApps).catch((e) => showError(e, "Couldn't load applications."));
  }
  useEffect(load, []);

  async function addAndClassify() {
    if (!form.subject.trim() && !form.body.trim()) return;
    setMessage("");
    try {
      const id = await createEmail({
        sender: form.sender || null,
        subject: form.subject || null,
        body: form.body || null,
        received_at: form.received_at || null,
      });
      if (id) {
        const result = await classifyEmail(form);
        await setEmailClassification(id, result.category, result.confidence);
      }
      setForm(emptyForm);
      load();
    } catch (e) {
      showError(e, "Couldn't add this email.");
    }
  }

  async function reclassify(row: EmailRow) {
    setBusyId(row.id);
    setMessage("");
    try {
      const result = await classifyEmail(row);
      await setEmailClassification(row.id, result.category, result.confidence);
      load();
    } catch (e) {
      showError(e, "Couldn't classify this email.");
    } finally {
      setBusyId(null);
    }
  }

  async function link(row: EmailRow, applicationId: number | null) {
    setMessage("");
    try {
      await linkEmailApplication(row.id, applicationId);
      load();
    } catch (e) {
      showError(e, "Couldn't link this email.");
    }
  }

  async function applyStatus(row: EmailRow) {
    const suggested = row.classification ? CATEGORY_TO_STATUS[row.classification] : null;
    if (!row.application_id || !suggested) return;
    if (!confirm(`Mark this application as "${STATUS_LABELS[suggested]}"?`)) return;
    setMessage("");
    try {
      await setApplicationStatus(row.application_id, suggested);
      showInfo("Application status updated.");
      load();
    } catch (e) {
      showError(e, "Couldn't update application status.");
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this email?")) return;
    setMessage("");
    try {
      await deleteEmail(id);
      load();
    } catch (e) {
      showError(e, "Couldn't delete this email.");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Email Inbox</h1>
          <p>Classify job-related emails and update application statuses after your review.</p>
        </div>
        {gmailConnected && (
          <button type="button" onClick={sync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync Gmail"}
          </button>
        )}
      </div>
      {message && <p className={`hint ${messageKind === "error" ? "text-red" : ""}`}>{message}</p>}

      <div className="card">
        <h2>Add an email</h2>
        <p className="hint">Paste an email to classify it. Live Gmail sync connects in Settings.</p>
        <div className="field-row">
          <div className="field">
            <label htmlFor="em-sender">From</label>
            <input id="em-sender" value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} placeholder="recruiter@company.com" />
          </div>
          <div className="field">
            <label htmlFor="em-date">Received</label>
            <input id="em-date" type="date" value={form.received_at} onChange={(e) => setForm({ ...form, received_at: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="em-subject">Subject</label>
          <input id="em-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Your application to..." />
        </div>
        <div className="field">
          <label htmlFor="em-body">Body</label>
          <textarea id="em-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Paste the email body..." />
        </div>
        {!hasApiKey() && <p className="hint">No OpenAI key — classification uses offline keyword rules.</p>}
        <button type="button" onClick={addAndClassify} disabled={!form.subject.trim() && !form.body.trim()}>
          Add & classify
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No emails yet. Paste one above or connect Gmail in Settings.</div>
      ) : (
        rows.map((row) => {
          const suggested = row.classification ? CATEGORY_TO_STATUS[row.classification] : null;
          return (
            <div className="card" key={row.id}>
              <div className="row-between">
                <div>
                  <strong>{row.subject || "(no subject)"}</strong>
                  <div className="muted text-sm mt-xs">{row.sender ?? "—"}{row.received_at ? ` · ${row.received_at}` : ""}</div>
                </div>
                {row.classification && (
                  <span className={`badge ${CATEGORY_BADGE[row.classification]}`}>
                    {EMAIL_CATEGORY_LABELS[row.classification]}
                    {row.confidence != null ? ` · ${Math.round(row.confidence * 100)}%` : ""}
                  </span>
                )}
              </div>

              {row.body && <p className="muted text-sm mt-xs email-body">{row.body}</p>}

              <div className="field-row mt-sm">
                <div className="field mb-0">
                  <label htmlFor={`link-${row.id}`}>Linked application</label>
                  <select
                    id={`link-${row.id}`}
                    value={row.application_id ?? ""}
                    onChange={(e) => link(row, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— none —</option>
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>{(a.company_name ?? "Unknown") + " — " + a.role_title}</option>
                    ))}
                  </select>
                </div>
                <div className="field mb-0 suggest-col">
                  <label>Suggested update</label>
                  <div className="actions">
                    <button
                      type="button"
                      className="small"
                      onClick={() => applyStatus(row)}
                      disabled={!row.application_id || !suggested}
                    >
                      {suggested ? `Mark as ${STATUS_LABELS[suggested]}` : "No status change"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="actions mt-sm">
                <button type="button" className="secondary small" onClick={() => reclassify(row)} disabled={busyId === row.id}>
                  {busyId === row.id ? "Classifying…" : "Reclassify"}
                </button>
                <button type="button" className="danger small" onClick={() => remove(row.id)}>Delete</button>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
