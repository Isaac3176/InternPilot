import { useEffect, useMemo, useState } from "react";
import { createExperience, deleteExperience, listExperiences } from "../db/experiences";
import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty, type ExperienceRow } from "../db/types";
import { summarizeExperiences, type ExperienceSummary } from "../ai/research";
import { hasApiKey } from "../ai/settings";

const emptyForm = {
  company_name: "",
  role: "",
  source: "",
  difficulty: "" as Difficulty | "",
  topics: "",
  summary: "",
};

export default function Experiences() {
  const [rows, setRows] = useState<ExperienceRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [summaries, setSummaries] = useState<Record<string, ExperienceSummary>>({});
  const [summarizing, setSummarizing] = useState<string | null>(null);

  function load() {
    listExperiences().then(setRows).catch(console.error);
  }
  useEffect(load, []);

  const groups = useMemo(() => {
    const map = new Map<string, ExperienceRow[]>();
    for (const r of rows) {
      const key = r.company_name ?? "Unknown company";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  async function add() {
    if (!form.company_name.trim()) return;
    await createExperience({
      company_name: form.company_name,
      role: form.role || null,
      source: form.source || null,
      difficulty: form.difficulty || null,
      topics: form.topics || null,
      summary: form.summary || null,
    });
    setForm(emptyForm);
    load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this experience?")) return;
    await deleteExperience(id);
    load();
  }

  async function summarize(company: string, experiences: ExperienceRow[]) {
    setSummarizing(company);
    try {
      const summary = await summarizeExperiences(company, experiences);
      setSummaries((s) => ({ ...s, [company]: summary }));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSummarizing(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Interview Experiences</h1>
          <p>Collect company interview reports and synthesize them into prep guidance.</p>
        </div>
      </div>

      <div className="card">
        <h2>Add an experience</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="ex-company">Company *</label>
            <input id="ex-company" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Roblox" />
          </div>
          <div className="field">
            <label htmlFor="ex-role">Role</label>
            <input id="ex-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="SWE Intern" />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="ex-source">Source</label>
            <input id="ex-source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="LeetCode discuss / friend / Glassdoor" />
          </div>
          <div className="field">
            <label htmlFor="ex-diff">Difficulty</label>
            <select id="ex-diff" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as Difficulty | "" })}>
              <option value="">—</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ex-topics">Topics (comma-separated)</label>
          <input id="ex-topics" value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} placeholder="graphs, DP, OOP design" />
        </div>
        <div className="field">
          <label htmlFor="ex-summary">Notes</label>
          <textarea id="ex-summary" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Format, rounds, what was asked, timeline..." />
        </div>
        <button type="button" onClick={add} disabled={!form.company_name.trim()}>Save experience</button>
      </div>

      {!hasApiKey() && rows.length > 0 && (
        <p className="hint">No OpenAI key set — summaries use offline aggregation. Add a key in Settings for richer synthesis.</p>
      )}

      {groups.length === 0 ? (
        <div className="empty">No experiences yet. Add one above to start building research.</div>
      ) : (
        groups.map(([company, experiences]) => (
          <div className="card" key={company}>
            <div className="row-between">
              <h2 className="mb-0">{company} <span className="muted">· {experiences.length}</span></h2>
              <button type="button" className="secondary small" onClick={() => summarize(company, experiences)} disabled={summarizing === company}>
                {summarizing === company ? "Summarizing…" : "Summarize"}
              </button>
            </div>

            {summaries[company] && <SummaryView summary={summaries[company]} />}

            <div className="mt-md">
              {experiences.map((e) => (
                <div className="card card-inset" key={e.id}>
                  <div className="row-between">
                    <span>
                      <strong>{e.role ?? "—"}</strong>
                      {e.difficulty && <span className={`badge ${difficultyBadge(e.difficulty)} ml-xs`}>{DIFFICULTY_LABELS[e.difficulty]}</span>}
                    </span>
                    <button type="button" className="danger small" onClick={() => remove(e.id)}>Delete</button>
                  </div>
                  {e.source && <div className="muted text-sm mt-xs">Source: {e.source}</div>}
                  {e.topics && (
                    <div className="tag-list">
                      {e.topics.split(",").map((t, i) => t.trim() && <span className="tag" key={i}>{t.trim()}</span>)}
                    </div>
                  )}
                  {e.summary && <p className="mt-xs">{e.summary}</p>}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function difficultyBadge(d: Difficulty): string {
  return d === "hard" ? "rejected" : d === "medium" ? "oa" : "offer";
}

function SummaryView({ summary }: { summary: ExperienceSummary }) {
  return (
    <div className="mt-md">
      {summary.overview && <p className="strategy">{summary.overview}</p>}
      {summary.commonTopics.length > 0 && (
        <>
          <h3 className="result-h3">Common topics</h3>
          <div className="tag-list">
            {summary.commonTopics.map((t, i) => <span className="tag hit" key={i}>{t}</span>)}
          </div>
        </>
      )}
      {summary.format && (<><h3 className="result-h3">Format</h3><p>{summary.format}</p></>)}
      {summary.behavioralThemes.length > 0 && (
        <>
          <h3 className="result-h3">Behavioral themes</h3>
          <ul className="prep-list">{summary.behavioralThemes.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </>
      )}
      {summary.difficulty && (<><h3 className="result-h3">Difficulty</h3><p>{summary.difficulty}</p></>)}
      {summary.tips.length > 0 && (
        <>
          <h3 className="result-h3">Tips</h3>
          <ul className="prep-list">{summary.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </>
      )}
      <span className={`badge ${summary.source === "openai" ? "offer" : "interested"}`}>
        {summary.source === "openai" ? "OpenAI" : "Offline aggregation"}
      </span>
    </div>
  );
}
