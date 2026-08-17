import { useEffect, useRef, useState } from "react";
import { createOAAttempt, type OAQuestion } from "../db/oaAttempts";
import { type Pattern } from "../prep/patterns";

/**
 * OA Simulation Mode — a timed, multi-question harness designed to correct the
 * exact failure it's named for: sinking the whole clock into one problem and never
 * seeing the rest. It shows per-question timers and nudges you to move on after 15
 * minutes without progress while questions sit unopened. You solve the problems
 * wherever you like; this enforces the discipline and logs the result into your
 * readiness (as an OA attempt).
 */

type Phase = "setup" | "run" | "done";
type QStatus = "unopened" | "seen" | "solved";
interface SimQ { pattern: Pattern; status: QStatus; sec: number }

const MOVE_ON_SEC = 15 * 60;
const DEFAULT_ROTATION: Pattern[] = ["Simulation / Implementation", "Graphs", "Dynamic Programming", "Arrays & Hashing"];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function buildQuestions(count: number, weak: Pattern[]): SimQ[] {
  const pool = weak.length ? weak : DEFAULT_ROTATION;
  return Array.from({ length: count }, (_, i) => ({ pattern: pool[i % pool.length], status: "unopened" as QStatus, sec: 0 }));
}

export default function OASimulation({ weakPatterns, onClose, onLogged }: { weakPatterns: Pattern[]; onClose: () => void; onLogged: () => void }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [durationMin, setDurationMin] = useState(75);
  const [count, setCount] = useState(4);
  const [useWeak, setUseWeak] = useState(true);
  const [questions, setQuestions] = useState<SimQ[]>([]);
  const [active, setActive] = useState(0);
  const [snooze, setSnooze] = useState<{ idx: number; until: number } | null>(null);
  const activeRef = useRef(0);
  activeRef.current = active;

  const durationSec = durationMin * 60;
  const elapsed = questions.reduce((a, q) => a + q.sec, 0);
  const remaining = durationSec - elapsed;

  // Tick the active question's clock every second while running.
  useEffect(() => {
    if (phase !== "run") return;
    const iv = window.setInterval(() => {
      setQuestions((qs) => qs.map((q, i) => (i === activeRef.current ? { ...q, sec: q.sec + 1 } : q)));
    }, 1000);
    return () => window.clearInterval(iv);
  }, [phase]);

  // Auto-finish when the clock runs out.
  useEffect(() => {
    if (phase === "run" && remaining <= 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, phase]);

  function start() {
    const qs = buildQuestions(count, useWeak ? weakPatterns : []);
    qs[0].status = "seen"; // first is opened
    setQuestions(qs);
    setActive(0);
    setPhase("run");
  }

  function goTo(idx: number) {
    setQuestions((qs) => qs.map((q, i): SimQ => {
      if (i === activeRef.current && q.status !== "solved") return { ...q, status: "seen" };
      return q;
    }).map((q, i): SimQ => (i === idx && q.status === "unopened" ? { ...q, status: "seen" } : q)));
    setActive(idx);
  }
  function solveActive() {
    setQuestions((qs) => qs.map((q, i): SimQ => (i === activeRef.current ? { ...q, status: "solved" } : q)));
    const nextUnopened = questions.findIndex((q, i) => i !== active && q.status === "unopened");
    if (nextUnopened >= 0) goTo(nextUnopened);
  }
  function moveOn() {
    const nextUnopened = questions.findIndex((q) => q.status === "unopened");
    if (nextUnopened >= 0) goTo(nextUnopened);
    else { const nxt = (active + 1) % questions.length; goTo(nxt); }
  }

  async function finish() {
    setPhase("done");
    const oaQs: OAQuestion[] = questions.map((q) => ({
      attempted: q.status !== "unopened", solved: q.status === "solved",
      timeMin: Math.round(q.sec / 60), difficulty: "medium", topic: q.pattern,
      testsPassed: null, problem: null,
      failureReason: q.status === "seen" ? (q.sec >= MOVE_ON_SEC ? "Stayed too long" : null) : null,
    }));
    const unsolved = questions.filter((q) => q.status !== "solved");
    const bigSink = Math.max(0, ...questions.filter((q) => q.status !== "solved").map((q) => q.sec));
    const lesson = bigSink / durationSec >= 0.4 ? "Time management — one problem ate too much of the clock"
      : unsolved.some((q) => q.status === "unopened") ? "Triage — questions went unopened"
      : "Solid pacing";
    try {
      await createOAAttempt({
        company: "OA Simulation", role_title: `${count}Q · ${durationMin} min`,
        taken_on: new Date().toISOString().slice(0, 10), duration_min: durationMin,
        questions: oaQs, primary_lesson: lesson,
        next_rule: "Move on after 15 min without meaningful progress",
        topics_review: [...new Set(questions.filter((q) => q.status !== "solved").map((q) => q.pattern))],
      });
      onLogged();
    } catch (e) { console.error(e); }
  }

  const anyUnopened = questions.some((q) => q.status === "unopened");
  const snoozed = !!snooze && snooze.idx === active && (questions[active]?.sec ?? 0) < snooze.until;
  const nudge = phase === "run" && (questions[active]?.sec ?? 0) >= MOVE_ON_SEC && anyUnopened && !snoozed;
  const unopenedList = questions.map((q, i) => (q.status === "unopened" ? i + 1 : null)).filter((x): x is number => x != null);

  return (
    <div className="sim-scrim" onClick={(e) => { if (e.target === e.currentTarget && phase !== "run") onClose(); }}>
      <div className="sim" role="dialog" aria-modal="true">
        {phase === "setup" && (
          <>
            <h2>OA Simulation</h2>
            <p className="sim-lede">A timed run that trains you to see every question and move on when stuck — the thing that costs the most points on real OAs.</p>
            <span className="eyebrow sim-lbl">Duration</span>
            <div className="prep-seg">{[60, 75, 90].map((d) => <button key={d} type="button" className={durationMin === d ? "on" : ""} onClick={() => setDurationMin(d)}>{d}m</button>)}</div>
            <span className="eyebrow sim-lbl">Questions</span>
            <div className="prep-seg">{[3, 4].map((n) => <button key={n} type="button" className={count === n ? "on" : ""} onClick={() => setCount(n)}>{n}</button>)}</div>
            <span className="eyebrow sim-lbl">Target</span>
            <div className="prep-seg">
              <button type="button" className={useWeak ? "on" : ""} onClick={() => setUseWeak(true)}>Weakest patterns</button>
              <button type="button" className={!useWeak ? "on" : ""} onClick={() => setUseWeak(false)}>General</button>
            </div>
            {useWeak && weakPatterns.length > 0 && (
              <p className="sim-hint">Will pull from: {weakPatterns.slice(0, count).join(", ")}</p>
            )}
            <div className="sim-acts">
              <button type="button" className="secondary" onClick={onClose}>Cancel</button>
              <button type="button" onClick={start}>Start · {durationMin} min</button>
            </div>
          </>
        )}

        {phase === "run" && (
          <>
            <div className="sim-clock">
              <span className={`sim-remaining ${remaining < 300 ? "low" : ""}`}>{fmt(Math.max(0, remaining))}</span>
              <span className="sim-remaining-lbl">remaining</span>
            </div>
            {nudge && (
              <div className="sim-nudge">
                ⚠ {Math.floor(questions[active].sec / 60)} min on Q{active + 1}, and Q{unopenedList.join(", Q")} still unopened. Move on — a seen-but-unsolved question beats an unseen one.
                <div className="sim-nudge-acts"><button type="button" className="sim-mv" onClick={moveOn}>Move on</button><button type="button" className="sim-keep" onClick={() => setSnooze({ idx: active, until: (questions[active]?.sec ?? 0) + 300 })}>Keep going (+5 min)</button></div>
              </div>
            )}
            <div className="sim-qs">
              {questions.map((q, i) => (
                <button type="button" key={i} className={`sim-q ${q.status} ${i === active ? "active" : ""}`} onClick={() => goTo(i)}>
                  <span className="sim-q-n">Q{i + 1}</span>
                  <span className="sim-q-pat">{q.pattern}</span>
                  <span className="sim-q-time mono">{i === active || q.sec > 0 ? fmt(q.sec) : "—"}</span>
                  <span className="sim-q-status">{q.status === "solved" ? "✓ solved" : i === active ? "active" : q.status === "seen" ? "seen" : "unopened"}</span>
                </button>
              ))}
            </div>
            <div className="sim-acts">
              <button type="button" className="secondary" onClick={finish}>End &amp; log</button>
              <button type="button" className="sim-next" onClick={moveOn}>Next question →</button>
              <button type="button" onClick={solveActive}>Mark Q{active + 1} solved</button>
            </div>
          </>
        )}

        {phase === "done" && (
          <>
            <h2>Simulation logged</h2>
            <p className="sim-lede">Result fed into your readiness and saved as an OA attempt.</p>
            <div className="sim-summary">
              {questions.map((q, i) => (
                <div className={`sim-sum-row ${q.status}`} key={i}>
                  <b>Q{i + 1}</b><span>{q.pattern}</span>
                  <span className="mono">{fmt(q.sec)}</span>
                  <span className="sim-q-status">{q.status === "solved" ? "✓ solved" : q.status === "seen" ? "unsolved" : "not seen"}</span>
                </div>
              ))}
            </div>
            <div className="sim-acts"><button type="button" onClick={onClose}>Done</button></div>
          </>
        )}
      </div>
    </div>
  );
}
