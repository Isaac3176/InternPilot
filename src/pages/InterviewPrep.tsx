import { useEffect, useState, type ReactNode } from "react";
import {
  deleteInterview,
  listInterviews,
  savePrepPlan,
  setPrepStatus,
} from "../db/interviews";
import { getResumeVersion } from "../db/resumes";
import {
  INTERVIEW_TYPE_LABELS,
  PREP_STATUSES,
  PREP_STATUS_LABELS,
  type InterviewRow,
  type PrepStatus,
} from "../db/types";
import { generatePrepPlan, type PrepPlan } from "../ai/prep";
import { hasApiKey } from "../ai/settings";
import InterviewModal from "../components/InterviewModal";

export default function InterviewPrep() {
  const [rows, setRows] = useState<InterviewRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  function load() {
    listInterviews().then(setRows).catch(console.error);
  }
  useEffect(load, []);

  async function generate(row: InterviewRow) {
    setGeneratingId(row.id);
    try {
      const resume = row.resume_version_id ? await getResumeVersion(row.resume_version_id) : null;
      const plan = await generatePrepPlan({
        type: row.type,
        company: row.company_name ?? "",
        role: row.role_title ?? "",
        date: row.date,
        jobDescription: row.job_description,
        resumeText: resume?.content ?? null,
      });
      await savePrepPlan(row.id, JSON.stringify(plan));
      if (row.prep_status === "not_started") await setPrepStatus(row.id, "in_progress");
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingId(null);
    }
  }

  async function changeStatus(id: number, status: PrepStatus) {
    await setPrepStatus(id, status);
    load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this event?")) return;
    await deleteInterview(id);
    load();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Interview Prep</h1>
          <p>Track OA & interview events and generate company-specific prep plans.</p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)}>+ New event</button>
      </div>

      {!hasApiKey() && (
        <p className="hint">No OpenAI key set — generated plans use an offline template. Add a key in Settings for tailored plans.</p>
      )}

      {rows.length === 0 ? (
        <div className="empty">No events yet. Add an OA or interview to generate a prep plan.</div>
      ) : (
        rows.map((row) => {
          const plan = parsePlan(row.prep_plan);
          return (
            <div className="card" key={row.id}>
              <div className="row-between">
                <div>
                  <strong>{row.company_name ?? "Unknown company"}</strong>
                  <span className="muted"> · {row.role_title ?? "—"}</span>
                  <div className="mt-xs">
                    <span className="badge interview">{INTERVIEW_TYPE_LABELS[row.type]}</span>{" "}
                    <span className="muted">{row.date ? `Scheduled ${row.date}` : "No date set"}</span>
                  </div>
                </div>
                <div className="actions">
                  <select
                    aria-label="Prep status"
                    value={row.prep_status}
                    onChange={(e) => changeStatus(row.id, e.target.value as PrepStatus)}
                  >
                    {PREP_STATUSES.map((s) => (
                      <option key={s} value={s}>{PREP_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <button type="button" className="secondary small" onClick={() => generate(row)} disabled={generatingId === row.id}>
                    {generatingId === row.id ? "Generating…" : plan ? "Regenerate" : "Generate plan"}
                  </button>
                  <button type="button" className="danger small" onClick={() => remove(row.id)}>Delete</button>
                </div>
              </div>

              {plan && <PrepPlanView plan={plan} />}
            </div>
          );
        })
      )}

      {modalOpen && (
        <InterviewModal
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </>
  );
}

function parsePlan(json: string | null): PrepPlan | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as PrepPlan;
  } catch {
    return null;
  }
}

function PrepPlanView({ plan }: { plan: PrepPlan }) {
  return (
    <div className="mt-md">
      {plan.summary && <p className="strategy">{plan.summary}</p>}

      <Section title="Focus areas">
        <div className="tag-list">
          {plan.focusAreas.map((f, i) => <span className="tag hit" key={i}>{f}</span>)}
        </div>
      </Section>

      {plan.studyPlan.length > 0 && (
        <Section title="Study plan">
          {plan.studyPlan.map((s, i) => (
            <div className="plan-row" key={i}>
              <span className="funnel-label">{s.when}</span>
              <span>{s.focus}</span>
            </div>
          ))}
        </Section>
      )}

      <BulletSection title="Practice" items={plan.practice} />
      <BulletSection title="Talking points" items={plan.talkingPoints} />
      <BulletSection title="Questions to ask" items={plan.questionsToAsk} />

      <span className={`badge ${plan.source === "openai" ? "offer" : "interested"}`}>
        {plan.source === "openai" ? "OpenAI" : "Offline template"}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h3 className="result-h3">{title}</h3>
      {children}
    </>
  );
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Section title={title}>
      <ul className="prep-list">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </Section>
  );
}
