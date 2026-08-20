import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { getNextActions, type ActionKind, type NextAction } from "../actions/engine";
import { APP_RECORDED_EVENT } from "../bridge";
import {
  getFunnelRates,
  getReferralStats,
  getResumeVersionPerformance,
  getStatusCounts,
  getWeeklyApplications,
  type FunnelRates,
  type ReferralStats,
  type ResumeVersionPerf,
  type StatusCounts,
  type WeekBucket,
} from "../db/metrics";
import { listApplications, createApplication } from "../db/applications";
import { getReminders, type Reminder } from "../db/reminders";
import { notifyNewReminders } from "../lib/notify";
import { getStrategyRecommendation, type Strategy } from "../ai/strategy";
import { listCodingProblems } from "../db/codingProblems";
import { listOAAttempts } from "../db/oaAttempts";
import { buildOverview } from "../prep/engine";
import { getProfile } from "../db/profile";
import { computeDiagnostics } from "../diagnostics/recruiting";
import { fastRejections, screeningItems, humanDuration } from "../diagnostics/questionAudit";
import { getLiveOpenings, getCachedLiveOpenings, type LiveOpening } from "../release/live";
import { openExternal } from "../lib/open";
import CompanyLogo from "../components/CompanyLogo";
import type { ApplicationRow, Status } from "../db/types";

const WEEKLY_GOAL = 5;

const EMPTY_COUNTS: StatusCounts = {
  interested: 0, applied: 0, oa: 0, interview: 0, offer: 0, rejected: 0, total: 0,
};

const STAGE_META = [
  { k: "interested", lb: "Interested", v: "--s-interested" },
  { k: "applied", lb: "Applied", v: "--s-applied" },
  { k: "oa", lb: "Assessment", v: "--s-oa" },
  { k: "interview", lb: "Interview", v: "--s-interview" },
  { k: "offer", lb: "Offer", v: "--s-offer" },
] as const;

const PILL_LABEL: Record<Status, string> = {
  interested: "Interested", applied: "Applied", oa: "Assessment",
  interview: "Interview", offer: "Offer", rejected: "Rejected",
};

