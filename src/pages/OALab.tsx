import { useEffect, useMemo, useState } from "react";
import { createOAAttempt, deleteOAAttempt, listOAAttempts, type OAAttempt, type OAQuestion } from "../db/oaAttempts";
import { listApplications } from "../db/applications";
import { analyzeOA } from "../prep/oaDiagnostics";
import type { ApplicationRow } from "../db/types";
import CompanyLogo from "../components/CompanyLogo";

const blankQ = (): OAQuestion => ({ attempted: true, solved: false, timeMin: null, difficulty: "", topic: "", testsPassed: "", problem: "", failureReason: "" });
const DIFFICULTIES = ["", "Easy", "Medium", "Hard"];

export default function OALab() {
  const [attempts, setAttempts] = useState<OAAttempt[]>([]);
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = () => listOAAttempts().then(setAttempts).catch(console.error);
  useEffect(() => { load(); listApplications().then(setApps).catch(() => {}); }, []);

  const diag = useMemo(() => analyzeOA(attempts), [attempts]);

  async function remove(id: number) {
    if (!confirm("Delete this OA debrief?")) return;
    await deleteOAAttempt(id);
    load();
  }

  return (
    <div className="oa">
      <div className="page-header">
        <div>
          <h1>OA Lab</h1>
          <p>Debrief each online assessment — then let InternPilot diagnose the pattern, not just log "OA completed".</p>
        </div>
        <button type="button" onClick={() => setShowForm((s) => !s)}>{showForm ? "Close" : "+ Log an OA"}</button>
      </div>

      {showForm && <OAForm apps={apps} onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />}

      {diag && <Diagnostics diag={diag} />}

      {attempts.length === 0 && !showForm ? (
        <div className="empty"><b>No assessments logged yet</b><p>After an OA, log a quick debrief. A few of them and the weakness analysis lights up.</p></div>
      ) : (
        <div className="oa-list">
          {attempts.map((a) => <AttemptCard key={a.id} a={a} onDelete={() => remove(a.id)} />)}
        </div>
      )}
    </div>
  );
}

