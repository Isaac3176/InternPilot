import { useEffect, useMemo, useState } from "react";
import { listApplications, backfillDiagnostics, needsBackfill } from "../db/applications";
import { getProfile } from "../db/profile";
import { reportError } from "../lib/report";
import { computeDiagnostics, MIN_SEGMENT, type Segment, type Bucket } from "../diagnostics/recruiting";
import { fastRejections, screeningItems, humanDuration, type FastRejection, type AuditItem } from "../diagnostics/questionAudit";
import type { ApplicationRow, Profile } from "../db/types";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function DiagnosticsPage() {
  const [apps, setApps] = useState<ApplicationRow[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const load = () => listApplications().then(setApps).catch((e) => { reportError("diagnostics: load applications", e); setApps([]); });
  useEffect(() => {
    load();
    getProfile().then(setProfile).catch((e) => reportError("diagnostics: load profile", e));
  }, []);

  const d = useMemo(() => (apps ? computeDiagnostics(apps) : null), [apps]);
  const missing = useMemo(() => (apps ? apps.filter(needsBackfill).length : 0), [apps]);

  async function runBackfill() {
    setBackfilling(true);
    try { await backfillDiagnostics(); await load(); }
    catch (e) { console.error(e); }
    finally { setBackfilling(false); }
  }
  const fast = useMemo(() => (apps ? fastRejections(apps, profile) : []), [apps, profile]);
  const standingRisks = useMemo(() => screeningItems(profile).filter((i) => i.risk), [profile]);

  if (!d) return <div className="diag"><div className="page-header"><div><h1>Recruiting Diagnostics</h1></div></div><p className="hint">Reading your applications…</p></div>;

  const maxReject = Math.max(1, ...d.rejection.buckets.map((b) => b.count));

  return (
    <div className="diag">
      <div className="page-header">
        <div>
          <h1>Recruiting Diagnostics</h1>
          <p>What actually happens to your applications — not just how many you sent.</p>
        </div>
      </div>

      {missing > 0 && (
        <div className="diag-backfill">
          <div>
            <b>{missing} application{missing === 1 ? "" : "s"} predate signal capture</b>
            <span>Fill their funnel + timing from dates you already have (discovered ← saved, applied ← applied date). Won't invent reject times, so rejection-timing stays going-forward only.</span>
          </div>
          <button type="button" onClick={runBackfill} disabled={backfilling}>{backfilling ? "Filling…" : `Backfill ${missing}`}</button>
        </div>
      )}

      {d.applied < 10 && (
        <p className="diag-note">Only {d.applied} applied so far — treat everything below as directional. Patterns get trustworthy past ~10–15 per segment.</p>
      )}

      {/* Funnel */}
      <section className="diag-card">
        <h2>Funnel</h2>
        <div className="funnel">
          {d.funnel.map((s, i) => (
            <div className="funnel-stage" key={s.key}>
              <div className="funnel-bar" style={{ height: `${Math.max(6, s.rate * 100)}%` }}>
                <b>{s.count}</b>
              </div>
              <span className="funnel-lbl">{s.label}</span>
              {i > 0 && <span className="funnel-rate">{pct(s.rate)}</span>}
            </div>
          ))}
        </div>
        <p className="diag-sub">Deepest stage each application reached — a rejection still counts toward the stage it got to.</p>
      </section>

      <SegmentTable title="By résumé" hint="Which version actually converts." segments={d.byResume} />
      <SegmentTable title="By application timing" hint="How fast you applied after discovering the role." segments={d.byTiming}
        empty={`Need discovered + applied timestamps — ${d.coverage.timing} application(s) have both so far.`} />
      <SegmentTable title="By referral" hint="Referral vs cold apply." segments={d.byReferral} />

      {/* Rejection timing */}
      <section className="diag-card">
        <h2>Rejection timing</h2>
        <p className="diag-sub">How long until a "no". A cluster in the first hour usually means an automated eligibility screen rather than a recruiter reading your résumé.</p>
        <div className="rej-hist">
          {d.rejection.buckets.map((b) => <RejectRow key={b.label} b={b} max={maxReject} />)}
        </div>
        {d.rejection.undated > 0 && <p className="diag-sub">{d.rejection.undated} older rejection(s) lack a result date and aren't timed here.</p>}
      </section>

      {/* Question audit */}
      <section className="diag-card">
        <h2>Automatic-screen review</h2>
        <p className="diag-sub">Most screening answers come from your profile's autofill. When a rejection comes back fast, these are the answers that could have tripped a mechanical filter — worth a check before you blame the résumé.</p>

        {standingRisks.length > 0 && (
          <div className="qa-standing">
            <span className="eyebrow">Answers that auto-filter you across the board</span>
            <div className="qa-chips">
              {standingRisks.map((i) => <span key={i.category} className="qa-chip risk" title={i.note}>{i.label}: {i.value}</span>)}
            </div>
          </div>
        )}

        {fast.length === 0 ? (
          <p className="diag-empty">No fast rejections detected (need a rejection with an apply + result date within 24h). This section fills in as results land.</p>
        ) : (
          <div className="qa-list">{fast.map((f) => <FastRejectionCard key={f.app.id} f={f} />)}</div>
        )}
      </section>

      <p className="diag-caveat">
        These are associations in your own data — not proof of cause. A résumé version, a timing window, or a referral that looks better here may just have landed on easier roles. Use it to form hypotheses, then test them.
      </p>
    </div>
  );
}

function FastRejectionCard({ f }: { f: FastRejection }) {
  const risks = f.items.filter((i) => i.risk);
  const verify = f.items.filter((i) => !i.risk);
  return (
    <div className={`qa-card ${f.likelihood === "very likely" ? "vlikely" : ""}`}>
      <div className="qa-head">
        <b>{f.app.company_name ?? "Unknown"}{f.app.role_title ? ` · ${f.app.role_title}` : ""}</b>
        <span className="qa-time">Rejected {humanDuration(f.hoursToResult)} after submit</span>
      </div>
      <p className="qa-verdict">{f.likelihood === "very likely" ? "Very likely an automated eligibility screen" : "Possibly an automated screen"} — <b>résumé-quality signal: low confidence</b></p>
      {risks.length > 0 ? (
        <>
          <span className="eyebrow">Review these answers</span>
          <ul className="qa-items">
            {risks.map((i) => <AuditRow key={i.category} i={i} />)}
          </ul>
        </>
      ) : (
        <p className="qa-none">No obvious auto-screen trigger in your profile for this one — it may have been a genuine (fast) review or high volume.</p>
      )}
      {verify.length > 0 && (
        <div className="qa-verify"><span className="eyebrow">Also verify</span>{verify.map((i) => <span key={i.category} className="qa-chip">{i.label}</span>)}</div>
      )}
    </div>
  );
}

function AuditRow({ i }: { i: AuditItem }) {
  return (
    <li className="qa-item">
      <span className="qa-item-dot" aria-hidden />
      <div><b>{i.label}: {i.value}</b><span>{i.note}</span></div>
    </li>
  );
}

function SegmentTable({ title, hint, segments, empty }: { title: string; hint: string; segments: Segment[]; empty?: string }) {
  return (
    <section className="diag-card">
      <h2>{title}</h2>
      <p className="diag-sub">{hint}</p>
      {segments.length === 0 ? (
        <p className="diag-empty">{empty ?? "No data yet."}</p>
      ) : (
        <table className="seg-table">
          <thead>
            <tr><th>{title.replace("By ", "")}</th><th>Applied</th><th>OA</th><th>Interview</th><th>Offer</th><th>OA rate</th></tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.label} className={s.thin ? "thin" : ""}>
                <td className="seg-name">{s.label}{s.thin && <span className="seg-warn" title={`Only ${s.applied} applied — below ${MIN_SEGMENT}, low confidence`}>small sample</span>}</td>
                <td className="mono">{s.applied}</td>
                <td className="mono">{s.oa}</td>
                <td className="mono">{s.interview}</td>
                <td className="mono">{s.offer}</td>
                <td className="mono seg-rate">{pct(s.oaRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RejectRow({ b, max }: { b: Bucket; max: number }) {
  return (
    <div className={`rej-row ${b.kind ?? ""}`}>
      <span className="rej-lbl">{b.label}</span>
      <div className="rej-track"><span className="rej-fill" style={{ width: `${(b.count / max) * 100}%` }} /></div>
      <span className="rej-n mono">{b.count}</span>
      {b.hint && b.count > 0 && <span className="rej-hint">{b.hint}</span>}
    </div>
  );
}