const AVATAR_COLORS = [
  "#1A1A1A", "#3E4C8C", "#33383D", "#4B4FD6", "#D6455E",
  "#157F5F", "#B03D2A", "#6B4A2F", "#7A5AF8", "#12509E",
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [actions, setActions] = useState<NextAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [rates, setRates] = useState<FunnelRates | null>(null);
  const [recent, setRecent] = useState<ApplicationRow[]>([]);
  const [weekly, setWeekly] = useState<WeekBucket[]>([]);
  const [perf, setPerf] = useState<ResumeVersionPerf[]>([]);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const loadMetrics = useCallback(async () => {
    setCounts(await getStatusCounts());
    setRates(await getFunnelRates());
    setRecent((await listApplications()).slice(0, 6));
    setWeekly(await getWeeklyApplications(8));
    setPerf(await getResumeVersionPerformance());
    setReferral(await getReferralStats());
    const rem = await getReminders();
    setReminders(rem);
    notifyNewReminders(rem);
  }, []);

  useEffect(() => {
    loadMetrics().catch(console.error);

    // Next best actions load separately (the feed fetch is large) so the rest renders first.
    getNextActions()
      .then(setActions)
      .catch(console.error)
      .finally(() => setActionsLoading(false));
  }, [loadMetrics]);

  // Refresh metrics when the browser extension records a job while this page is open.
  useEffect(() => {
    const onRecorded = () => loadMetrics().catch(console.error);
    window.addEventListener(APP_RECORDED_EVENT, onRecorded);
    return () => window.removeEventListener(APP_RECORDED_EVENT, onRecorded);
  }, [loadMetrics]);

  async function loadStrategy() {
    setLoadingStrategy(true);
    try {
      setStrategy(await getStrategyRecommendation());
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingStrategy(false);
    }
  }

  const c = counts ?? EMPTY_COUNTS;
  const stageMax = Math.max(1, ...STAGE_META.map((s) => c[s.k]));
  const maxWeek = Math.max(1, ...weekly.map((w) => w.count), WEEKLY_GOAL);
  const appliedDenom = c.total - c.interested;

  const RATES = [
    { lb: "Response rate", sub: "Applied → any reply", v: rates?.responseRate ?? 0, c: "var(--s-applied)" },
    { lb: "Assessment rate", sub: "Applied → OA", v: rates?.oaRate ?? 0, c: "var(--s-oa)" },
    { lb: "Interview rate", sub: "Applied → interview", v: rates?.interviewRate ?? 0, c: "var(--s-interview)" },
    { lb: "Offer rate", sub: "Applied → offer", v: rates?.offerRate ?? 0, c: "var(--s-offer)" },
    { lb: "Referral rate", sub: "Applications with a contact", v: referral?.rate ?? 0, c: "var(--good)" },
  ];

  let bestId = -1;
  let bestScore = -1;
  for (const p of perf) {
    if (p.total > 0) {
      const s = (p.reachedInterview / p.total) * 100 + p.reachedOa / p.total;
      if (s > bestScore) { bestScore = s; bestId = p.id; }
    }
  }

  return (
    <div className="dash">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Your internship search at a glance.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn" onClick={() => navigate("/internships")}>Import from feed</button>
          <button type="button" className="btn primary" onClick={() => navigate("/applications")}>
            <PlusIcon /> Add application
          </button>
        </div>
      </div>

      {reminders.length > 0 && (
        <div className="reminders">
          <span className="eyebrow">Due soon</span>
          {reminders.map((r) => (
            <span className="rem" key={r.key}><i /><b>{r.title}</b><span>{r.detail}</span></span>
          ))}
        </div>
      )}

      <LiveNowWidget onSeeAll={() => navigate("/radar")} />

      {/* ============ PIPELINE (hero) ============ */}
      <div className="card pipeline">
        <div className="card-head">
          <div>
            <h2>Pipeline</h2>
            <p className="sub">{c.total} tracked roles. Percentages show how many carry from one stage to the next.</p>
          </div>
          <button type="button" className="btn small" onClick={() => navigate("/applications")}>Open applications</button>
        </div>
        <div className="stages">
          {STAGE_META.map((s, i) => {
            const n = c[s.k];
            const next = STAGE_META[i + 1];
            const conv = next ? (n > 0 ? Math.round((c[next.k] / n) * 100) : null) : undefined;
            return (
              <StageAndConv
                key={s.k}
                n={n}
                label={s.lb}
                fill={(n / stageMax) * 100}
                colorVar={s.v}
                conv={conv}
              />
            );
          })}
        </div>
        <div className="pipeline-foot">
          <span className="closed">
            <span className="dot" />Closed out: <b>{c.rejected}</b> rejected{c.total ? ` of ${c.total}` : ""}
          </span>
          <span className="note">{pipelineNote(c)}</span>
        </div>
      </div>

      {/* ============ ROW: actions + strategy ============ */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <div><h2>Next best actions</h2><p className="sub">Ordered by what closes soonest, not by what's newest.</p></div>
          </div>
          {actionsLoading ? (
            <p className="hint">Prioritizing your day…</p>
          ) : actions.length === 0 ? (
            <div className="empty">
              <b>You're all caught up</b>
              <p>Nothing is waiting on you today. Connect the feed to keep suggestions coming.</p>
              <button type="button" className="btn small primary" onClick={() => navigate("/internships")}>Connect the feed</button>
            </div>
          ) : (
            <ul className="nba-list">
              {actions.map((a) => (
                <li className="nba" key={a.key}>
                  <span className={`nba-dot ${nbaGroup(a.kind)}`}>{NBA_ICON[nbaGroup(a.kind)]}</span>
                  <span className="nba-body"><b>{a.title}</b><span>{a.detail}</span></span>
                  <button type="button" className="btn small" onClick={() => navigate(a.href)}>Go</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div><h2>This week's strategy</h2></div>
            <button type="button" className="btn small" onClick={loadStrategy} disabled={loadingStrategy}>
              {loadingStrategy ? "Thinking…" : strategy ? "Refresh" : "Generate"}
            </button>
          </div>
          {strategy ? (
            <>
              {strategy.headline && <p className="strategy-head">{strategy.headline}</p>}
              <ul className="prep-list">
                {strategy.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
              <span className={`badge ${strategy.source === "openai" ? "" : "offline"}`}>
                {strategy.source === "openai" ? "AI-generated" : "Offline strategy"}
              </span>
            </>
          ) : (
            <div className="empty" style={{ textAlign: "left", padding: "16px 0", border: "none", background: "none" }}>
              <b>No plan yet this week</b>
              <p style={{ marginInline: 0 }}>Reads your funnel and tells you the one thing to change — more volume, better targeting, or a résumé swap.</p>
              <button type="button" className="btn small primary" onClick={loadStrategy} disabled={loadingStrategy}>
                {loadingStrategy ? "Thinking…" : "Generate plan"}
              </button>
            </div>
          )}
        </div>
      </div>

      <DiagnosticsInsight onOpen={() => navigate("/diagnostics")} />

      <PrepWidget onOpen={() => navigate("/prep-engine")} />

      {/* ============ ROW: weekly + rates ============ */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <div><h2>Applications per week</h2><p className="sub">Last 8 weeks against your goal of {WEEKLY_GOAL} a week.</p></div>
          </div>
          {weekly.length === 0 ? (
            <p className="hint">No application dates recorded yet.</p>
          ) : (
            <div className="chart">
              <div className="goal" style={{ bottom: (WEEKLY_GOAL / maxWeek) * 118 + 28 }}><span>Goal {WEEKLY_GOAL}</span></div>
              {weekly.map((w, i) => (
                <div className={`col${i === weekly.length - 1 ? " now" : ""}`} key={i}>
                  <span className={`v${w.count === 0 ? " zero" : ""}`}>{w.count}</span>
                  <div className={`b${w.count === 0 ? " empty" : ""}`} style={{ height: Math.max(3, (w.count / maxWeek) * 118) }} />
                  <span className="l">{w.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><div><h2>Conversion rates</h2><p className="sub">Measured against {appliedDenom} application{appliedDenom === 1 ? "" : "s"}.</p></div></div>
          {appliedDenom < 5 && (
            <p className="hint" style={{ marginBottom: 12 }}>Rates get meaningful around 10 applications. These are directional for now.</p>
          )}
          <ul className="rates">
            {RATES.map((r) => (
              <li className="rate" key={r.lb}>
                <span className="lb">{r.lb}<small>{r.sub}</small></span>
                <span className="track"><i style={{ ["--w" as string]: `${r.v}%`, ["--c" as string]: r.c }} /></span>
                <span className={`val${r.v === 0 ? " zero" : ""}`}>{r.v}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ============ ROW: résumé perf + recent ============ */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div><h2>Résumé version performance</h2></div>
            {perf.length > 0 && <button type="button" className="btn small" onClick={() => navigate("/resumes")}>Résumé center</button>}
          </div>
          {perf.length === 0 ? (
            <div className="empty">
              <b>Nothing to compare yet</b>
              <p>Assign a résumé version to each application and this table shows which one actually gets replies.</p>
              <button type="button" className="btn small" onClick={() => navigate("/resumes")}>Add a version</button>
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Version</th><th>Apps</th><th>Assessment</th><th>Interview</th><th style={{ textAlign: "right" }}>Offers</th></tr>
              </thead>
              <tbody>
                {perf.map((p) => {
                  const oaRate = p.total > 0 ? Math.round((p.reachedOa / p.total) * 100) : 0;
                  const ivRate = p.total > 0 ? Math.round((p.reachedInterview / p.total) * 100) : 0;
                  return (
                    <tr key={p.id}>
                      <td><b style={{ fontWeight: 600 }}>{p.name}</b>{p.id === bestId && <span className="best">Best</span>}</td>
                      <td className="num-cell">{p.total}</td>
                      <td><PerfRate rate={oaRate} colorVar="--s-oa" /></td>
                      <td><PerfRate rate={ivRate} colorVar="--s-interview" /></td>
                      <td className="num-cell" style={{ textAlign: "right" }}>{p.offers || <span className="muted">0</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-head"><div><h2>Recent activity</h2></div><button type="button" className="btn small" onClick={() => navigate("/applications")}>View all</button></div>
          {recent.length === 0 ? (
            <div className="empty">
              <b>No applications yet</b>
              <p>Add your first application or import one from the feed to start tracking.</p>
              <button type="button" className="btn small primary" onClick={() => navigate("/applications")}>Add application</button>
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Company</th><th>Status</th><th style={{ textAlign: "right" }}>Updated</th></tr>
              </thead>
              <tbody>
                {recent.map((a) => {
                  const name = a.company_name ?? "—";
                  const date = (a.date_applied ?? a.date_saved)?.slice(5, 10) ?? "";
                  return (
                    <tr key={a.id}>
                      <td>
                        <span className="co"><i style={{ background: avatarColor(name) }}>{initial(name)}</i>{name}</span>
                        <span style={{ display: "block", fontSize: 12, color: "var(--slate)", marginLeft: 31, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "26ch" }}>{a.role_title}</span>
                      </td>
                      <td><span className={`status ${a.status}`}><i />{PILL_LABEL[a.status]}</span></td>
                      <td className="num-cell muted" style={{ textAlign: "right", fontSize: 12 }}>{date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StageAndConv({ n, label, fill, colorVar, conv }: { n: number; label: string; fill: number; colorVar: string; conv?: number | null }) {
  return (
    <>
      <div className="stage">
        <div className="bar" style={{ ["--c" as string]: `var(${colorVar})` }}><i style={{ ["--fill" as string]: `${fill}%` }} /></div>
        <span className={`n${n === 0 ? " zero" : ""}`}>{n}</span>
        <span className="lb">{label}</span>
      </div>
      {conv !== undefined && (
        <div className="conv">
          <b className={conv === null || conv === 0 ? "dim" : ""}>{conv === null ? "—" : `${conv}%`}</b>
          <ArrowIcon />
        </div>
      )}
    </>
  );
}

function PerfRate({ rate, colorVar }: { rate: number; colorVar: string }) {
  return (
    <span className="perf-rate">
      <span className="track"><i style={{ ["--w" as string]: `${rate}%`, ["--c" as string]: `var(${colorVar})` }} /></span>
      <span>{rate}%</span>
    </span>
  );
}

/** Map the engine's fine-grained action kinds to the four visual groups. */
function nbaGroup(kind: ActionKind): "apply" | "followup" | "prep" | "network" {
  switch (kind) {
    case "apply": return "apply";
    case "followup": case "outcome": return "followup";
    case "oa": case "interview": case "profile": return "prep";
    case "referral": case "thankyou": return "network";
  }
}

function pipelineNote(c: StatusCounts): string {
  if (c.applied === 0) return "Nothing applied yet — the funnel starts filling once you send your first application.";
  if (c.offer > 0) return "One offer in hand. Keep the funnel warm until you sign.";
  if (c.interview > 0) return "Interviews are the bottleneck to watch this month.";
  return "No interviews yet. Volume at the top usually fixes this before résumé edits do.";
}

function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

const NBA_ICON: Record<"apply" | "followup" | "prep" | "network", ReactNode> = {
  apply: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12z" /></svg>,
  followup: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="8.5" /></svg>,
  prep: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 016.5 3H19v15H6.5A2.5 2.5 0 004 20.5z" /></svg>,
  network: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><circle cx="18" cy="9" r="2.2" /></svg>,
};

function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}
function ArrowIcon() {
  return <svg width="15" height="10" viewBox="0 0 15 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 5h11M9 2l3.5 3L9 8" /></svg>;
}

function agoLabel(sec: number | null): string {
  if (!sec) return "";
  const hrs = Math.floor((Date.now() / 1000 - sec) / 3600);
  if (hrs < 1) return "just posted";
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

/**
 * Real just-posted openings from watchlist companies' ATS boards — surfaced on Home
 * because they're the most time-sensitive thing in the app. Cached-first paint, then
 * a background refresh. Renders nothing when there's nothing live.
 */
function LiveNowWidget({ onSeeAll }: { onSeeAll: () => void }) {
  const [items, setItems] = useState<LiveOpening[]>([]);
  useEffect(() => {
    const cached = getCachedLiveOpenings();
    if (cached) setItems(cached.openings);
    getLiveOpenings().then(setItems).catch(() => {});
  }, []);
  if (items.length === 0) return null;

  async function apply(o: LiveOpening) {
    try {
      await createApplication({
        company_name: o.company, role_title: o.title, job_link: o.url,
        location: o.location, status: "applied", date_applied: new Date().toISOString().slice(0, 10),
        source: "live-ats", company_priority: o.priority,
        posting_posted_at: o.postedAt ? new Date(o.postedAt * 1000).toISOString() : null,
      });
    } catch (e) { console.error(e); }
    openExternal(o.url).catch(console.error);
  }

  const newCount = items.filter((o) => o.isNew).length;
  return (
    <div className="card live-now-card">
      <div className="card-head">
        <div><h2>Live now <span className="live-dot" aria-hidden /></h2>
          <p className="sub">Real postings from your watchlist{newCount > 0 ? ` · ${newCount} new` : ""}</p></div>
        <button type="button" className="btn small" onClick={onSeeAll}>See all on Radar</button>
      </div>
      <div className="live-now-list">
        {items.slice(0, 4).map((o) => (
          <div className={`live-now-item ${o.priority}`} key={o.url}>
            <CompanyLogo company={o.company} />
            <div className="live-now-tx">
              <div className="live-now-co"><b>{o.company}</b>{o.isNew && <span className="live-new">NEW</span>}{o.postedAt && <span className="live-now-age">{agoLabel(o.postedAt)}</span>}</div>
              <span className="live-now-title">{o.title}</span>
            </div>
            <button type="button" className="btn small primary" onClick={() => apply(o)}>Apply ↗</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One diagnostic nudge on Home — the single most actionable signal, no charts.
 * Priority: standing auto-screen risks → fast rejections → a funnel bottleneck.
 * Renders nothing when there's no meaningful signal.
 */
function DiagnosticsInsight({ onOpen }: { onOpen: () => void }) {
  const [insight, setInsight] = useState<{ tone: string; title: string; items: string[]; cta: string } | null>(null);
  useEffect(() => {
    Promise.all([listApplications(), getProfile()]).then(([apps, profile]) => {
      const risks = screeningItems(profile).filter((i) => i.risk);
      const fast = fastRejections(apps, profile);
      const d = computeDiagnostics(apps);
      if (risks.length > 0) {
        setInsight({ tone: "warn", title: `${risks.length} answer${risks.length === 1 ? "" : "s"} may be auto-filtering your applications`, items: risks.slice(0, 3).map((i) => `${i.label}: ${i.value}`), cta: "Review" });
      } else if (fast.length > 0) {
        setInsight({ tone: "warn", title: `${fast.length} rejection${fast.length === 1 ? "" : "s"} came back suspiciously fast`, items: fast.slice(0, 3).map((f) => `${f.app.company_name ?? "A role"} — rejected ${humanDuration(f.hoursToResult)} after submit`), cta: "Investigate" });
      } else if (d.applied >= 8) {
        const oa = d.funnel.find((s) => s.key === "oa");
        if (oa && oa.rate < 0.15) setInsight({ tone: "accent", title: "Low OA conversion", items: [`Only ${Math.round(oa.rate * 100)}% of your applications reach an OA — worth checking what's converting.`], cta: "See diagnostics" });
      }
    }).catch(() => {});
  }, []);
  if (!insight) return null;
  return (
    <div className={`card dash-insight ${insight.tone}`}>
      <div className="card-head">
        <div><span className="eyebrow">Diagnostics</span><h2>{insight.title}</h2></div>
        <button type="button" className="btn small" onClick={onOpen}>{insight.cta}</button>
      </div>
      <ul className="dash-insight-list">{insight.items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}

function PrepWidget({ onOpen }: { onOpen: () => void }) {
  const [ov, setOv] = useState<ReturnType<typeof buildOverview> | null>(null);
  useEffect(() => {
    Promise.all([listCodingProblems(), listOAAttempts()])
      .then(([p, o]) => setOv(buildOverview(p, o)))
      .catch(() => {});
  }, []);
  if (!ov || ov.totalAttempts === 0) return null;
  return (
    <div className="card prep-widget">
      <div className="card-head">
        <div><h2>Prep <span className="prep-w-pct">{ov.overall}%</span></h2>
          <p className="sub">{ov.today.length} problems · ~{ov.todayMinutes} min today</p></div>
        <button type="button" className="btn small primary" onClick={onOpen}>Start today's prep</button>
      </div>
      {ov.needsWork.length > 0 && (
        <div className="prep-w-weak">
          <span className="eyebrow">Weakest</span>
          {ov.needsWork.slice(0, 3).map((p) => (
            <span className="prep-w-row" key={p.pattern}>
              <span className="prep-w-name">{p.pattern}</span>
              <span className="prep-w-track"><span className="prep-w-fill" style={{ width: `${p.readiness}%` }} /></span>
              <span className="prep-w-n mono">{p.readiness}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
