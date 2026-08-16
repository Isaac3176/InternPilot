import { useEffect, useMemo, useState } from "react";
import { listApplications } from "../db/applications";
import { computeDiagnostics, MIN_SEGMENT, type Segment, type Bucket } from "../diagnostics/recruiting";
import type { ApplicationRow } from "../db/types";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function DiagnosticsPage() {
  const [apps, setApps] = useState<ApplicationRow[] | null>(null);
  useEffect(() => { listApplications().then(setApps).catch(() => setApps([])); }, []);

  const d = useMemo(() => (apps ? computeDiagnostics(apps) : null), [apps]);

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

      <p className="diag-caveat">
        These are associations in your own data — not proof of cause. A résumé version, a timing window, or a referral that looks better here may just have landed on easier roles. Use it to form hypotheses, then test them.
      </p>
    </div>
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
