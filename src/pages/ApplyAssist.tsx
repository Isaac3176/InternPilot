import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listApplications } from "../db/applications";
import { listResumeVersions } from "../db/resumes";
import type { ApplicationRow, ResumeVersion } from "../db/types";
import { generateApplyAssist, recommendResume, type ApplyAssist as Assist } from "../ai/apply";
import { hasApiKey } from "../ai/settings";

export default function ApplyAssist() {
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [appId, setAppId] = useState<number | "">("");
  const [resumeId, setResumeId] = useState<number | "">("");
  const [customQuestion, setCustomQuestion] = useState("");

  const [assist, setAssist] = useState<Assist | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listApplications().then(setApps).catch(console.error);
    listResumeVersions().then(setVersions).catch(console.error);
  }, []);

  const app = apps.find((a) => a.id === appId);

  const recommendations = useMemo(
    () => (app?.job_description ? recommendResume(app.job_description, versions) : []),
    [app, versions],
  );

  // Default the resume choice to the app's assigned version, else the top recommendation.
  useEffect(() => {
    if (!app) return;
    if (app.resume_version_id) setResumeId(app.resume_version_id);
    else if (recommendations.length) setResumeId(recommendations[0].id);
    else setResumeId("");
  }, [appId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    if (!app) return;
    setRunning(true);
    setError("");
    setAssist(null);
    setChecked(new Set());
    try {
      const resume = versions.find((v) => v.id === resumeId);
      const result = await generateApplyAssist({
        company: app.company_name ?? "",
        role: app.role_title,
        jobDescription: app.job_description,
        resumeText: resume?.content ?? null,
        customQuestion: customQuestion || null,
      });
      setAssist(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Apply Assist</h1>
          <p>Prepare an application in Safe Mode — you review and submit.</p>
        </div>
      </div>

      <div className="card">
        <h2>Choose an application</h2>
        <div className="field">
          <label htmlFor="aa-app">Application</label>
          <select id="aa-app" value={appId} onChange={(e) => setAppId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— select —</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {(a.company_name ?? "Unknown") + " — " + a.role_title}
              </option>
            ))}
          </select>
        </div>

        {app && (
          <>
            {recommendations.length > 0 && (
              <div className="field">
                <label>Recommended resume (by keyword match)</label>
                <div className="tag-list">
                  {recommendations.map((r, i) => (
                    <span className={`tag ${i === 0 ? "hit" : ""}`} key={r.id}>
                      {r.name} · {r.score}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="field">
              <label htmlFor="aa-resume">Resume to use</label>
              <select id="aa-resume" value={resumeId} onChange={(e) => setResumeId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">— none —</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="aa-q">Custom application question (optional)</label>
              <input id="aa-q" value={customQuestion} onChange={(e) => setCustomQuestion(e.target.value)} placeholder="e.g. What's your favorite project and why?" />
            </div>

            {!hasApiKey() && <p className="hint">No OpenAI key set — answers are placeholders. Add a key in Settings for real drafts.</p>}

            <div className="actions">
              <button type="button" onClick={generate} disabled={running}>
                {running ? "Generating…" : "Generate answers & checklist"}
              </button>
              {app.job_link && (
                <button type="button" className="secondary" onClick={() => openUrl(app.job_link as string)}>
                  Open job posting
                </button>
              )}
            </div>
            {error && <p className="hint text-red">{error}</p>}
          </>
        )}
      </div>

      {assist && (
        <>
          <div className="card">
            <h2>Preparation checklist</h2>
            {assist.checklist.map((item, i) => (
              <label className="check-row" key={i}>
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
                <span className={checked.has(i) ? "checked-text" : ""}>{item}</span>
              </label>
            ))}
          </div>

          <div className="card">
            <h2>Short-answer drafts</h2>
            {assist.shortAnswers.map((qa, i) => (
              <div className="card card-inset" key={i}>
                <strong>{qa.question}</strong>
                <p className="mt-xs">{qa.answer}</p>
                <button type="button" className="secondary small" onClick={() => copy(qa.answer)}>Copy</button>
              </div>
            ))}
            <span className={`badge ${assist.source === "openai" ? "offer" : "interested"}`}>
              {assist.source === "openai" ? "OpenAI" : "Offline placeholder"}
            </span>
          </div>
        </>
      )}
    </>
  );
}
