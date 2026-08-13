import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { getResumeVersionPerformance, type ResumeVersionPerf } from "../db/metrics";
import { listResumeVersions, listResumeBullets, saveResumeBullet } from "../db/resumes";
import { listExperiences, createExperience } from "../db/experiences";
import { getFeed } from "../listings/service";
import { listApplications } from "../db/applications";
import { getProfile } from "../db/profile";
import { getAnswers, ensureSeededAnswers, type ApplicationAnswer } from "../apply/answers";
import { extractExperiences, type ExtractedExp } from "../ai/resumeExtract";
import { hasApiKey } from "../ai/settings";
import { TRACK_LABEL, type ResumeTrack } from "../ranking/companies";
import { getTrackResumes, setTrackResume } from "../ranking/resumeTracks";
import type { ResumeBullet, ExperienceRow, ResumeVersion } from "../db/types";

const TRACKS: ResumeTrack[] = ["general", "infra", "ai", "fullstack"];
import "./Toolkit.css";

const TABS = [
  { key: "resumes", label: "Résumés", to: "/toolkit" },
  { key: "bullets", label: "Bullets", to: "/toolkit/bullets" },
  { key: "experiences", label: "Experiences", to: "/toolkit/experiences" },
  { key: "answers", label: "Saved answers", to: "/toolkit/answers" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// ── bullet quality heuristic ────────────────────────────────────────────────
function classifyBullet(b: ResumeBullet): { tag: string; cls: "ok" | "weak"; why: string } {
  const text = (b.improved_text || b.original_text || "").trim();
  const hasMetric = /\d/.test(text);
  const weakVerb = /\b(worked on|helped|assisted|responsible for|various|participated|involved in)\b/i.test(text);
  if (b.improved_text?.trim() && hasMetric && !weakVerb) return { tag: "Strong", cls: "ok", why: b.experience_name ? `From ${b.experience_name}` : "Quantified, active" };
  if (!hasMetric) return { tag: "No metric", cls: "weak", why: "Add a number — %, count, time saved" };
  if (weakVerb) return { tag: "Vague", cls: "weak", why: "Passive/filler phrasing — lead with an action verb" };
  return { tag: "Needs work", cls: "weak", why: "Tighten and quantify" };
}

interface Coverage { coverage: number; savedCount: number; gaps: { display: string; n: number }[] }
async function computeCoverage(): Promise<Coverage> {
  const [feed, apps, resumes, profile] = await Promise.all([getFeed(), listApplications(), listResumeVersions(), getProfile()]);
  const savedUrls = new Set(apps.filter((a) => a.status !== "rejected").map((a) => a.job_link).filter((x): x is string => !!x));
  const saved = feed.listings.filter((l) => savedUrls.has(l.url));
  const ask = new Map<string, { display: string; n: number }>();
  for (const l of saved) for (const s of l.skills ?? []) {
    const key = s.trim(); if (!key) continue;
    const lk = key.toLowerCase(); const e = ask.get(lk);
    if (e) e.n++; else ask.set(lk, { display: key, n: 1 });
  }
  const haveText = `${resumes.map((r) => r.content ?? "").join(" ")} ${profile?.skills ?? ""}`.toLowerCase();
  const asked = [...ask.values()];
  const have = asked.filter((a) => haveText.includes(a.display.toLowerCase()));
  const gaps = asked.filter((a) => !haveText.includes(a.display.toLowerCase())).sort((a, b) => b.n - a.n).slice(0, 10);
  return { coverage: asked.length ? Math.round((have.length / asked.length) * 100) : 0, savedCount: saved.length, gaps };
}

export default function Toolkit() {
  const { pathname } = useLocation();
  const tab: TabKey = pathname.endsWith("/bullets") ? "bullets" : pathname.endsWith("/experiences") ? "experiences" : pathname.endsWith("/answers") ? "answers" : "resumes";
  const [n, setN] = useState<Partial<Record<TabKey, number>>>({});

  useEffect(() => {
    listResumeVersions().then((v) => setN((p) => ({ ...p, resumes: v.length }))).catch(() => {});
    listResumeBullets().then((b) => setN((p) => ({ ...p, bullets: b.length }))).catch(() => {});
    listExperiences().then((e) => setN((p) => ({ ...p, experiences: e.length }))).catch(() => {});
    ensureSeededAnswers();
    setN((p) => ({ ...p, answers: getAnswers().length }));
  }, []);

  return (
    <div className="tk">
      <div className="tk-head">
        <h1>Toolkit</h1>
        <p>Everything you reuse across applications, and how well it's working.</p>
      </div>
      <div className="tk-subtabs">
        {TABS.map((t) => (
          <NavLink key={t.key} to={t.to} end={t.to === "/toolkit"} className={({ isActive }) => "tk-subtab" + (isActive ? " on" : "")}>
            {t.label}{n[t.key] != null ? <span className="tk-n">{n[t.key]}</span> : null}
          </NavLink>
        ))}
      </div>
      <div className="tk-body">
        {tab === "resumes" && <ResumesTab />}
        {tab === "bullets" && <BulletsTab />}
        {tab === "experiences" && <ExperiencesTab />}
        {tab === "answers" && <AnswersTab />}
      </div>
    </div>
  );
}

// ── Résumés (overview dashboard) ────────────────────────────────────────────
function ResumesTab() {
  const navigate = useNavigate();
  const [perf, setPerf] = useState<ResumeVersionPerf[] | null>(null);
  const [bullets, setBullets] = useState<ResumeBullet[]>([]);
  const [cov, setCov] = useState<Coverage | null>(null);
  const [answers, setAnswers] = useState<ApplicationAnswer[]>([]);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [trackMap, setTrackMap] = useState(getTrackResumes());

  useEffect(() => {
    getResumeVersionPerformance().then(setPerf).catch(() => setPerf([]));
    listResumeBullets().then(setBullets).catch(() => {});
    listResumeVersions().then(setVersions).catch(() => {});
    computeCoverage().then(setCov).catch(() => setCov(null));
    ensureSeededAnswers();
    setAnswers(getAnswers());
  }, []);

  const best = perf?.reduce<ResumeVersionPerf | null>((b, p) => (p.total > 0 && (!b || p.reachedOa / p.total > (b.reachedOa || 0) / (b.total || 1)) ? p : b), null);
  const weakBullets = bullets.filter((b) => classifyBullet(b).cls === "weak").slice(0, 3);
  const readyAnswers = answers.filter((a) => a.approved && a.answer.trim());

  return (
    <div className="tk-cols">
      <div>
        <div className="tk-panel">
          <div className="tk-panelhead"><h3>Version performance</h3><button type="button" className="tk-btn" onClick={() => navigate("/resumes")}>Add version</button></div>
          {perf === null ? <p className="tk-muted">Loading…</p> : perf.length === 0 ? (
            <p className="tk-muted">No résumé versions yet. <button type="button" className="tk-link" onClick={() => navigate("/resumes")}>Add one</button> to start tracking what works.</p>
          ) : (
            <table className="tk-table">
              <thead><tr><th>Version</th><th>Apps</th><th>Reply</th><th>Interview</th><th style={{ textAlign: "right" }}>Offers</th></tr></thead>
              <tbody>
                {perf.map((p, i) => {
                  const reply = p.total ? Math.round((p.reachedOa / p.total) * 100) : 0;
                  const iv = p.total ? Math.round((p.reachedInterview / p.total) * 100) : 0;
                  const c = i === 0 ? "var(--tk-good)" : i === 1 ? "var(--tk-accent)" : "var(--tk-muted-2)";
                  return (
                    <tr key={p.id}>
                      <td><span className="tk-vname"><i style={{ background: c }} />{p.name}{best && best.id === p.id && p.total > 0 ? <span className="tk-best">Best</span> : null}</span></td>
                      <td className="tk-num">{p.total}</td>
                      <td><span className="tk-rate"><span className="tk-track"><i style={{ width: `${reply}%`, background: c }} /></span><span style={p.total ? undefined : { color: "var(--tk-muted-2)" }}>{reply}%</span></span></td>
                      <td><span className="tk-rate"><span className="tk-track"><i style={{ width: `${iv}%`, background: "var(--tk-warn)" }} /></span><span style={p.total ? undefined : { color: "var(--tk-muted-2)" }}>{iv}%</span></span></td>
                      <td className="tk-num" style={{ textAlign: "right", color: p.offers ? undefined : "var(--tk-muted-2)" }}>{p.offers}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="tk-panel">
          <div className="tk-panelhead"><h3>Bullets needing work</h3><button type="button" className="tk-btn" onClick={() => navigate("/toolkit/bullets")}>Open bullets</button></div>
          {weakBullets.length === 0 ? <p className="tk-muted">{bullets.length ? "No weak bullets flagged — nice." : "No bullets yet. Add them in the Bullet Library."}</p> : weakBullets.map((b) => {
            const k = classifyBullet(b);
            return (
              <div className="tk-bullet" key={b.id}>
                <span className={`tk-tag ${k.cls}`}>{k.tag}</span>
                <span className="tk-tx">{b.improved_text || b.original_text || "(empty)"}<span>{k.why}</span></span>
                <button type="button" className="tk-go" onClick={() => navigate("/bullets")}>Rewrite</button>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="tk-panel">
          <div className="tk-panelhead"><h3>Skill coverage</h3></div>
          {cov === null ? <p className="tk-muted">Loading…</p> : cov.savedCount === 0 ? (
            <p className="tk-muted">Bookmark roles in <button type="button" className="tk-link" onClick={() => navigate("/internships")}>Jobs</button> and this shows which of their skills your toolkit already covers.</p>
          ) : (
            <>
              <div className="tk-coverage">
                <b style={{ color: cov.coverage >= 70 ? "var(--tk-good)" : "var(--tk-warn)" }}>{cov.coverage}<span>%</span></b>
                <p>of the skills your {cov.savedCount} saved role{cov.savedCount === 1 ? "" : "s"} ask for appear somewhere in your toolkit.</p>
              </div>
              <div className="tk-track wide"><i style={{ width: `${cov.coverage}%`, background: cov.coverage >= 70 ? "var(--tk-good)" : "var(--tk-warn)" }} /></div>
              {cov.gaps.length > 0 && (
                <>
                  <div className="tk-sublabel">Gaps, by how often they're asked for</div>
                  <div>{cov.gaps.map((g) => <span className="tk-gapchip" key={g.display}>{g.display} <b>{g.n}×</b></span>)}</div>
                </>
              )}
            </>
          )}
        </div>

        <div className="tk-panel">
          <div className="tk-panelhead"><h3>Résumé per track</h3></div>
          <p className="tk-muted">Pick the résumé to lead with for each track. When a target company opens, InternPilot auto-selects it at apply time.</p>
          {versions.length === 0 ? (
            <p className="tk-muted">Add a résumé version first (<button type="button" className="tk-link" onClick={() => navigate("/resumes")}>Résumé Center</button>).</p>
          ) : TRACKS.map((t) => (
            <div className="tk-trackrow" key={t}>
              <span>{TRACK_LABEL[t]}</span>
              <select value={trackMap[t] ?? ""} onChange={(e) => { setTrackResume(t, e.target.value ? Number(e.target.value) : null); setTrackMap(getTrackResumes()); }}>
                <option value="">— none —</option>
                {versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="tk-panel">
          <div className="tk-panelhead"><h3>Résumé Lab</h3></div>
          <p className="tk-muted">Score a résumé, find gaps against a JD, and rewrite — without inventing anything.</p>
          <button type="button" className="tk-btn full" style={{ marginTop: 12 }} onClick={() => navigate("/resume-lab")}>Open Résumé Lab</button>
        </div>

        <div className="tk-panel">
          <div className="tk-panelhead"><h3>Saved answers</h3><button type="button" className="tk-btn" onClick={() => navigate("/toolkit/answers")}>View all</button></div>
          <p className="tk-muted">{readyAnswers.length} of {answers.length} approved and ready to reuse in the packet and autofill.</p>
        </div>
      </div>
    </div>
  );
}

// ── Import experiences & bullets from a résumé ───────────────────────────────
function ResumeImport({ onDone }: { onDone: () => void }) {
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [result, setResult] = useState<ExtractedExp[] | null>(null);
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<"" | "extract" | "add">("");
  const [err, setErr] = useState("");

  useEffect(() => {
    listResumeVersions().then((v) => { setVersions(v); const wt = v.find((r) => r.content?.trim()); if (wt) setSelId(wt.id); }).catch(() => {});
  }, []);
  const selected = versions.find((v) => v.id === selId);
  const chosenCount = result ? result.reduce((n, e, i) => n + e.bullets.filter((_, j) => include[`${i}-${j}`]).length, 0) : 0;

  async function extract() {
    if (!selected?.content?.trim()) { setErr("Pick a résumé that has text (add it in Résumé Center)."); return; }
    setBusy("extract"); setErr("");
    try {
      const exps = await extractExperiences(selected.content);
      if (exps.length === 0) {
        setErr(hasApiKey()
          ? "Couldn't find experiences in this résumé's text."
          : "Couldn't parse this résumé offline (common with PDF text, which loses bullet formatting). Add an OpenAI key in Settings for reliable extraction.");
        setResult(null);
      }
      else { setResult(exps); setInclude(Object.fromEntries(exps.flatMap((e, i) => e.bullets.map((_, j) => [`${i}-${j}`, true])))); }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  async function add() {
    if (!result) return;
    setBusy("add"); setErr("");
    try {
      for (let i = 0; i < result.length; i++) {
        const e = result[i];
        const chosen = e.bullets.filter((_, j) => include[`${i}-${j}`]);
        if (chosen.length === 0) continue;
        const expName = `${e.company}${e.role ? " — " + e.role : ""}`.trim();
        if (e.company && e.company.toLowerCase() !== "experience") {
          await createExperience({ company_name: e.company, role: e.role || null, summary: e.summary || null }).catch(() => {});
        }
        for (const b of chosen) {
          await saveResumeBullet({ experience_name: expName || null, original_text: b, improved_text: null, tags: null, application_id: null });
        }
      }
      setResult(null);
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  return (
    <div className="tk-panel tk-import">
      <div className="tk-panelhead">
        <h3>Import from a résumé</h3>
        {!hasApiKey() && <span className="tk-muted" style={{ fontSize: 11 }}>offline heuristic — add an OpenAI key for better grouping</span>}
      </div>
      <p className="tk-muted" style={{ marginTop: "-6px" }}>Pull your experiences and their bullet points straight out of a résumé — review, then add to your library. Nothing is invented.</p>
      <div className="tk-import-row">
        <select value={selId ?? ""} onChange={(e) => { setSelId(Number(e.target.value) || null); setResult(null); setErr(""); }}>
          {versions.length === 0 && <option value="">No résumés yet</option>}
          {versions.map((v) => <option key={v.id} value={v.id}>{v.name}{v.content?.trim() ? "" : " (no text)"}</option>)}
        </select>
        <button type="button" className="tk-btn primary" disabled={busy !== "" || !selected?.content?.trim()} onClick={extract}>{busy === "extract" ? "Reading…" : "Extract"}</button>
      </div>
      {err && <p className="tk-muted" style={{ color: "var(--tk-warn)" }}>{err}</p>}
      {result && (
        <>
          <p className="tk-muted">Found {result.length} experience{result.length === 1 ? "" : "s"}. Uncheck anything you don't want.</p>
          {result.map((e, i) => (
            <div className="tk-imp-exp" key={i}>
              <div className="tk-imp-h">{e.company}{e.role ? ` · ${e.role}` : ""}</div>
              {e.bullets.map((b, j) => (
                <label key={j} className="tk-imp-b">
                  <input type="checkbox" checked={!!include[`${i}-${j}`]} onChange={() => setInclude((p) => ({ ...p, [`${i}-${j}`]: !p[`${i}-${j}`] }))} />
                  <span>{b}</span>
                </label>
              ))}
            </div>
          ))}
          <button type="button" className="tk-btn primary full" style={{ marginTop: 10 }} disabled={busy !== "" || chosenCount === 0} onClick={add}>
            {busy === "add" ? "Adding…" : `Add ${chosenCount} bullet${chosenCount === 1 ? "" : "s"} & ${result.length} experience${result.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
    </div>
  );
}

// ── Bullets ─────────────────────────────────────────────────────────────────
function BulletsTab() {
  const navigate = useNavigate();
  const [bullets, setBullets] = useState<ResumeBullet[] | null>(null);
  const reload = () => { listResumeBullets().then(setBullets).catch(() => setBullets([])); };
  useEffect(() => { reload(); }, []);
  const sorted = (bullets ?? []).slice().sort((a, b) => (classifyBullet(a).cls === "weak" ? 0 : 1) - (classifyBullet(b).cls === "weak" ? 0 : 1));

  return (
    <>
      <ResumeImport onDone={reload} />
      <div className="tk-panel" style={{ marginTop: 14 }}>
        <div className="tk-panelhead"><h3>Bullets — weakest first</h3><button type="button" className="tk-btn" onClick={() => navigate("/bullets")}>Open full library</button></div>
        {bullets === null ? <p className="tk-muted">Loading…</p> : sorted.length === 0 ? (
          <div className="tk-empty">No bullets yet. Import from a résumé above, or build a library of reusable, quantified lines.</div>
        ) : sorted.map((b) => {
          const k = classifyBullet(b);
          return (
            <div className="tk-bullet" key={b.id}>
              <span className={`tk-tag ${k.cls}`}>{k.tag}</span>
              <span className="tk-tx">{b.improved_text || b.original_text || "(empty)"}<span>{k.why}</span></span>
              {k.cls === "weak" && <button type="button" className="tk-go" onClick={() => navigate("/bullets")}>Rewrite</button>}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Experiences ─────────────────────────────────────────────────────────────
function ExperiencesTab() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ExperienceRow[] | null>(null);
  useEffect(() => { listExperiences().then(setRows).catch(() => setRows([])); }, []);
  return (
    <div className="tk-panel">
      <div className="tk-panelhead"><h3>Experiences</h3><button type="button" className="tk-btn" onClick={() => navigate("/experiences")}>Manage</button></div>
      {rows === null ? <p className="tk-muted">Loading…</p> : rows.length === 0 ? (
        <div className="tk-empty">No experiences yet. Add jobs, projects, and coursework so the AI can draft bullets and answers from real material.</div>
      ) : rows.map((e) => (
        <div className="tk-exp" key={e.id}>
          <span className="tk-dot" />
          <span className="tk-tx">
            <b>{e.role || "Untitled"}{e.company_name ? ` · ${e.company_name}` : ""}</b>
            {e.summary ? <p>{e.summary}</p> : e.topics ? <p>{e.topics}</p> : null}
          </span>
          {e.difficulty ? <span className="tk-diff">{e.difficulty}</span> : null}
        </div>
      ))}
    </div>
  );
}

// ── Saved answers ───────────────────────────────────────────────────────────
function AnswersTab() {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<ApplicationAnswer[] | null>(null);
  useEffect(() => { ensureSeededAnswers(); setAnswers(getAnswers()); }, []);
  return (
    <div className="tk-panel">
      <div className="tk-panelhead"><h3>Saved answers</h3><button type="button" className="tk-btn" onClick={() => navigate("/answers")}>Manage</button></div>
      {answers === null ? <p className="tk-muted">Loading…</p> : answers.length === 0 ? (
        <div className="tk-empty">No saved answers yet. Store reviewed answers to the questions you keep getting (“Why this company?”, work authorization).</div>
      ) : answers.map((a) => {
        const ready = a.approved && !!a.answer.trim();
        return (
          <div className="tk-bullet" key={a.id}>
            <span className={`tk-tag ${ready ? "ok" : "weak"}`}>{ready ? "Ready" : a.answer.trim() ? "Draft" : "Empty"}</span>
            <span className="tk-tx">{a.question}<span>{a.answer.trim() ? a.answer.slice(0, 120) + (a.answer.length > 120 ? "…" : "") : "No answer yet"}</span></span>
            <button type="button" className="tk-go" onClick={() => navigate("/answers")}>Edit</button>
          </div>
        );
      })}
    </div>
  );
}
