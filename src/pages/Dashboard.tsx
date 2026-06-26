import { useEffect, useState } from "react";
import {
  getFunnelRates,
  getResumeVersionPerformance,
  getStatusCounts,
  getWeeklyApplications,
  type FunnelRates,
  type ResumeVersionPerf,
  type StatusCounts,
  type WeekBucket,
} from "../db/metrics";
import { listApplications } from "../db/applications";
import { STATUSES, STATUS_LABELS, type ApplicationRow, type Status } from "../db/types";
import StatusBadge from "../components/StatusBadge";

export default function Dashboard() {
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [rates, setRates] = useState<FunnelRates | null>(null);
  const [recent, setRecent] = useState<ApplicationRow[]>([]);
  const [weekly, setWeekly] = useState<WeekBucket[]>([]);
  const [perf, setPerf] = useState<ResumeVersionPerf[]>([]);

  useEffect(() => {
    (async () => {
      setCounts(await getStatusCounts());
      setRates(await getFunnelRates());
      setRecent((await listApplications()).slice(0, 6));
      setWeekly(await getWeeklyApplications(8));
      setPerf(await getResumeVersionPerformance());
    })().catch(console.error);
  }, []);

  const maxStatusCount = counts ? Math.max(1, ...STATUSES.map((s) => counts[s])) : 1;
  const maxWeek = Math.max(1, ...weekly.map((w) => w.count));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Your internship search at a glance.</p>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Total" value={counts?.total} accent />
        <Metric label={STATUS_LABELS.applied} value={counts?.applied} />
        <Metric label="OA" value={counts?.oa} />
        <Metric label={STATUS_LABELS.interview} value={counts?.interview} />
        <Metric label={STATUS_LABELS.offer} value={counts?.offer} />
        <Metric label={STATUS_LABELS.rejected} value={counts?.rejected} />
      </div>

      <div className="card">
        <h2>Status breakdown</h2>
        {!counts || counts.total === 0 ? (
          <div className="empty">No applications yet.</div>
        ) : (
          STATUSES.map((s) => (
            <div className="funnel-row" key={s}>
              <span className="funnel-label">{STATUS_LABELS[s]}</span>
              <div className="bar-track">
                <div className={`bar-fill ${s}`} style={{ width: `${(counts[s] / maxStatusCount) * 100}%` }} />
              </div>
              <span className="funnel-count">{counts[s]}</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Applications per week</h2>
        {weekly.every((w) => w.count === 0) ? (
          <div className="empty">No application dates recorded yet.</div>
        ) : (
          <div className="col-chart">
            {weekly.map((w, i) => (
              <div className="col" key={i}>
                <span className="col-val">{w.count || ""}</span>
                <div className="col-bar" style={{ height: `${(w.count / maxWeek) * 100}%` }} />
                <span className="col-label">{w.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Conversion rates</h2>
        <div className="metric-grid mb-0">
          <Metric label="Response rate" value={pct(rates?.responseRate)} />
          <Metric label="OA rate" value={pct(rates?.oaRate)} />
          <Metric label="Interview rate" value={pct(rates?.interviewRate)} />
          <Metric label="Offer rate" value={pct(rates?.offerRate)} />
        </div>
      </div>

      <div className="card">
        <h2>Resume version performance</h2>
        {perf.length === 0 ? (
          <div className="empty">Add resume versions and assign them to applications to compare performance.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Apps</th>
                <th>OA rate</th>
                <th>Interview rate</th>
                <th>Offers</th>
              </tr>
            </thead>
            <tbody>
              {perf.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.total}</td>
                  <td><RateBar value={p.reachedOa} total={p.total} variant="oa" /></td>
                  <td><RateBar value={p.reachedInterview} total={p.total} variant="interview" /></td>
                  <td>{p.offers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Recent applications</h2>
        {recent.length === 0 ? (
          <div className="empty">
            No applications yet. Head to <strong>Applications</strong> to add your first one.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
                <th>Saved</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((a) => (
                <tr key={a.id}>
                  <td>{a.company_name ?? <span className="muted">—</span>}</td>
                  <td>{a.role_title}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td className="muted">{a.date_saved?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Metric({ label, value, accent }: { label: string; value?: number | string; accent?: boolean }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className={"value" + (accent ? " accent" : "")}>{value ?? "—"}</div>
    </div>
  );
}

function RateBar({ value, total, variant }: { value: number; total: number; variant: Status }) {
  const rate = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="perf-rate">
      <div className="bar-track">
        <div className={`bar-fill ${variant}`} style={{ width: `${rate}%` }} />
      </div>
      <span>{rate}%</span>
    </div>
  );
}

function pct(n?: number) {
  return n === undefined ? undefined : `${n}%`;
}
