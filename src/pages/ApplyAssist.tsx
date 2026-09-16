import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { openExternal } from "../lib/open";
import { GHOST_DAYS, listApplications, setApplicationStatus } from "../db/applications";
import { listResumeVersions } from "../db/resumes";
import { getProfile } from "../db/profile";
import { listContacts } from "../db/contacts";
import { listAllEmployment } from "../db/contactHistory";
import { matchCompany, trackFor, TRACK_LABEL, PRIORITY_LABEL } from "../ranking/companies";
import { assessEligibility, type EligibilityLevel } from "../listings/eligibility";
import type { ApplicationRow, ContactRow, Profile, ResumeVersion } from "../db/types";
import type { ContactEmployment } from "../db/contactHistory";
import { generateApplyAssist, recommendResume, type ApplyAssist as Assist } from "../ai/apply";
import { hasApiKey } from "../ai/settings";
import CompanyLogo from "../components/CompanyLogo";
import MilestoneCelebration, { type Intel } from "../components/MilestoneCelebration";

const ELIG_ROW: Record<EligibilityLevel, { label: string; ok: boolean }> = {
  eligible: { label: "Likely eligible", ok: true },
  review: { label: "Review needed", ok: false },
  ineligible: { label: "Likely ineligible", ok: false },
  unknown: { label: "Not checked yet", ok: false },
};

const IC_CHECK = <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
const IC_DASH = <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"><path d="M5 12h14" /></svg>;
const IC_APPLIED = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
const IC_TICK_BIG = <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
const IC_EXT = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>;
const IC_WAND = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20 15 9" /><path d="M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" /><path d="M19.5 13.5l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6z" /></svg>;
const IC_BACK = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 4 12l7 7" /><path d="M4 12h16" /></svg>;

const BURST_COLORS = ["#4BC59A", "#5B9BF6", "#E0A94A", "#A98CF7", "#EB7A64"];
interface Particle { dx: number; dy: number; rot: number; color: string; delay: number }

