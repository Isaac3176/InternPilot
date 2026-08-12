import { useEffect, useState } from "react";
import {
  addCompanyByName,
  ensureSeeded,
  getWatchlist,
  inferTrack,
  PRIORITY_LABEL,
  removeCompany,
  setCompanyPriority,
  setCompanyTrack,
  TRACK_LABEL,
  type CompanyPriority,
  type ResumeTrack,
  type TargetCompany,
} from "../ranking/companies";

const TIERS: CompanyPriority[] = ["instant", "high", "normal", "muted"];
const TRACKS: ResumeTrack[] = ["general", "infra", "ai", "fullstack"];
const TIER_HINT: Record<CompanyPriority, string> = {
  instant: "Apply almost immediately — instant persistent alert, 24-hour timer.",
  high: "Excited to join — normal notification, near the top of the queue.",
  normal: "Relevant, but batched into the morning/evening digest.",
  muted: "Never notify — kept for reference only.",
};

export default function Watchlist() {
  const [list, setList] = useState<TargetCompany[]>([]);
  const [name, setName] = useState("");
  const [tier, setTier] = useState<CompanyPriority>("instant");

  useEffect(() => { ensureSeeded(); setList(getWatchlist()); }, []);
  const reload = () => setList(getWatchlist());

  function add() {
    const n = name.trim();
    if (!n) return;
    addCompanyByName(n, tier);
    setName("");
    reload();
  }

  const byTier = (t: CompanyPriority) => list.filter((c) => c.priority === t).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="watchlist">
      <div className="page-header">
        <div>
          <h1>Company watchlist</h1>
          <p>Priority tiers decide what interrupts you and what waits for a digest. {list.length} companies tracked.</p>
        </div>
      </div>

      <div className="card">
        <h2>Add a company</h2>
        <div className="wl-add">
          <input
            placeholder="Company name (e.g. Stripe)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <select value={tier} onChange={(e) => setTier(e.target.value as CompanyPriority)}>
            {TIERS.map((t) => <option key={t} value={t}>{PRIORITY_LABEL[t]}</option>)}
          </select>
          <button type="button" onClick={add}>Add</button>
        </div>
        <p className="hint">{TIER_HINT[tier]}</p>
      </div>

      {TIERS.map((t) => {
        const companies = byTier(t);
        return (
          <div className="card" key={t}>
            <div className="wl-head">
              <h2>{PRIORITY_LABEL[t]} <span className="wl-count">{companies.length}</span></h2>
              <span className="hint">{TIER_HINT[t]}</span>
            </div>
            {companies.length === 0 ? (
              <p className="muted-note">No companies in this tier.</p>
            ) : (
              <div className="wl-chips">
                {companies.map((c) => (
                  <div className={`wl-chip ${t}`} key={c.id}>
                    <span className="wl-name">{c.name}</span>
                    <select
                      value={c.priority}
                      onChange={(e) => { setCompanyPriority(c.id, e.target.value as CompanyPriority); reload(); }}
                      aria-label={`Priority for ${c.name}`}
                    >
                      {TIERS.map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}
                    </select>
                    <select
                      className="wl-track"
                      value={c.track ?? inferTrack(c.name)}
                      onChange={(e) => { setCompanyTrack(c.id, e.target.value as ResumeTrack); reload(); }}
                      aria-label={`Résumé track for ${c.name}`}
                      title="Résumé track to lead with"
                    >
                      {TRACKS.map((x) => <option key={x} value={x}>{TRACK_LABEL[x]}</option>)}
                    </select>
                    <button type="button" className="wl-x" onClick={() => { removeCompany(c.id); reload(); }} title="Remove">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
