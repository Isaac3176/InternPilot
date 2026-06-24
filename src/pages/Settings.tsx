import { useState } from "react";
import {
  DEFAULT_MODEL,
  getApiKey,
  getModel,
  setApiKey,
  setModel,
} from "../ai/settings";
import { getDb } from "../db";

export default function Settings() {
  const [apiKey, setApiKeyState] = useState(getApiKey());
  const [model, setModelState] = useState(getModel());
  const [saved, setSaved] = useState(false);

  function save() {
    setApiKey(apiKey.trim());
    setModel(model.trim() || DEFAULT_MODEL);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function exportData() {
    const db = await getDb();
    const tables = ["companies", "applications", "resume_versions", "resume_bullets", "tasks"];
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
          <p>API keys, AI model, and your local data.</p>
        </div>
      </div>

      <div className="card">
        <h2>OpenAI</h2>
        <div className="field">
          <label>API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKeyState(e.target.value)}
            placeholder="sk-..."
          />
          <p className="hint">
            Stored locally on this device only. Used for resume matching and the AI chat. Leave blank to use the
            offline estimate.
          </p>
        </div>
        <div className="field">
          <label>Model</label>
          <input value={model} onChange={(e) => setModelState(e.target.value)} placeholder={DEFAULT_MODEL} />
        </div>
        <button onClick={save}>{saved ? "Saved ✓" : "Save settings"}</button>
      </div>

      <div className="card">
        <h2>Your data</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          All application data is stored locally in SQLite. Nothing leaves your device except the text you send to
          OpenAI when you run a match or chat.
        </p>
        <button className="secondary" onClick={exportData}>Export data (JSON)</button>{" "}
        <button className="danger" onClick={deleteAll}>Delete all data</button>
      </div>
    </>
  );
}
