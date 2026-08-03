import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createApplication } from "../db/applications";
import { getOpportunityQueue, recommendResume, type OpportunityQueue } from "../ranking/queue";
import { dismiss, mutePattern, similarPhrase } from "../ranking/feedback";
import { PRIORITY_LABEL } from "../ranking/companies";
import type { RankedOpportunity } from "../ranking/types";
import type { ResumeVersion, Status } from "../db/types";
import { APP_RECORDED_EVENT } from "../bridge";
import CompanyLogo from "../components/CompanyLogo";

const PENDING_SELECT = "internpilot.pendingSelect";

function scoreColor(v: number): string {
  return v >= 85 ? "var(--beacon)" : v >= 70 ? "var(--accent)" : v >= 55 ? "var(--warn)" : "var(--slate)";
}

export default function Queue() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<OpportunityQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDigest, setShowDigest] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getOpportunityQueue()
      .then(setQueue)
      .catch((e) => console.error("queue load failed", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(APP_RECORDED_EVENT, load);
    return () => window.removeEventListener(APP_RECORDED_EVENT, load);
  }, [load]);

  async function track(o: RankedOpportunity, status: Status) {
    await createApplication({
      company_name: o.company,
      role_title: o.title,
      job_link: o.url,
      location: o.locations[0] ?? null,
      status,
      date_applied: status === "applied" ? new Date().toISOString().slice(0, 10) : null,
    });
  }

  async function applyNow(o: RankedOpportunity) {
    try {
      await track(o, "applied");
      openUrl(o.url).catch((e) => console.error("open posting failed", e));
      load();
    } catch (e) {
      console.error(e);
    }
  }
  async function saveForLater(o: RankedOpportunity) {
    try { await track(o, "interested"); load(); } catch (e) { console.error(e); }
  }
  async function prepare(o: RankedOpportunity) {
    try { await track(o, "interested"); } catch (e) { console.error(e); }
    localStorage.setItem(PENDING_SELECT, o.id);
    navigate("/internships");
  }
  function askReferral() {
    navigate("/networking");
  }
  function onDismiss(o: RankedOpportunity) { dismiss(o.id); load(); }
  function onMute(o: RankedOpportunity) { mutePattern(similarPhrase(o.title)); load(); }

  if (loading && !queue) {
    return (
      <div className="queue">
        <div className="page-header"><div><h1>Fast Apply</h1><p>Ranking your opportunities…</p></div></div>
        <p className="hint">Scoring the feed against your watchlist…</p>
      </div>
    );
  }

  const today = queue?.today ?? [];
  const digest = queue?.digest ?? [];
  const resumes = queue?.resumes ?? [];
  const instantCount = queue?.counts.instant ?? 0;

  return (
    <div className="queue">
      <div className="page-header">
        <div>
          <h1>Fast Apply</h1>
          <p>
            {today.length === 0
              ? "No high-priority applications waiting. Check the digest or open Discover."
              : `You have ${today.length} high-priority application${today.length === 1 ? "" : "s"} to complete ${today.length > 2 ? "today" : "now"}.`}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn" onClick={() => navigate("/internships")}>Browse all</button>
          <button type="button" className="btn" onClick={() => navigate("/watchlist")}>Watchlist</button>
          <button type="button" className="btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {instantCount > 0 && (
        <div className="instant-banner">
          <span className="pulse" />
          <b>{instantCount} instant alert{instantCount === 1 ? "" : "s"}</b>
          <span>Priority-0 companies with a strong match — apply within 24 hours.</span>
        </div>
      )}

      <div className="qsection-label">Apply now</div>
      {today.length === 0 ? (
        <div className="empty">
          <b>Nothing urgent right now</b>
          <p>New roles from your Priority-0/1 companies will surface here first. Meanwhile, lower-scored matches are in the digest below.</p>
          <button type="button" className="btn small" onClick={() => navigate("/internships")}>Open Discover</button>
        </div>
      ) : (
        <div className="qlist">
          {today.map((o, i) => (
            <QueueCard
              key={o.id} o={o} rank={i + 1} resume={recommendResume(o, resumes)}
              onApply={applyNow} onPrepare={prepare} onReferral={askReferral}
              onSave={saveForLater} onDismiss={onDismiss} onMute={onMute}
            />
          ))}
        </div>
      )}

      {digest.length > 0 && (
        <>
          <button type="button" className="qsection-label toggle" onClick={() => setShowDigest((s) => !s)}>
            Daily digest · {digest.length} more {showDigest ? "▾" : "▸"}
          </button>
          {showDigest && (
            <div className="qlist">
              {digest.map((o, i) => (
                <QueueCard
                  key={o.id} o={o} rank={today.length + i + 1} resume={recommendResume(o, resumes)}
                  onApply={applyNow} onPrepare={prepare} onReferral={askReferral}
                  onSave={saveForLater} onDismiss={onDismiss} onMute={onMute}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface CardProps {
  o: RankedOpportunity;
  rank: number;
  resume: ResumeVersion | null;
  onApply: (o: RankedOpportunity) => void;
  onPrepare: (o: RankedOpportunity) => void;
  onReferral: (o: RankedOpportunity) => void;
  onSave: (o: RankedOpportunity) => void;
  onDismiss: (o: RankedOpportunity) => void;
  onMute: (o: RankedOpportunity) => void;
}

function QueueCard({ o, rank, resume, onApply, onPrepare, onReferral, onSave, onDismiss, onMute }: CardProps) {
  return (
    <article className={`qcard tier-${o.tier}`}>
      <div className="qrank">{rank}</div>
      <CompanyLogo company={o.company} />
      <div className="qmain">
        <div className="qhead">
          <div className="qtitle">
            <div className="qco">
              {o.company}
              {o.companyPriority && o.companyPriority !== "normal" && (
                <span className={`prio ${o.companyPriority}`}>{PRIORITY_LABEL[o.companyPriority]}</span>
              )}
            </div>
            <h3>{o.title}</h3>
          </div>
          <div className="qscore" style={{ color: scoreColor(o.priority) }}>
            {o.priority}<span>score</span>
          </div>
        </div>

        <div className="qmeta">
          <span>{o.freshnessLabel}</span>
          <span>·</span>
          <span>{o.eligibilityLabel}</span>
          <span>·</span>
          <span>Résumé: {resume ? resume.name : "add one"}</span>
          <span>·</span>
          <span>{o.hasReferral ? "Referral: possible contact" : "No referral yet"}</span>
          <span>·</span>
          <span>~{o.estMinutes} min</span>
        </div>

        <details className="qwhy">
          <summary>Why this is ranked #{rank}</summary>
          <ul>
            {o.reasons.map((r, i) => (
              <li key={i} className={r.delta > 0 ? "pos" : "neg"}>
                <span className="d">{r.delta > 0 ? "+" : ""}{r.delta}</span>{r.label}
              </li>
            ))}
          </ul>
        </details>

        <div className="qactions">
          <button type="button" className="btn small primary" onClick={() => onApply(o)}>Apply now</button>
          <button type="button" className="btn small" onClick={() => onPrepare(o)}>Prepare</button>
          <button type="button" className="btn small" onClick={() => onReferral(o)}>Ask for referral</button>
          <button type="button" className="btn small" onClick={() => onSave(o)}>Save for later</button>
          <button type="button" className="btn small ghost" onClick={() => onDismiss(o)}>Dismiss</button>
          <button type="button" className="btn small ghost" onClick={() => onMute(o)}>Mute similar</button>
        </div>
      </div>
    </article>
  );
}
