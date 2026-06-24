import { useEffect, useState, type ChangeEvent } from "react";
import {
  createResumeVersion,
  deleteResumeVersion,
  listResumeVersions,
  saveResumeBullet,
  updateResumeVersion,
} from "../db/resumes";
import type { ResumeVersion } from "../db/types";
import { matchResume } from "../ai";
import type { ResumeMatchResult } from "../ai/types";
import { hasApiKey } from "../ai/settings";
import { ACCEPTED_RESUME_TYPES, extractTextFromFile } from "../lib/extractText";

const emptyForm = { name: "", targetRole: "", content: "" };

export default function ResumeCenter() {
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  const [selectedId, setSelectedId] = useState<number | "">("");
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState<ResumeMatchResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  function load() {
    listResumeVersions().then(setVersions).catch(console.error);
  }
  useEffect(load, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(v: ResumeVersion) {
    setEditingId(v.id);
    setForm({ name: v.name, targetRole: v.target_role ?? "", content: v.content ?? "" });
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setImporting(true);
    setImportError("");
    try {
      const text = await extractTextFromFile(file);
      setForm((f) => ({
        ...f,
        content: text,
        name: f.name.trim() ? f.name : file.name.replace(/\.[^.]+$/, ""),
      }));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  async function saveVersion() {
    if (!form.name.trim()) return;
    const payload = { name: form.name, target_role: form.targetRole, content: form.content };
    if (editingId) await updateResumeVersion(editingId, payload);
    else await createResumeVersion(payload);
    resetForm();
    load();
  }

  async function removeVersion(id: number) {
    if (!confirm("Delete this resume version?")) return;
    await deleteResumeVersion(id);
    if (selectedId === id) setSelectedId("");
    if (editingId === id) resetForm();
    load();
  }

  async function runMatch() {
    const resume = versions.find((v) => v.id === selectedId);
    if (!resume?.content?.trim() || !jobDescription.trim()) return;
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const r = await matchResume({
        resumeText: resume.content,
        jobDescription,
        targetRole: resume.target_role ?? undefined,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function saveBullet(before: string, after: string) {
    await saveResumeBullet({
      experience_name: null,
      original_text: before,
      improved_text: after,
      tags: result?.source ?? null,
      application_id: null,
    });
    alert("Saved to your bullet library.");
  }

  const selected = versions.find((v) => v.id === selectedId);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Resume Center</h1>
          <p>Manage targeted resume versions and match them to job descriptions.</p>
        </div>
      </div>

      <div className="card">
        <h2>{editingId ? "Edit resume version" : "Add a resume version"}</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="rv-name">Name *</label>
            <input id="rv-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Backend Resume" />
          </div>
          <div className="field">
            <label htmlFor="rv-role">Target role</label>
            <input id="rv-role" value={form.targetRole} onChange={(e) => setForm({ ...form, targetRole: e.target.value })} placeholder="Backend / API roles" />
          </div>
        </div>
        <div className="field">
          <div className="row-between mb-xs">
            <label htmlFor="rv-content">Resume text</label>
            <label className="import-link">
              {importing ? "Importing…" : "Import from file"}
              <input
                type="file"
                accept={ACCEPTED_RESUME_TYPES}
                onChange={handleImport}
                disabled={importing}
                hidden
              />
            </label>
          </div>
          <textarea id="rv-content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Paste your resume content, or import a PDF / DOCX file." />
          {importError && <p className="hint text-red">{importError}</p>}
        </div>
        <div className="actions">
          <button type="button" onClick={saveVersion} disabled={!form.name.trim()}>
            {editingId ? "Update version" : "Save version"}
          </button>
          {editingId && (
            <button type="button" className="secondary" onClick={resetForm}>Cancel</button>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Resume versions</h2>
        {versions.length === 0 ? (
          <div className="empty">No resume versions yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Target role</th><th>Saved</th><th aria-label="Actions"></th></tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td className="muted">{v.target_role ?? "—"}</td>
                  <td className="muted">{v.created_at?.slice(0, 10)}</td>
                  <td>
                    <div className="actions">
                      <button type="button" className="secondary small" onClick={() => startEdit(v)}>Edit</button>
                      <button type="button" className="danger small" onClick={() => removeVersion(v.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>AI resume match</h2>
        {!hasApiKey() && (
          <p className="hint">
            No OpenAI key set — using the offline keyword estimate. Add a key in Settings for a full analysis.
          </p>
        )}
        <div className="field">
          <label htmlFor="rv-select">Resume version</label>
          <select id="rv-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— select a version —</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          {selected && !selected.content?.trim() && (
            <p className="hint">This version has no resume text saved — use Edit above to add content.</p>
          )}
        </div>
        <div className="field">
          <label htmlFor="rv-jd">Job description</label>
          <textarea id="rv-jd" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the job description to compare against." />
        </div>
        <button type="button" onClick={runMatch} disabled={running || !selected?.content?.trim() || !jobDescription.trim()}>
          {running ? "Analyzing..." : "Run match"}
        </button>

        {error && <p className="hint text-red">{error}</p>}

        {result && (
          <div className="mt-lg">
            <div className="row-between">
              <div>
                <div className="label text-dim">Match score</div>
                <div className="pill-score">{result.matchScore}%</div>
              </div>
              <span className={`badge ${result.source === "openai" ? "offer" : "interested"}`}>
                {result.source === "openai" ? "OpenAI" : "Offline estimate"}
              </span>
            </div>

            <h3 className="mb-xs">Matching skills</h3>
            <div className="tag-list">
              {result.matchingSkills.map((s, i) => <span className="tag hit" key={i}>{s}</span>)}
            </div>

            <h3 className="result-h3">Missing skills / keywords</h3>
            <div className="tag-list">
              {result.missingSkills.map((s, i) => <span className="tag miss" key={i}>{s}</span>)}
            </div>

            <h3 className="mt-md">Suggested bullet rewrites</h3>
            {result.suggestedBullets.map((b, i) => (
              <div className="card card-inset" key={i}>
                <div className="muted text-sm">Before: {b.before}</div>
                <div className="mt-xs">After: {b.after}</div>
                <button type="button" className="secondary small mt-sm" onClick={() => saveBullet(b.before, b.after)}>
                  Save to library
                </button>
              </div>
            ))}

            <h3 className="mt-md">Strategy</h3>
            <p className="strategy">{result.strategy}</p>
          </div>
        )}
      </div>
    </>
  );
}
