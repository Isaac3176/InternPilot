import { useEffect, useState } from "react";
import {
  createResumeVersion,
  deleteResumeVersion,
  listResumeVersions,
  saveResumeBullet,
} from "../db/resumes";
import type { ResumeVersion } from "../db/types";
import { matchResume } from "../ai";
import type { ResumeMatchResult } from "../ai/types";
import { hasApiKey } from "../ai/settings";

export default function ResumeCenter() {
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [name, setName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [content, setContent] = useState("");

  const [selectedId, setSelectedId] = useState<number | "">("");
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState<ResumeMatchResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  function load() {
    listResumeVersions().then(setVersions).catch(console.error);
  }
  useEffect(load, []);

  async function addVersion() {
    if (!name.trim()) return;
    await createResumeVersion({ name, target_role: targetRole, content });
    setName("");
    setTargetRole("");
    setContent("");
    load();
  }

  async function removeVersion(id: number) {
    if (!confirm("Delete this resume version?")) return;
    await deleteResumeVersion(id);
    if (selectedId === id) setSelectedId("");
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
        <h2>Add a resume version</h2>
        <div className="field-row">
          <div className="field">
            <label>Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Backend Resume" />
          </div>
          <div className="field">
            <label>Target role</label>
            <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="Backend / API roles" />
          </div>
        </div>
        <div className="field">
          <label>Resume text (paste plain text)</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste your resume content here..." />
        </div>
        <button onClick={addVersion} disabled={!name.trim()}>Save version</button>
      </div>

      <div className="card">
        <h2>Resume versions</h2>
        {versions.length === 0 ? (
          <div className="empty">No resume versions yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Target role</th><th>Saved</th><th style={{ width: 90 }}></th></tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td className="muted">{v.target_role ?? "—"}</td>
                  <td className="muted">{v.created_at?.slice(0, 10)}</td>
                  <td><button className="danger small" onClick={() => removeVersion(v.id)}>Delete</button></td>
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
          <label>Resume version</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— select a version —</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          {selected && !selected.content?.trim() && (
            <p className="hint">This version has no resume text saved — edit it to add content.</p>
          )}
        </div>
        <div className="field">
          <label>Job description</label>
          <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the job description to compare against." />
        </div>
        <button onClick={runMatch} disabled={running || !selected?.content?.trim() || !jobDescription.trim()}>
          {running ? "Analyzing..." : "Run match"}
        </button>

        {error && <p className="hint" style={{ color: "var(--red)" }}>{error}</p>}

        {result && (
          <div style={{ marginTop: 20 }}>
            <div className="row-between">
              <div>
                <div className="label" style={{ color: "var(--text-dim)" }}>Match score</div>
                <div className="pill-score">{result.matchScore}%</div>
              </div>
              <span className={`badge ${result.source === "openai" ? "offer" : "interested"}`}>
                {result.source === "openai" ? "OpenAI" : "Offline estimate"}
              </span>
            </div>

            <h3 style={{ marginBottom: 4 }}>Matching skills</h3>
            <div className="tag-list">
              {result.matchingSkills.map((s, i) => <span className="tag hit" key={i}>{s}</span>)}
            </div>

            <h3 style={{ marginBottom: 4, marginTop: 16 }}>Missing skills / keywords</h3>
            <div className="tag-list">
              {result.missingSkills.map((s, i) => <span className="tag miss" key={i}>{s}</span>)}
            </div>

            <h3 style={{ marginTop: 16 }}>Suggested bullet rewrites</h3>
            {result.suggestedBullets.map((b, i) => (
              <div className="card" key={i} style={{ background: "var(--bg-elev-2)" }}>
                <div className="muted" style={{ fontSize: 13 }}>Before: {b.before}</div>
                <div style={{ marginTop: 6 }}>After: {b.after}</div>
                <button className="secondary small" style={{ marginTop: 10 }} onClick={() => saveBullet(b.before, b.after)}>
                  Save to library
                </button>
              </div>
            ))}

            <h3 style={{ marginTop: 16 }}>Strategy</h3>
            <p style={{ lineHeight: 1.6 }}>{result.strategy}</p>
          </div>
        )}
      </div>
    </>
  );
}