function AppliedButton({ state, onClick, disabled }: { state: "idle" | "done"; onClick: () => void; disabled?: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  useEffect(() => {
    if (state !== "done") return;
    setParticles(Array.from({ length: 22 }, (_, i) => {
      const angle = (-160 + Math.random() * 140) * (Math.PI / 180);
      const dist = 60 + Math.random() * 90;
      return {
        dx: Math.round(Math.cos(angle) * dist), dy: Math.round(Math.sin(angle) * dist),
        rot: Math.round(Math.random() * 720 - 360), color: BURST_COLORS[i % BURST_COLORS.length],
        delay: Math.random() * 0.1,
      };
    }));
  }, [state]);

  return (
    <button type="button" className={"rs-applied" + (state === "done" ? " done" : "")} onClick={onClick} disabled={disabled || state === "done"}>
      <span className="ripple" />
      <span className={"burst" + (state === "done" ? " go" : "")}>
        {particles.map((p, i) => (
          <i key={i} style={{ background: p.color, ["--dx" as string]: `${p.dx}px`, ["--dy" as string]: `${p.dy}px`, ["--rot" as string]: `${p.rot}deg`, animationDelay: `${p.delay.toFixed(2)}s` }} />
        ))}
      </span>
      <span className="lbl">{IC_APPLIED} I applied</span>
      <span className="tickwrap">{IC_TICK_BIG}</span>
    </button>
  );
}

export default function ApplyAssist() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [employment, setEmployment] = useState<ContactEmployment[]>([]);
  const [appId, setAppId] = useState<number | "">("");
  const [resumeId, setResumeId] = useState<number | "">("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [mode, setMode] = useState<"overview" | "assist">("overview");

  const [assist, setAssist] = useState<Assist | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [appliedState, setAppliedState] = useState<"idle" | "done">("idle");
  const [celebrate, setCelebrate] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    listApplications().then(setApps).catch(console.error);
    listResumeVersions().then(setVersions).catch(console.error);
    getProfile().then(setProfile).catch(console.error);
    listContacts().then(setContacts).catch(console.error);
    listAllEmployment().then(setEmployment).catch(console.error);
  }, []);

  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);

  // Preselect an application when arriving from the Internships feed (?app=<id>) —
  // only if it's still unapplied; an already-applied one has nothing to show here.
  const [skippedPreselect, setSkippedPreselect] = useState(false);
  useEffect(() => {
    const appParam = searchParams.get("app");
    if (!appParam) return;
    const match = apps.find((a) => a.id === Number(appParam));
    if (!match) return;
    if (match.status === "interested") setAppId(match.id);
    else setSkippedPreselect(true);
  }, [apps, searchParams]);

  // Already-applied roles have nothing left to prepare — don't offer them here.
  const selectableApps = useMemo(() => apps.filter((a) => a.status === "interested"), [apps]);
  const app = apps.find((a) => a.id === appId);

  // Switching applications resets the commit UI so a leftover "done" state
  // from a previous application doesn't bleed into a new one, and drops back
  // to the overview — Apply Assist is a deliberate detour, not the default.
  useEffect(() => {
    setAppliedState("idle");
    setUndoAvailable(false);
    setMode("overview");
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, [appId]);

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

  const companyLc = (app?.company_name ?? "").toLowerCase();
  const target = app ? matchCompany(app.company_name ?? "") : null;
  const elig = useMemo(() => {
    if (!app || !profile) return null;
    return assessEligibility(profile, {
      id: String(app.id), company: app.company_name ?? "", title: app.role_title,
      url: app.job_link ?? "", locations: [], source: app.source ?? "",
    }, app.job_description ?? undefined);
  }, [app, profile]);
  const contactsAtCompany = useMemo(() => {
    if (!app) return 0;
    const histIds = new Set(employment.filter((e) => e.company.toLowerCase() === companyLc).map((e) => e.contact_id));
    return contacts.filter((c) => (c.company_name ?? "").toLowerCase() === companyLc || histIds.has(c.id)).length;
  }, [app, contacts, employment, companyLc]);

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

  async function markApplied() {
    if (!app) return;
    setError("");
    const started = Date.now();
    setAppliedState("done"); // optimistic — the burst plays immediately
    try {
      await setApplicationStatus(app.id, "applied");
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status: "applied" } : a)));
      setUndoAvailable(true);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = window.setTimeout(() => setUndoAvailable(false), 10_000);
      // Let the button's burst finish its moment before the modal arrives.
      setTimeout(() => setCelebrate(true), Math.max(0, 720 - (Date.now() - started)));
    } catch (e) {
      setAppliedState("idle");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function undoApplied() {
    if (!app || !undoAvailable) return;
    setUndoAvailable(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setCelebrate(false);
    setAppliedState("idle");
    try {
      await setApplicationStatus(app.id, "interested");
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status: "interested" } : a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  const intel: Intel[] = [];
  if (app) {
    if (elig) {
      const row = ELIG_ROW[elig.level];
      intel.push({ icon: "shield", title: row.label, body: elig.reasons[0] });
    }
    intel.push(contactsAtCompany > 0
      ? { icon: "user", title: `${contactsAtCompany} contact${contactsAtCompany === 1 ? "" : "s"} at ${app.company_name ?? "this company"}`, body: "A warm path is worth more than a cold follow-up — reach out before you wait on a reply." }
      : { icon: "user", title: `No contacts at ${app.company_name ?? "this company"} yet`, body: "Find people to reach out to instead of waiting on the posting alone." });
    if (target) {
      intel.push({ icon: "target", title: `${app.company_name} is a ${PRIORITY_LABEL[target.priority].toLowerCase()} target`, body: `Leading with your ${TRACK_LABEL[target.track ?? trackFor(app.company_name ?? "")]} résumé track.` });
    }
    if (target?.notes?.trim()) {
      intel.push({ icon: "doc", title: `Your notes on ${app.company_name}`, body: target.notes.trim() });
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
            {selectableApps.map((a) => (
              <option key={a.id} value={a.id}>
                {(a.company_name ?? "Unknown") + " — " + a.role_title}
              </option>
            ))}
          </select>
          {selectableApps.length === 0 && (
            <p className="hint">Nothing left to prepare — every tracked role has already been applied to. Save a role from Browse to see it here.</p>
          )}
          {skippedPreselect && !appId && (
            <p className="hint">That role's already applied — pick another above, or check it in your Tracker.</p>
          )}
        </div>

        {app && mode === "assist" && (
          <>
            <button type="button" className="secondary small mb-sm btn-ic" onClick={() => setMode("overview")}>{IC_BACK} Back to overview</button>

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
                <button type="button" className="secondary" onClick={() => openExternal(app.job_link as string)}>
                  Open job posting
                </button>
              )}
            </div>
            {error && <p className="hint text-red">{error}</p>}
          </>
        )}
      </div>

      {app && mode === "assist" && assist && (
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
            <div className="mt-sm">
              <button type="button" className="secondary small btn-ic" onClick={() => setMode("overview")}>{IC_BACK} Back to overview</button>
            </div>
          </div>
        </>
      )}

      {app && mode === "overview" && (app.status === "interested" || undoAvailable) && (
        <div className="rs-card">
          <div className="rs-top">
            <CompanyLogo company={app.company_name ?? "?"} />
            <span className="tx">
              <b>{app.role_title}</b>
              <span>{app.company_name ?? "Unknown"}{app.location ? ` · ${app.location}` : ""}</span>
            </span>
            {app.job_link && (
              <button type="button" className="rs-open" title="Open the posting" aria-label="Open the posting" onClick={() => openExternal(app.job_link as string)}>{IC_EXT}</button>
            )}
            {target && <span className="rs-tag">{PRIORITY_LABEL[target.priority]}</span>}
          </div>

          <div className="rs-prepped">
            <span className="eyebrow">Prepared for you</span>
            <div className="rs-prow">
              <span className="tick">{IC_CHECK}</span>
              Résumé selected
              <span className="val">{versions.find((v) => v.id === resumeId)?.name ?? "none chosen"}</span>
            </div>
            <div className="rs-prow">
              <span className={"tick" + (assist ? "" : " open")}>{assist ? IC_CHECK : IC_DASH}</span>
              Answers drafted
              <span className="val">{assist ? `${assist.shortAnswers.length} question${assist.shortAnswers.length === 1 ? "" : "s"}` : "not drafted yet"}</span>
            </div>
            <div className="rs-prow">
              <span className={"tick" + (elig && ELIG_ROW[elig.level].ok ? "" : " open")}>{elig && ELIG_ROW[elig.level].ok ? IC_CHECK : IC_DASH}</span>
              Work authorization
              <span className="val">{elig ? ELIG_ROW[elig.level].label : "Not checked yet"}</span>
            </div>
            <div className="rs-prow">
              <span className="tick open">{IC_DASH}</span>
              Submitted on their site
              <span className="val">waiting on you</span>
            </div>
          </div>

          <div className="rs-commit">
            <p className="hint">InternPilot never submits for you. Want help with your résumé or answers? Use Apply Assist. Already submitted on {app.company_name ?? "their"} site? Mark it applied.</p>
            <div className="rs-crow">
              <button type="button" className="secondary wide" onClick={() => setMode("assist")}>
                {IC_WAND} Apply Assist
              </button>
              <AppliedButton state={appliedState} onClick={markApplied} />
            </div>
            {undoAvailable && (
              <p className="rs-undonote">Pressed by mistake? <button type="button" className="rs-undo" onClick={undoApplied}>Undo</button></p>
            )}
          </div>
        </div>
      )}

      {celebrate && app && (
        <MilestoneCelebration
          kind="applied"
          company={app.company_name ?? "This company"}
          role={app.role_title}
          stats={[
            [String(apps.length), "applications"],
            [String(apps.filter((a) => a.status !== "rejected" && a.status !== "offer").length), "still live"],
            [versions.find((v) => v.id === resumeId)?.name ?? "—", "résumé attached"],
          ]}
          reach={1}
          sitTight={{
            title: "Now sit tight",
            body: `We'll flag this if it's still quiet after ${GHOST_DAYS} days, so you don't have to keep checking.`,
          }}
          intel={intel}
          onClose={() => setCelebrate(false)}
          onPrimary={() => { setCelebrate(false); navigate("/prep-engine"); }}
        />
      )}
    </>
  );
}
