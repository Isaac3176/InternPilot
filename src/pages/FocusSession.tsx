import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openExternal } from "../lib/open";
import { createApplication } from "../db/applications";
import { getOpportunityQueue, recommendResume } from "../ranking/queue";
import { recordApplySignal } from "../ranking/learning";
import { getReusableAnswers } from "../apply/answers";
import type { RankedOpportunity } from "../ranking/types";
import type { ResumeVersion, Status } from "../db/types";
import CompanyLogo from "../components/CompanyLogo";

type Outcome = "applied" | "saved" | "skipped";

function mmss(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function FocusSession() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RankedOpportunity[]>([]);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(5);

  const [plan, setPlan] = useState<RankedOpportunity[] | null>(null); // non-null = session running
  const [idx, setIdx] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<number | null>(null);
  const answers = getReusableAnswers();

  useEffect(() => {
    getOpportunityQueue()
      .then((q) => { setItems(q.today.length ? q.today : q.items); setResumes(q.resumes); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (plan && idx < plan.length) {
      timer.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => { if (timer.current) window.clearInterval(timer.current); };
    }
  }, [plan, idx]);

  function start() {
    setPlan(items.slice(0, Math.min(count, items.length)));
    setIdx(0); setOutcomes([]); setElapsed(0);
  }

  async function record(o: RankedOpportunity, status: Status) {
    await createApplication({
      company_name: o.company, role_title: o.title, job_link: o.url,
      location: o.locations[0] ?? null, status,
      date_applied: status === "applied" ? new Date().toISOString().slice(0, 10) : null,
    });
  }
  async function advance(outcome: Outcome, o?: RankedOpportunity) {
    if (o && outcome === "applied") { try { await record(o, "applied"); recordApplySignal(o); } catch (e) { console.error(e); } }
    if (o && outcome === "saved") { try { await record(o, "interested"); } catch (e) { console.error(e); } }
    setOutcomes((prev) => [...prev, outcome]);
    setIdx((i) => i + 1);
  }

  if (loading) {
    return <div className="focus"><div className="page-header"><div><h1>Focus Session</h1><p>Building your session…</p></div></div></div>;
  }

  // ---- setup ----
  if (!plan) {
    const preview = items.slice(0, Math.min(count, items.length));
    const totalMin = preview.reduce((s, o) => s + o.estMinutes, 0);
    return (
      <div className="focus">
        <div className="page-header">
          <div><h1>Focus Session</h1><p>Knock out several strong applications in one sitting — the queue's top picks, back to back.</p></div>
        </div>
        {items.length === 0 ? (
          <div className="empty"><b>Nothing queued to apply to</b><p>Your Fast Apply queue is empty right now. Check Discover or lower your thresholds in Settings.</p>
            <button type="button" className="btn small" onClick={() => navigate("/")}>Back to Fast Apply</button></div>
        ) : (
          <div className="card">
            <div className="focus-setup">
              <div><span className="eyebrow">Session size</span>
                <div className="focus-counts">
                  {[3, 5, 8].map((n) => <button key={n} type="button" className={`btn small${count === n ? " on" : ""}`} onClick={() => setCount(n)} disabled={n > items.length}>{n}</button>)}
                </div>
              </div>
              <div className="focus-est"><b>~{totalMin} min</b><span>for {preview.length} application{preview.length === 1 ? "" : "s"}</span></div>
              <button type="button" className="btn primary" onClick={start}>Start session</button>
            </div>
            <ol className="focus-plan">
              {preview.map((o) => (
                <li key={o.id}>
                  <CompanyLogo company={o.company} />
                  <div className="fp-main"><b>{o.company}</b><span>{o.title}</span></div>
                  <span className="fp-est">~{o.estMinutes}m</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }

  // ---- summary ----
  if (idx >= plan.length) {
    const applied = outcomes.filter((o) => o === "applied").length;
    const saved = outcomes.filter((o) => o === "saved").length;
    const skipped = outcomes.filter((o) => o === "skipped").length;
    return (
      <div className="focus">
        <div className="page-header"><div><h1>Session complete</h1><p>Nice work.</p></div></div>
        <div className="card focus-summary">
          <div className="fs-stat"><b>{applied}</b><span>applied</span></div>
          <div className="fs-stat"><b>{saved}</b><span>saved</span></div>
          <div className="fs-stat"><b>{skipped}</b><span>skipped</span></div>
          <div className="fs-stat"><b>{mmss(elapsed)}</b><span>elapsed</span></div>
        </div>
        <div className="focus-actions">
          <button type="button" className="btn primary" onClick={() => { setPlan(null); setLoading(true); getOpportunityQueue().then((q) => { setItems(q.today.length ? q.today : q.items); setResumes(q.resumes); }).finally(() => setLoading(false)); }}>Start another</button>
          <button type="button" className="btn" onClick={() => navigate("/")}>Back to Fast Apply</button>
          <button type="button" className="btn" onClick={() => navigate("/applications")}>View applications</button>
        </div>
      </div>
    );
  }

  // ---- running ----
  const o = plan[idx];
  const resume = recommendResume(o, resumes);
  const remainingMin = plan.slice(idx).reduce((s, x) => s + x.estMinutes, 0);
  return (
    <div className="focus">
      <div className="page-header">
        <div><h1>Focus Session</h1><p>Role {idx + 1} of {plan.length} · ~{remainingMin} min left</p></div>
        <div className="focus-clock">{mmss(elapsed)}</div>
      </div>
      <div className="focus-bar"><i style={{ width: `${(idx / plan.length) * 100}%` }} /></div>

      <div className="card focus-card">
        <div className="fc-head">
          <CompanyLogo company={o.company} />
          <div className="fc-title"><div className="fc-co">{o.company}</div><h2>{o.title}</h2></div>
          <div className="fc-score">{o.priority}<span>score</span></div>
        </div>
        <div className="fc-meta">
          <span>{o.eligibilityLabel}</span><span>·</span>
          <span>Résumé: {resume ? resume.name : "add one"}</span><span>·</span>
          <span>{o.hasReferral ? "Referral available" : "No referral"}</span><span>·</span>
          <span>~{o.estMinutes} min</span>
        </div>

        {answers.length > 0 && (
          <details className="fc-answers">
            <summary>Saved answers ({answers.length})</summary>
            <ul>{answers.map((a) => (
              <li key={a.id}><div className="fc-ans-h"><b>{a.question}</b><button type="button" className="btn small" onClick={() => navigator.clipboard?.writeText(a.answer).catch(() => {})}>Copy</button></div></li>
            ))}</ul>
          </details>
        )}

        <div className="fc-actions">
          <button type="button" className="btn primary" onClick={() => openExternal(o.url).catch(console.error)}>Open posting</button>
          <button type="button" className="btn good" onClick={() => advance("applied", o)}>Applied — next ✓</button>
          <button type="button" className="btn" onClick={() => advance("saved", o)}>Save for later</button>
          <button type="button" className="btn ghost" onClick={() => advance("skipped")}>Skip</button>
        </div>
      </div>
      <button type="button" className="btn ghost focus-end" onClick={() => setIdx(plan.length)}>End session</button>
    </div>
  );
}
