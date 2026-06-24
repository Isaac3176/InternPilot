import { useEffect, useState } from "react";
import { getFunnelRates, getStatusCounts, type FunnelRates, type StatusCounts } from "../db/metrics";
import { listApplications } from "../db/applications";
import { STATUS_LABELS, type ApplicationRow } from "../db/types";
import StatusBadge from "../components/StatusBadge";

export default function Dashboard() {
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [rates, setRates] = useState<FunnelRates | null>(null);
  const [recent, setRecent] = useState<ApplicationRow[]>([]);

  useEffect(() => {
    (async () => {
      setCounts(await getStatusCounts());
      setRates(await getFunnelRates());
      setRecent((await listApplications()).slice(0, 6));
    })().catch(console.error);
  }, []);

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
        <h2>Conversion rates</h2>
        <div className="metric-grid" style={{ marginBottom: 0 }}>
          <Metric label="Response rate" value={pct(rates?.responseRate)} />
          <Metric label="OA rate" value={pct(rates?.oaRate)} />
          <Metric label="Interview rate" value={pct(rates?.interviewRate)} />
          <Metric label="Offer rate" value={pct(rates?.offerRate)} />
        </div>
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

function pct(n?: number) {
  return n === undefined ? undefined : `${n}%`;
}
