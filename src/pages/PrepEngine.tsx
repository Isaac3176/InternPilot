import { useEffect, useMemo, useState } from "react";
import { createCodingProblem, deleteCodingProblem, listCodingProblems, updateCodingReview, type CodingProblem } from "../db/codingProblems";
import { listOAAttempts, type OAAttempt } from "../db/oaAttempts";
import { listInterviews } from "../db/interviews";
import type { InterviewRow } from "../db/types";
import { buildOverview, scheduleReview, type PatternReadiness, type TodayItem } from "../prep/engine";
import { buildOAPlan, type OAPlan } from "../prep/plan";
import { DIFFICULTIES, FAILURE_REASONS, PATTERNS, RESULTS, SOLUTION_QUALITIES, topicToPattern, type Difficulty, type FailureReason, type Pattern, type ProblemResult, type SolutionQuality } from "../prep/patterns";
import OASimulation from "../components/OASimulation";

type Tab = "today" | "progress" | "history";

export default function PrepEngine() {
  const [problems, setProblems] = useState<CodingProblem[]>([]);
  const [oas, setOas] = useState<OAAttempt[]>([]);
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [tab, setTab] = useState<Tab>("today");
  const [logging, setLogging] = useState(false);
  const [simming, setSimming] = useState(false);

  const reload = () => { listCodingProblems().then(setProblems).catch(console.error); };
  const reloadOas = () => { listOAAttempts().then(setOas).catch(() => {}); };
  useEffect(() => { reload(); reloadOas(); listInterviews().then(setInterviews).catch(() => {}); }, []);

  const ov = useMemo(() => buildOverview(problems, oas), [problems, oas]);
  const plan = useMemo<OAPlan | null>(() => {
    const now = Date.now();
    const upcoming = interviews
      .filter((i) => i.type === "oa" && i.date && Date.parse(i.date) >= now - 86_400_000)
      .sort((a, b) => Date.parse(a.date!) - Date.parse(b.date!))[0];
    if (!upcoming) return null;
    // Patterns you've actually failed on THIS company's own logged OAs.
    const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = norm(upcoming.company_name);
    const companyWeak: Pattern[] = [];
    if (key) {
      const seen = new Set<Pattern>();
      // Exact match, or a prefix relationship only when both names are long enough
      // (so 'HP' never matches 'HPE', 'meta' never matches 'metamask').
      const sameCompany = (ck: string) => ck === key ||
        (Math.min(ck.length, key.length) >= 5 && (ck.startsWith(key) || key.startsWith(ck)));
      for (const a of oas) {
        const ck = norm(a.company);
        if (!ck || !sameCompany(ck)) continue;
        for (const q of a.questions) {
          if (!q.attempted || q.solved) continue;
          const p = topicToPattern(q.topic);
          if (p && !seen.has(p)) { seen.add(p); companyWeak.push(p); }
        }
      }
    }
    return buildOAPlan(upcoming.company_name ?? "This company", upcoming.role_title ?? null, upcoming.date!, ov, companyWeak);
  }, [interviews, ov, oas]);

  async function reSolve(problemId: number, result: ProblemResult) {
    const p = problems.find((x) => x.id === problemId);
    if (!p) return;
    const conf = result === "solved" ? 4 : 2;
    const s = scheduleReview(result, conf, p.review_stage);
    await updateCodingReview(p.id, { result, confidence: conf, next_review_at: s.nextReviewAt, review_stage: s.stage, solved_at: new Date().toISOString() });
    reload();
  }

  return (
    <div className="prep">
      <div className="page-header">
        <div><h1>Prep</h1><p>What to practice today, based on where you're actually failing.</p></div>
        <div className="header-actions">
          <button type="button" className="btn" onClick={() => setSimming(true)}>Start OA simulation</button>
          <button type="button" onClick={() => setLogging(true)}>+ Log a problem</button>
        </div>
      </div>

      <div className="prep-tabs">
        {(["today", "progress", "history"] as Tab[]).map((t) => (
          <button key={t} type="button" className={`prep-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === "today" && <TodayTab ov={ov} plan={plan} onReSolve={reSolve} onStartSim={() => setSimming(true)} empty={ov.totalAttempts === 0} />}
      {tab === "progress" && <ProgressTab patterns={ov.patterns} />}
      {tab === "history" && <HistoryTab problems={problems} oas={oas} onDelete={async (id) => { await deleteCodingProblem(id); reload(); }} />}

      {logging && <LogForm onClose={() => setLogging(false)} onSaved={() => { setLogging(false); reload(); }} />}
      {simming && (
        <OASimulation
          weakPatterns={ov.needsWork.map((p) => p.pattern)}
          onClose={() => setSimming(false)}
          onLogged={reloadOas}
        />
      )}
    </div>
  );
}

function ReadinessRing({ value }: { value: number }) {
  const r = 34, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  const color = value >= 75 ? "var(--beacon, #157f5f)" : value >= 50 ? "var(--accent)" : "var(--warn)";
  return (
    <svg className="prep-ring" width="88" height="88" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 44 44)" />
      <text x="44" y="49" textAnchor="middle" className="prep-ring-txt">{value}%</text>
    </svg>
  );
}

function TodayTab({ ov, plan, onReSolve, onStartSim, empty }: { ov: ReturnType<typeof buildOverview>; plan: OAPlan | null; onReSolve: (id: number, r: ProblemResult) => void; onStartSim: () => void; empty: boolean }) {
  const news = ov.today.filter((t) => t.kind === "new");
  const reviews = ov.today.filter((t) => t.kind === "review");
  const quick = ov.today.filter((t) => t.kind === "quick");
  return (
    <>
      {plan && <OAPlanCard plan={plan} onStartSim={onStartSim} />}
      <section className="prep-hero">
        <div className="prep-hero-l">
          <ReadinessRing value={ov.overall} />
          <div>
            <span className="eyebrow">Interview readiness</span>
            <p className="prep-hero-sub">{empty ? "Log a few problems or an OA to calibrate." : `${ov.today.length} items · ~${ov.todayMinutes} min today`}</p>
          </div>
        </div>
        {ov.needsWork.length > 0 && (
          <div className="prep-hero-weak">
            <span className="eyebrow">Needs work</span>
            {ov.needsWork.slice(0, 3).map((p) => <ReadinessRow key={p.pattern} p={p} />)}
          </div>
        )}
      </section>

      {empty ? (
        <div className="empty"><b>No data yet</b><p>Log a problem (or an OA in OA Lab) and your Today plan appears — targeted at your weakest patterns, not random problems.</p></div>
      ) : (
        <section className="prep-card">
          <h2>Today</h2>
          {news.length > 0 && <TodayGroup title="New" items={news} />}
          {reviews.length > 0 && <TodayGroup title="Review (spaced repetition)" items={reviews} onReSolve={onReSolve} problems />}
          {quick.length > 0 && <TodayGroup title="Quick review" items={quick} onReSolve={onReSolve} problems />}
        </section>
      )}
    </>
  );
}

function OAPlanCard({ plan, onStartSim }: { plan: OAPlan; onStartSim: () => void }) {
  return (
    <section className="prep-plan">
      <div className="prep-plan-head">
        <div>
          <span className="eyebrow">OA countdown</span>
          <h2>{plan.company} OA <span className="prep-plan-days">{plan.daysUntil === 0 ? "today" : `${plan.daysUntil} day${plan.daysUntil === 1 ? "" : "s"} away`}</span></h2>
          {plan.role && <p className="prep-plan-role">{plan.role} · {plan.dueLabel}</p>}
        </div>
        <div className="prep-plan-readiness"><b>{plan.readiness}%</b><span>readiness</span></div>
      </div>

      {plan.seenHere.length > 0 && (
        <div className="prep-plan-weak">
          <span className="eyebrow">Seen at {plan.company}</span>
          {plan.seenHere.map((p) => <span key={p} className="prep-plan-chip seen">{p}</span>)}
        </div>
      )}

      {plan.relevantWeak.length > 0 && (
        <div className="prep-plan-weak">
          <span className="eyebrow">Focus these</span>
          {plan.relevantWeak.map((p) => <span key={p.pattern} className="prep-plan-chip">{p.pattern} {p.readiness}%</span>)}
        </div>
      )}

      <div className="prep-plan-days-list">
        {plan.days.map((d, i) => (
          <div className={`prep-plan-day ${i === 0 ? "now" : ""} ${i === plan.days.length - 1 ? "oa" : ""}`} key={i}>
            <span className="prep-plan-daylbl">{d.label}</span>
            <div className="prep-plan-tasks">
              {d.tasks.map((t, j) => <span key={j} className="prep-plan-task">{t}</span>)}
              {d.sim && <button type="button" className="prep-mini ok" onClick={onStartSim}>Start simulation</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TodayGroup({ title, items, onReSolve, problems }: { title: string; items: TodayItem[]; onReSolve?: (id: number, r: ProblemResult) => void; problems?: boolean }) {
  return (
    <div className="prep-today-group">
      <span className="eyebrow">{title}</span>
      {items.map((t, i) => (
        <div className="prep-today-item" key={i}>
          <span className="prep-ti-dot" data-kind={t.kind} />
          <div className="prep-ti-tx"><b>{t.label}</b><span>{t.detail}</span></div>
          <span className="prep-ti-min mono">{t.minutes}m</span>
          {problems && onReSolve && t.problemId != null && (
            <span className="prep-ti-acts">
              <button type="button" className="prep-mini ok" onClick={() => onReSolve(t.problemId!, "solved")}>Solved</button>
              <button type="button" className="prep-mini bad" onClick={() => onReSolve(t.problemId!, "failed")}>Failed</button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function ReadinessRow({ p }: { p: PatternReadiness }) {
  const color = p.readiness >= 75 ? "var(--beacon, #157f5f)" : p.readiness >= 50 ? "var(--accent)" : "var(--warn)";
  return (
    <div className="prep-rr">
      <span className="prep-rr-name">{p.pattern}</span>
      <div className="prep-rr-track"><span className="prep-rr-fill" style={{ width: `${p.readiness}%`, background: color }} /></div>
      <span className="prep-rr-pct mono">{p.readiness}%</span>
    </div>
  );
}

function ProgressTab({ patterns }: { patterns: PatternReadiness[] }) {
  const ordered = [...patterns].sort((a, b) => (a.practiced === b.practiced ? b.readiness - a.readiness : a.practiced ? -1 : 1));
  return (
    <section className="prep-card">
      <h2>Pattern readiness</h2>
      <p className="diag-sub">Scored from independent solves, timed performance, retention, difficulty, and recency — OA questions included.</p>
      <div className="prep-prog">
        {ordered.map((p) => (
          <div className={`prep-prog-row ${p.practiced ? "" : "unp"}`} key={p.pattern}>
            <div className="prep-prog-head">
              <span className="prep-prog-name">{p.pattern}</span>
              <span className="prep-prog-pct mono">{p.practiced ? `${p.readiness}%` : "—"}</span>
            </div>
            <div className="prep-rr-track"><span className="prep-rr-fill" style={{ width: `${p.readiness}%`, background: p.readiness >= 75 ? "var(--beacon, #157f5f)" : p.readiness >= 50 ? "var(--accent)" : "var(--warn)" }} /></div>
            <div className="prep-prog-meta">
              {p.practiced ? (
                <>
                  <span>{p.attempted} attempted · {p.independentSolves} solo · {p.failed} failed</span>
                  {p.avgMediumTime != null && <span>avg med {p.avgMediumTime}m</span>}
                  {p.lastPracticedDays != null && <span>{p.lastPracticedDays === 0 ? "today" : `${p.lastPracticedDays}d ago`}</span>}
                  {p.primaryIssue && <span className="prep-issue">issue: {p.primaryIssue}</span>}
                </>
              ) : <span>Not practiced yet</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryTab({ problems, oas, onDelete }: { problems: CodingProblem[]; oas: OAAttempt[]; onDelete: (id: number) => void }) {
  return (
    <section className="prep-card">
      <h2>History</h2>
      {oas.length > 0 && (
        <p className="diag-sub">{oas.length} OA attempt(s) also feed your readiness — manage them in OA Lab.</p>
      )}
      {problems.length === 0 ? (
        <p className="diag-empty">No problems logged yet.</p>
      ) : (
        <table className="prep-hist">
          <thead><tr><th>Problem</th><th>Patterns</th><th>Diff</th><th>Result</th><th>Time</th><th></th></tr></thead>
          <tbody>
            {problems.map((p) => (
              <tr key={p.id}>
                <td>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.name}</a> : p.name}</td>
                <td className="prep-hist-pat">{p.patterns.join(", ")}</td>
                <td>{p.difficulty ?? "—"}</td>
                <td><span className={`prep-res ${p.result}`}>{p.result ?? "—"}</span></td>
                <td className="mono">{p.time_minutes != null ? `${p.time_minutes}m` : "—"}</td>
                <td><button type="button" className="prep-del" onClick={() => onDelete(p.id)} aria-label="Delete">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function LogForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [result, setResult] = useState<ProblemResult>("solved");
  const [time, setTime] = useState("");
  const [hints, setHints] = useState("0");
  const [quality, setQuality] = useState<SolutionQuality>("working");
  const [confidence, setConfidence] = useState(3);
  const [reasons, setReasons] = useState<FailureReason[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function save() {
    if (!name.trim()) { alert("Add a problem name."); return; }
    if (patterns.length === 0) { alert("Tag at least one pattern."); return; }
    setBusy(true);
    try {
      const sched = scheduleReview(result, confidence, null);
      await createCodingProblem({
        name, url, difficulty, patterns, result,
        time_minutes: time ? Number(time) : null, hints_used: hints ? Number(hints) : 0,
        solution_quality: quality, confidence, failure_reasons: result === "solved" ? [] : reasons,
        source: "manual", solved_at: new Date().toISOString(), next_review_at: sched.nextReviewAt, review_stage: sched.stage,
      });
      onSaved();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="prep-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="prep-log" role="dialog" aria-modal="true">
        <h2>Log a problem</h2>
        <div className="prep-log-grid">
          <label className="oa-wide">Problem<input value={name} onChange={(e) => setName(e.target.value)} placeholder="207. Course Schedule" /></label>
          <label className="oa-wide">URL (optional)<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://leetcode.com/..." /></label>
        </div>

        <span className="eyebrow prep-log-lbl">Patterns</span>
        <div className="prep-chips">
          {PATTERNS.map((p) => <button key={p} type="button" className={`prep-chip ${patterns.includes(p) ? "on" : ""}`} onClick={() => toggle(patterns, p, setPatterns)}>{p}</button>)}
        </div>

        <div className="prep-log-row">
          <div><span className="eyebrow prep-log-lbl">Difficulty</span>
            <div className="prep-seg">{DIFFICULTIES.map((d) => <button key={d} type="button" className={difficulty === d ? "on" : ""} onClick={() => setDifficulty(d)}>{d}</button>)}</div>
          </div>
          <div><span className="eyebrow prep-log-lbl">Result</span>
            <div className="prep-seg">{RESULTS.map((r) => <button key={r} type="button" className={result === r ? "on" : ""} onClick={() => setResult(r)}>{r}</button>)}</div>
          </div>
        </div>

        <div className="prep-log-row">
          <label>Time (min)<input type="number" value={time} onChange={(e) => setTime(e.target.value)} placeholder="30" /></label>
          <label>Hints used<input type="number" value={hints} onChange={(e) => setHints(e.target.value)} /></label>
          <div><span className="eyebrow prep-log-lbl">Solution</span>
            <div className="prep-seg">{SOLUTION_QUALITIES.map((q) => <button key={q} type="button" className={quality === q ? "on" : ""} onClick={() => setQuality(q)}>{q}</button>)}</div>
          </div>
        </div>

        <span className="eyebrow prep-log-lbl">Confidence</span>
        <div className="prep-conf">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={confidence >= n ? "on" : ""} onClick={() => setConfidence(n)}>{n}</button>)}</div>

        {result !== "solved" && (
          <>
            <span className="eyebrow prep-log-lbl">Why did you struggle?</span>
            <div className="prep-chips">
              {FAILURE_REASONS.map((r) => <button key={r} type="button" className={`prep-chip ${reasons.includes(r) ? "on risk" : ""}`} onClick={() => toggle(reasons, r, setReasons)}>{r}</button>)}
            </div>
          </>
        )}

        <div className="prep-log-acts">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
