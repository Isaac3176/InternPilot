import { useEffect, useMemo, useState } from "react";
import {
  addAnswer,
  ensureSeededAnswers,
  getAnswers,
  removeAnswer,
  updateAnswer,
  type ApplicationAnswer,
} from "../apply/answers";
import { draftAnswer } from "../ai/answerDraft";
import { hasApiKey } from "../ai/settings";
import { pushAnswersToBridge } from "../bridge";

export default function AnswerVault() {
  const [answers, setAnswers] = useState<ApplicationAnswer[]>([]);

  useEffect(() => { ensureSeededAnswers(); setAnswers(getAnswers()); }, []);
  const reload = () => { setAnswers(getAnswers()); pushAnswersToBridge().catch(() => {}); };

  const grouped = useMemo(() => {
    const g: Record<string, ApplicationAnswer[]> = {};
    for (const a of answers) (g[a.category] = g[a.category] ?? []).push(a);
    return g;
  }, [answers]);

  const approvedCount = answers.filter((a) => a.approved && a.answer.trim()).length;
  const [bulkDrafting, setBulkDrafting] = useState(false);

  async function draftAllEmpty() {
    const targets = getAnswers().filter((a) => a.question.trim() && !a.answer.trim());
    if (targets.length === 0) return;
    setBulkDrafting(true);
    for (const a of targets) {
      try { const r = await draftAnswer(a.question); updateAnswer(a.id, { answer: r.text }); }
      catch (e) { console.error("draft failed", e); }
    }
    setBulkDrafting(false);
    reload();
  }

  return (
    <div className="vault">
      <div className="page-header">
        <div>
          <h1>Answer vault</h1>
          <p>Reviewed answers to the questions you keep getting. {approvedCount} ready to reuse in the packet and autofill.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn" onClick={draftAllEmpty} disabled={bulkDrafting}>{bulkDrafting ? "Drafting…" : "✨ Draft all empty"}</button>
          <button type="button" className="btn" onClick={() => { addAnswer({ category: "Custom", question: "" }); reload(); }}>+ Add answer</button>
        </div>
      </div>

      <p className="vault-note">
        Only answers you mark <b>Approved for reuse</b> are dropped into forms — everything is reviewed by you first.
        Drafts are grounded in your résumé bullets &amp; profile{hasApiKey() ? "" : " (offline templates — add an OpenAI key in Settings for tailored drafts)"}.
      </p>

      {Object.entries(grouped).map(([category, items]) => (
        <div className="card" key={category}>
          <h2>{category}</h2>
          {items.map((a) => (
            <AnswerCard key={a.id} a={a} onChange={reload} />
          ))}
        </div>
      ))}
    </div>
  );
}

function AnswerCard({ a, onChange }: { a: ApplicationAnswer; onChange: () => void }) {
  const [question, setQuestion] = useState(a.question);
  const [answer, setAnswer] = useState(a.answer);
  const [approved, setApproved] = useState(a.approved);
  const [drafting, setDrafting] = useState(false);
  const dirty = question !== a.question || answer !== a.answer || approved !== a.approved;

  function save() {
    updateAnswer(a.id, { question, answer, approved });
    onChange();
  }

  async function draft() {
    if (!question.trim()) return;
    setDrafting(true);
    try { const r = await draftAnswer(question); setAnswer(r.text); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setDrafting(false); }
  }

  return (
    <div className="answer">
      <input
        className="answer-q"
        placeholder="Question (e.g. Why do you want to work here?)"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <textarea
        className="answer-a"
        placeholder="Your reviewed answer…"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={4}
      />
      <div className="answer-foot">
        <label className="answer-approve">
          <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
          <span>Approved for reuse</span>
        </label>
        {a.lastReviewedAt && <span className="answer-rev">Reviewed {a.lastReviewedAt.slice(0, 10)}</span>}
        <div className="answer-actions">
          <button type="button" className="btn small" onClick={draft} disabled={drafting || !question.trim()}>{drafting ? "Drafting…" : "✨ Draft"}</button>
          <button type="button" className="btn small" onClick={save} disabled={!dirty}>{dirty ? "Save" : "Saved"}</button>
          <button type="button" className="btn small ghost" onClick={() => { removeAnswer(a.id); onChange(); }}>Delete</button>
        </div>
      </div>
    </div>
  );
}
