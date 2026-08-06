import { useEffect, useState } from "react";
import { deleteResumeBullet, listResumeBullets, updateResumeBulletText } from "../db/resumes";
import type { ResumeBullet } from "../db/types";
import { coachQuestion, quantifyBullet, hasMetric } from "../ai/bulletCoach";
import { hasApiKey } from "../ai/settings";

export default function Bullets() {
  const [bullets, setBullets] = useState<ResumeBullet[]>([]);

  function load() {
    listResumeBullets().then(setBullets).catch(console.error);
  }
  useEffect(load, []);

  async function remove(id: number) {
    if (!confirm("Delete this saved bullet?")) return;
    await deleteResumeBullet(id);
    load();
  }

  const unquantified = bullets.filter((b) => !hasMetric(b.improved_text)).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Bullet Library</h1>
          <p>Improved résumé bullets you've saved. {unquantified > 0 ? `${unquantified} still have no number — quantify them below.` : "Every bullet has a metric. 💪"}</p>
        </div>
      </div>

      {bullets.length === 0 ? (
        <div className="empty">
          No saved bullets yet. Run an AI match in <strong>Resume Center</strong> and click
          "Save to library" on a suggestion.
        </div>
      ) : (
        bullets.map((b) => <BulletRow key={b.id} b={b} onChange={load} onDelete={() => remove(b.id)} />)
      )}
    </>
  );
}

function BulletRow({ b, onChange, onDelete }: { b: ResumeBullet; onChange: () => void; onDelete: () => void }) {
  const [improved, setImproved] = useState(b.improved_text ?? "");
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [metric, setMetric] = useState("");
  const [loading, setLoading] = useState<"" | "ask" | "apply">("");
  const quantified = hasMetric(improved);

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  }
  async function ask() {
    setOpen(true); setLoading("ask");
    try { setQuestion(await coachQuestion(improved || b.original_text || "")); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(""); }
  }
  async function apply() {
    setLoading("apply");
    try {
      const r = await quantifyBullet(improved || b.original_text || "", metric);
      setImproved(r.text);
      await updateResumeBulletText(b.id, r.text);
      setOpen(false); setMetric(""); setQuestion("");
      onChange();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(""); }
  }

  return (
    <div className="card">
      <div className="row-between">
        <span className="label text-dim">{b.created_at?.slice(0, 10)}</span>
        {quantified ? <span className="badge offer">Has metric</span> : <span className="badge oa">No number</span>}
      </div>
      {b.original_text && <div className="muted text-sm mt-xs">Before: {b.original_text}</div>}
      <div className="mt-xs">After: {improved}</div>

      {open && (
        <div className="quantify">
          <p className="quantify-q">{loading === "ask" ? "Thinking of a question…" : question}</p>
          <div className="quantify-in">
            <input value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="Your number / result (e.g. 30% faster, 1,200 users)" onKeyDown={(e) => e.key === "Enter" && metric.trim() && apply()} />
            <button type="button" onClick={apply} disabled={loading !== "" || !metric.trim()}>{loading === "apply" ? "Rewriting…" : "Rewrite"}</button>
          </div>
        </div>
      )}

      <div className="actions mt-sm">
        {!quantified && <button type="button" className="small" onClick={ask} disabled={loading !== ""}>✨ Quantify</button>}
        <button type="button" className="secondary small" onClick={() => copy(improved)}>Copy</button>
        <button type="button" className="danger small" onClick={onDelete}>Delete</button>
      </div>
      {!hasApiKey() && open && <p className="hint mt-xs">Offline mode weaves your number in simply — edit the After text in Resume Center to refine. Add an OpenAI key for a clean rewrite.</p>}
    </div>
  );
}
