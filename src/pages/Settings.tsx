import { useState } from "react";
import {
  DEFAULT_MODEL,
  getApiKey,
  getModel,
  setApiKey,
  setModel,
} from "../ai/settings";
import {
  getClientId,
  getClientSecret,
  getTokens,
  isConnected,
  setClientId,
  setClientSecret,
} from "../gmail/config";
import { connectGmail, disconnectGmail } from "../gmail/oauth";
import { getDb } from "../db";

export default function Settings() {
  const [apiKey, setApiKeyState] = useState(getApiKey());
  const [model, setModelState] = useState(getModel());
  const [saved, setSaved] = useState(false);

  const [clientId, setClientIdState] = useState(getClientId());
  const [clientSecret, setClientSecretState] = useState(getClientSecret());
  const [connected, setConnected] = useState(isConnected());
  const [connecting, setConnecting] = useState(false);
  const [gmailError, setGmailError] = useState("");

  function save() {
    setApiKey(apiKey.trim());
    setModel(model.trim() || DEFAULT_MODEL);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function connect() {
    setClientId(clientId.trim());
    setClientSecret(clientSecret.trim());
    setConnecting(true);
    setGmailError("");
    try {
      await connectGmail();
      setConnected(true);
    } catch (e) {
      setGmailError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    disconnectGmail();
    setConnected(false);
  }

  async function exportData() {
    const db = await getDb();
    const tables = ["companies", "applications", "resume_versions", "resume_bullets", "tasks", "emails"];
    const dump: Record<string, unknown[]> = {};
    for (const t of tables) {
      dump[t] = await db.select(`SELECT * FROM ${t}`);
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "internpilot-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAll() {
    if (!confirm("Delete ALL local data? This cannot be undone.")) return;
    const db = await getDb();
    for (const t of ["tasks", "resume_bullets", "emails", "interviews", "interview_experiences", "applications", "resume_versions", "companies"]) {
      await db.execute(`DELETE FROM ${t}`);
    }
    alert("All data deleted.");
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>API keys, Gmail, AI model, and your local data.</p>
        </div>
      </div>

      <div className="card">
        <h2>OpenAI</h2>
        <div className="field">
          <label htmlFor="s-key">API key</label>
          <input
            id="s-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKeyState(e.target.value)}
            placeholder="sk-..."
          />
          <p className="hint">
            Stored locally on this device only. Used for resume matching, prep plans, and the AI chat. Leave blank
            to use the offline estimate.
          </p>
        </div>
        <div className="field">
          <label htmlFor="s-model">Model</label>
          <input id="s-model" value={model} onChange={(e) => setModelState(e.target.value)} placeholder={DEFAULT_MODEL} />
        </div>
        <button type="button" onClick={save}>{saved ? "Saved ✓" : "Save settings"}</button>
      </div>

      <div className="card">
        <h2>Gmail</h2>
        {connected ? (
          <>
            <p className="hint mb-md">
              Connected{getTokens()?.email ? ` as ${getTokens()?.email}` : ""}. InternPilot reads only job-related
              messages (read-only scope) and never modifies your inbox.
            </p>
            <button type="button" className="danger" onClick={disconnect}>Disconnect Gmail</button>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="g-id">Client ID</label>
              <input id="g-id" value={clientId} onChange={(e) => setClientIdState(e.target.value)} placeholder="...apps.googleusercontent.com" />
            </div>
            <div className="field">
              <label htmlFor="g-secret">Client secret</label>
              <input id="g-secret" type="password" value={clientSecret} onChange={(e) => setClientSecretState(e.target.value)} placeholder="From the same OAuth desktop credential" />
              <p className="hint">
                Read-only Gmail access via OAuth (loopback + PKCE). Tokens are stored locally. In "Testing" status
                Google expires access every ~7 days, so you may need to reconnect.
              </p>
            </div>
            <button type="button" onClick={connect} disabled={connecting}>
              {connecting ? "Waiting for Google…" : "Connect Gmail"}
            </button>
            {gmailError && <p className="hint text-red">{gmailError}</p>}
          </>
        )}
      </div>

      <div className="card">
        <h2>Your data</h2>
        <p className="hint mb-md">
          All application data is stored locally in SQLite. Nothing leaves your device except the text you send to
          OpenAI, and the job-related emails fetched from Gmail with your permission.
        </p>
        <button type="button" className="secondary" onClick={exportData}>Export data (JSON)</button>{" "}
        <button type="button" className="danger" onClick={deleteAll}>Delete all data</button>
      </div>
    </>
  );
}