function Diagnostics({ diag }: { diag: NonNullable<ReturnType<typeof analyzeOA>> }) {
  const timeMgmt = diag.weaknesses.find((w) => w.key === "time-management");
  return (
    <div className="oa-diag">
      <div className="oa-diag-head">
        <span className="eyebrow">Prep signal</span>
        {diag.lowConfidence && <span className="oa-lowconf">Low confidence · {diag.attempts} assessment{diag.attempts === 1 ? "" : "s"} — patterns firm up with more</span>}
      </div>

      {timeMgmt ? (
        <h2 className="oa-diag-title">OA weakness detected: <b>time management</b></h2>
      ) : diag.weaknesses.length ? (
        <h2 className="oa-diag-title">Pattern to watch: <b>{diag.weaknesses[0].label.toLowerCase()}</b></h2>
      ) : (
        <h2 className="oa-diag-title">No clear weakness yet — keep logging</h2>
      )}

      <div className="oa-metrics">
        <div className="oa-metric"><b>{Math.round(diag.solveRate * 100)}%</b><span>solved of attempted</span></div>
        <div className="oa-metric"><b>{Math.round(diag.completionRate * 100)}%</b><span>questions reached</span></div>
        <div className="oa-metric"><b>{diag.worstTimeSinkPct != null ? `${Math.round(diag.worstTimeSinkPct * 100)}%` : "—"}</b><span>worst time on one problem</span></div>
      </div>

      {diag.weaknesses.length > 0 && (
        <ul className="oa-weak">
          {diag.weaknesses.map((w) => <li key={w.key}><b>{w.label}.</b> {w.detail}</li>)}
        </ul>
      )}

      <div className="oa-rx">
        <span className="eyebrow">Recommended training</span>
        <ul>{diag.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </div>
      <p className="oa-caveat">Associations from your own debriefs — a training guide, not a diagnosis. Correlation, not proof.</p>
    </div>
  );
}

function AttemptCard({ a, onDelete }: { a: OAAttempt; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const solved = a.questions.filter((q) => q.solved).length;
  const attempted = a.questions.filter((q) => q.attempted).length;
  return (
    <article className="oa-card">
      <div className="oa-card-head">
        <CompanyLogo company={a.company ?? "?"} />
        <div className="oa-card-tx">
          <b>{a.company ?? "Unknown"}{a.role_title ? ` · ${a.role_title}` : ""}</b>
          <span>{a.taken_on ?? "—"} · {a.duration_min ? `${a.duration_min} min` : "duration —"} · {a.num_questions ?? a.questions.length} questions</span>
        </div>
        <span className="oa-score">{solved}/{a.questions.length} solved</span>
        <button type="button" className="oa-del" onClick={onDelete} title="Delete" aria-label="Delete">✕</button>
      </div>

      {a.primary_lesson && <p className="oa-lesson"><span className="eyebrow">Primary lesson</span>{a.primary_lesson}</p>}

      <button type="button" className="oa-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide" : "Show"} per-question breakdown ({attempted}/{a.questions.length} attempted)
      </button>
      {open && (
        <div className="oa-questions">
          {a.questions.map((q, i) => (
            <div className={`oa-q ${q.solved ? "solved" : q.attempted ? "unsolved" : "skipped"}`} key={i}>
              <div className="oa-q-top">
                <b>Q{i + 1}</b>
                <span className="oa-q-verdict">{q.solved ? "Solved" : q.attempted ? "Attempted · unsolved" : "Not attempted"}</span>
                {q.timeMin != null && <span className="oa-q-time">~{q.timeMin} min</span>}
                {q.difficulty && <span className="oa-q-chip">{q.difficulty}</span>}
                {q.topic && <span className="oa-q-chip topic">{q.topic}</span>}
                {q.testsPassed && <span className="oa-q-chip">{q.testsPassed} tests</span>}
              </div>
              {q.problem && <p className="oa-q-note">{q.problem}</p>}
              {q.failureReason && <p className="oa-q-fail">✕ {q.failureReason}</p>}
            </div>
          ))}
        </div>
      )}

      {(a.next_rule || a.topics_review.length > 0) && (
        <div className="oa-foot">
          {a.topics_review.length > 0 && (
            <div className="oa-topics"><span className="eyebrow">Review</span>{a.topics_review.map((t) => <span key={t} className="oa-q-chip topic">{t}</span>)}</div>
          )}
          {a.next_rule && <p className="oa-rule"><span className="eyebrow">Next-OA rule</span>{a.next_rule}</p>}
        </div>
      )}
    </article>
  );
}

function OAForm({ apps, onSaved, onCancel }: { apps: ApplicationRow[]; onSaved: () => void; onCancel: () => void }) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [appId, setAppId] = useState<number | null>(null);
  const [takenOn, setTakenOn] = useState(new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState("");
  const [questions, setQuestions] = useState<OAQuestion[]>([blankQ(), blankQ()]);
  const [lesson, setLesson] = useState("");
  const [nextRule, setNextRule] = useState("");
  const [topics, setTopics] = useState("");
  const [busy, setBusy] = useState(false);

  function setQ(i: number, patch: Partial<OAQuestion>) {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }
  function pickApp(id: number | null) {
    setAppId(id);
    const app = apps.find((a) => a.id === id);
    if (app) { setCompany(app.company_name ?? ""); setRole(app.role_title); }
  }

  async function save() {
    if (!company.trim()) { alert("Add a company."); return; }
    setBusy(true);
    try {
      await createOAAttempt({
        application_id: appId, company, role_title: role, taken_on: takenOn,
        duration_min: duration ? Number(duration) : null,
        questions, primary_lesson: lesson, next_rule: nextRule,
        topics_review: topics.split(",").map((t) => t.trim()).filter(Boolean),
      });
      onSaved();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="oa-form">
      <div className="oa-form-grid">
        <label>Company<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="TikTok" /></label>
        <label>Role<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="SWE Intern" /></label>
        <label>Date<input type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} /></label>
        <label>Duration (min)<input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="75" /></label>
        <label>Link to application (optional)
          <select value={appId ?? ""} onChange={(e) => pickApp(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {apps.map((a) => <option key={a.id} value={a.id}>{a.company_name ?? "?"} · {a.role_title}</option>)}
          </select>
        </label>
      </div>

      <div className="oa-form-qs">
        {questions.map((q, i) => (
          <div className="oa-form-q" key={i}>
            <div className="oa-form-q-head">
              <b>Q{i + 1}</b>
              <label className="oa-chk"><input type="checkbox" checked={q.attempted} onChange={(e) => setQ(i, { attempted: e.target.checked })} /> Attempted</label>
              <label className="oa-chk"><input type="checkbox" checked={q.solved} onChange={(e) => setQ(i, { solved: e.target.checked, attempted: e.target.checked ? true : q.attempted })} /> Solved</label>
              {questions.length > 1 && <button type="button" className="oa-qx" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}>Remove</button>}
            </div>
            <div className="oa-form-q-grid">
              <input type="number" placeholder="Time (min)" value={q.timeMin ?? ""} onChange={(e) => setQ(i, { timeMin: e.target.value ? Number(e.target.value) : null })} />
              <select value={q.difficulty ?? ""} onChange={(e) => setQ(i, { difficulty: e.target.value })}>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d || "Difficulty?"}</option>)}
              </select>
              <input placeholder="Topic (e.g. simulation)" value={q.topic ?? ""} onChange={(e) => setQ(i, { topic: e.target.value })} />
              <input placeholder="Tests passed (e.g. 8/12)" value={q.testsPassed ?? ""} onChange={(e) => setQ(i, { testsPassed: e.target.value })} />
            </div>
            <input className="oa-wide" placeholder="Problem summary (optional)" value={q.problem ?? ""} onChange={(e) => setQ(i, { problem: e.target.value })} />
            {!q.solved && q.attempted && <input className="oa-wide" placeholder="Why unsolved? (e.g. stayed too long)" value={q.failureReason ?? ""} onChange={(e) => setQ(i, { failureReason: e.target.value })} />}
          </div>
        ))}
        <button type="button" className="oa-addq" onClick={() => setQuestions((qs) => [...qs, blankQ()])}>+ Add question</button>
      </div>

      <div className="oa-form-grid">
        <label className="oa-wide">Primary lesson<input value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="Time management" /></label>
        <label className="oa-wide">Topics to review (comma-separated)<input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="simulation, state transitions, maps/sets" /></label>
        <label className="oa-wide">Next-OA rule<input value={nextRule} onChange={(e) => setNextRule(e.target.value)} placeholder="Move on after 15 min without progress" /></label>
      </div>

      <div className="oa-form-acts">
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save debrief"}</button>
      </div>
    </div>
  );
}
