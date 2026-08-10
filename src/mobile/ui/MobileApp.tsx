import { useEffect, useRef, useState, type ReactNode } from "react";
import CompanyLogo from "../../components/CompanyLogo";
import { openExternal } from "../../lib/open";
import { getFeed } from "../../listings/service";
import { getOpportunityQueue } from "../../ranking/queue";
import { listApplications, createApplication } from "../../db/applications";
import { listResumeVersions } from "../../db/resumes";
import { getProfile } from "../../db/profile";
import {
  getStatusCounts, getFunnelRates, getResumeVersionPerformance,
  type StatusCounts, type FunnelRates, type ResumeVersionPerf,
} from "../../db/metrics";
import { askChat, type ChatMessage } from "../../ai/chat";
import { cloudSignOut } from "../../cloud/auth";
import type { RankedListing } from "../../listings/types";
import type { ApplicationRow, Profile, ResumeVersion, Status } from "../../db/types";
import { initials, daysSince, postedShort, bandColor } from "./mshared";
import "./mobile.css";

type Tab = "home" | "jobs" | "tracker" | "toolkit" | "coach";
interface TabProps { avatar: string; onSheet: () => void; go: (t: Tab) => void }

// ── icons ────────────────────────────────────────────────────────────────
const I = {
  home: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z" /></svg>,
  jobs: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>,
  tracker: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>,
  toolkit: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /></svg>,
  coach: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M21 12a8 8 0 01-11.4 7.2L4 20.5l1.3-5.4A8 8 0 1121 12z" /></svg>,
  clock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>,
  bookmark: (on: boolean) => <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /></svg>,
  send: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 3 3 10.5l7 3 3 7z" /></svg>,
  pen: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>,
  book: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 016.5 3H19v15H6.5A2.5 2.5 0 004 20.5z" /></svg>,
  people: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><circle cx="18" cy="9" r="2.2" /></svg>,
  bullets: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="5" cy="7" r="1.4" /><circle cx="5" cy="12" r="1.4" /><circle cx="5" cy="17" r="1.4" /><path d="M10 7h10M10 12h10M10 17h6" /></svg>,
  briefcase: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" /></svg>,
  answers: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 016.5 3H19v15H6.5A2.5 2.5 0 004 20.5z" /></svg>,
  signout: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M15 12H5" /></svg>,
};

const STATUS_C: Record<Status, string> = {
  interested: "--s-interested", applied: "--s-applied", oa: "--s-oa",
  interview: "--s-interview", offer: "--s-offer", rejected: "--muted-2",
};

function Empty({ label }: { label: string }) { return <div className="empty">{label}</div>; }

// ── shell ──────────────────────────────────────────────────────────────────
export default function MobileApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    getProfile().then(setProfile).catch(console.error);
    getStatusCounts().then((c) => setBadge(c.oa + c.interview)).catch(console.error);
  }, []);

  const name = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || profile?.email || "";
  const avatar = initials(name);
  const props: TabProps = { avatar, onSheet: () => setSheet(true), go: setTab };

  return (
    <div className="m-shell">
      {tab === "home" && <Home {...props} />}
      {tab === "jobs" && <Jobs {...props} />}
      {tab === "tracker" && <Tracker {...props} />}
      {tab === "toolkit" && <Toolkit {...props} />}
      {tab === "coach" && <Coach {...props} />}

      <nav className="tabbar">
        {([["home", "Home", I.home], ["jobs", "Jobs", I.jobs], ["tracker", "Tracker", I.tracker], ["toolkit", "Toolkit", I.toolkit], ["coach", "Coach", I.coach]] as const).map(([k, label, icon]) => (
          <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
            {icon}<span>{label}</span>
            {k === "tracker" && badge > 0 && <em className="badge">{badge}</em>}
          </button>
        ))}
      </nav>

      {sheet && <AvatarSheet profile={profile} onClose={() => setSheet(false)} />}
    </div>
  );
}

// ── Home ────────────────────────────────────────────────────────────────────
function Home({ avatar, onSheet, go }: TabProps) {
  const [today, setToday] = useState<RankedListing[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    getOpportunityQueue().then((q) => { setToday(q.today); setTodayCount(q.counts.today); }).catch(console.error);
    getStatusCounts().then(setCounts).catch(console.error);
    listApplications().then(setApps).catch(console.error);
  }, []);

  const quiet = apps.find((a) => a.status === "applied" && (daysSince(a.date_applied) ?? 0) >= 10);
  const topApply = today[0];
  const dayName = new Date().toLocaleDateString(undefined, { weekday: "long" });
  const sent7 = apps.filter((a) => a.date_applied && (daysSince(a.date_applied) ?? 99) <= 7).length;
  const pipe: [Status, string][] = [["interested", "Saved"], ["applied", "Applied"], ["oa", "OA"], ["interview", "Interview"], ["offer", "Offer"]];

  return (
    <div className="m-scroll">
      <header className="apphead"><div className="row">
        <div><h2>{dayName}</h2><div className="sub">{sent7} application{sent7 === 1 ? "" : "s"} out this week</div></div>
        <button className="avatar" onClick={onSheet}>{avatar}</button>
      </div></header>

      <div className="pad">
        <div className="today">
          <span className="eyebrow">Do this first</span>
          {quiet && !skipped ? (
            <>
              <h3>Follow up with {quiet.company_name ?? "a quiet application"}</h3>
              <p>Applied {daysSince(quiet.date_applied)} days ago with no reply — time for a nudge.</p>
              <div className="acts">
                <button className="btn primary" onClick={() => go("coach")}>Draft the email</button>
                <button className="btn ghost" onClick={() => setSkipped(true)}>Skip</button>
              </div>
            </>
          ) : topApply ? (
            <>
              <h3>Apply to {topApply.company}</h3>
              <p>{topApply.title} — your strongest match in the queue right now ({topApply.score}).</p>
              <div className="acts">
                <button className="btn primary" onClick={() => openExternal(topApply.url)}>Open &amp; apply</button>
                <button className="btn ghost" onClick={() => go("jobs")}>See queue</button>
              </div>
            </>
          ) : (
            <>
              <h3>You're all caught up</h3>
              <p>No urgent actions. Browse new roles to keep the funnel full.</p>
              <div className="acts"><button className="btn primary" onClick={() => go("jobs")}>Browse jobs</button></div>
            </>
          )}
        </div>
      </div>

      {today.length > 0 && (
        <>
          <div className="sechead"><h3>New today</h3><button className="more" onClick={() => go("jobs")}>See {todayCount} →</button></div>
          <div className="jobs">{today.slice(0, 2).map((o) => <JobCard key={o.id} o={o} />)}</div>
        </>
      )}

      {counts && (
        <>
          <div className="sechead"><h3>Pipeline</h3><button className="more" onClick={() => go("tracker")}>Tracker →</button></div>
          <div className="pad"><div className="card"><div className="pipe">
            {pipe.map(([k, label]) => (
              <div className="st" key={k} style={{ ["--c" as string]: `var(${STATUS_C[k]})` }}><i /><b>{counts[k]}</b><span>{label}</span></div>
            ))}
          </div></div></div>
        </>
      )}

      <div className="sechead"><h3>Focus session</h3></div>
      <div className="pad" style={{ paddingBottom: 24 }}>
        <div className="card focusrow">
          <span className="ficon">{I.clock}</span>
          <span className="ftx">
            <b>25 minutes, {Math.min(3, today.length)} application{Math.min(3, today.length) === 1 ? "" : "s"}</b>
            <span>{today.length > 0 ? "Queue is ready to go" : "Nothing queued yet"}</span>
          </span>
          <button className="btn sm primary" onClick={() => go("jobs")}>Start</button>
        </div>
      </div>
    </div>
  );
}

// ── Jobs ────────────────────────────────────────────────────────────────────
function Jobs({ avatar, onSheet }: TabProps) {
  const [seg, setSeg] = useState<"browse" | "saved" | "queue">("browse");
  const [feed, setFeed] = useState<RankedListing[]>([]);
  const [queue, setQueue] = useState<RankedListing[]>([]);
  const [savedApps, setSavedApps] = useState<ApplicationRow[]>([]);
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  async function reloadSaved() {
    const a = await listApplications();
    setSavedApps(a.filter((x) => x.status === "interested"));
    setSavedUrls(new Set(a.map((x) => x.job_link).filter((x): x is string => !!x)));
  }
  useEffect(() => {
    getFeed().then((f) => setFeed(f.listings)).catch(console.error).finally(() => setLoading(false));
    getOpportunityQueue().then((q) => setQueue(q.today)).catch(console.error);
    reloadSaved().catch(console.error);
  }, []);

  async function save(o: RankedListing) {
    if (savedUrls.has(o.url)) return;
    setSavedUrls((s) => new Set(s).add(o.url)); // optimistic
    await createApplication({ company_name: o.company, role_title: o.title, job_link: o.url, location: o.locations.join(", "), status: "interested", resume_version_id: null });
    reloadSaved().catch(console.error);
  }

  const list = seg === "browse" ? feed.slice(0, 60) : seg === "queue" ? queue : [];

  return (
    <div className="m-scroll">
      <header className="apphead"><div className="row">
        <div><h2>Jobs</h2><div className="sub">{feed.length.toLocaleString()} in your feed</div></div>
        <button className="avatar" onClick={onSheet}>{avatar}</button>
      </div></header>

      <div className="seg">
        <button className={seg === "browse" ? "on" : ""} onClick={() => setSeg("browse")}>Browse</button>
        <button className={seg === "saved" ? "on" : ""} onClick={() => setSeg("saved")}>Saved <span className="n">{savedApps.length}</span></button>
        <button className={seg === "queue" ? "on" : ""} onClick={() => setSeg("queue")}>Queue <span className="n">{queue.length}</span></button>
      </div>

      <div className="jobs" style={{ paddingBottom: 24 }}>
        {seg === "saved" ? (
          savedApps.length ? savedApps.map((a) => <SavedCard key={a.id} a={a} />) : <Empty label="Nothing saved yet. Tap the bookmark on a role to keep it here." />
        ) : loading && seg === "browse" ? (
          <Empty label="Loading your feed…" />
        ) : list.length ? (
          list.map((o) => <JobCard key={o.id} o={o} saved={savedUrls.has(o.url)} onSave={() => save(o)} />)
        ) : (
          <Empty label={seg === "queue" ? "Your queue is clear — nice." : "No roles match right now."} />
        )}
      </div>
    </div>
  );
}

function JobCard({ o, saved, onSave }: { o: RankedListing; saved?: boolean; onSave?: () => void }) {
  const ago = postedShort(o.datePosted);
  return (
    <button type="button" className="job" onClick={() => openExternal(o.url)}>
      <div className="job-top">
        <CompanyLogo company={o.company} />
        <span className="org"><b>{o.company}</b><span>{o.locations[0] ?? "—"}{ago ? ` · ${ago}` : ""}</span></span>
        {onSave && <span className={"bk" + (saved ? " on" : "")} onClick={(e) => { e.stopPropagation(); onSave(); }}>{I.bookmark(!!saved)}</span>}
      </div>
      <h4>{o.title}</h4>
      <div className="facts">
        {o.salary ? <span className="fact pay">{o.salary}</span> : <span className="fact na">Pay not listed</span>}
        {o.season && <span className="fact">{o.season}</span>}
        {o.remote && <span className="fact">Remote</span>}
        {!o.sponsorshipOk && <span className="fact na">No sponsorship</span>}
      </div>
      <div className="job-foot">
        <span className="posted">{ago ? `Posted ${ago}` : "Recently"}</span>
        <span className="matchpill" style={{ ["--c" as string]: bandColor(o.score) }}><i />{o.score}</span>
      </div>
    </button>
  );
}

function SavedCard({ a }: { a: ApplicationRow }) {
  return (
    <button type="button" className="job" onClick={() => a.job_link && openExternal(a.job_link)}>
      <div className="job-top">
        <CompanyLogo company={a.company_name ?? "?"} />
        <span className="org"><b>{a.company_name ?? "—"}</b><span>{a.location || "Saved"}</span></span>
      </div>
      <h4>{a.role_title}</h4>
      <div className="facts"><span className="fact">Saved</span></div>
    </button>
  );
}

// ── Tracker ─────────────────────────────────────────────────────────────────
function Tracker({ avatar, onSheet }: TabProps) {
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [seg, setSeg] = useState<"active" | "replies" | "closed">("active");
  useEffect(() => { listApplications().then(setApps).catch(console.error); }, []);

  const active = apps.filter((a) => a.status !== "rejected");
  const replies = apps.filter((a) => ["oa", "interview", "offer"].includes(a.status));
  const closed = apps.filter((a) => a.status === "rejected");
  const offers = apps.filter((a) => a.status === "offer").length;

  const needs = active.filter((a) => ["oa", "interview"].includes(a.status));
  const quiet = active.filter((a) => a.status === "applied" && (daysSince(a.date_applied) ?? 0) >= 10);
  const skip = new Set([...needs, ...quiet].map((a) => a.id));
  const inflight = active.filter((a) => !skip.has(a.id));

  return (
    <div className="m-scroll">
      <header className="apphead"><div className="row">
        <div><h2>Tracker</h2><div className="sub">{apps.length} role{apps.length === 1 ? "" : "s"} · {offers} offer{offers === 1 ? "" : "s"}</div></div>
        <button className="avatar" onClick={onSheet}>{avatar}</button>
      </div></header>

      <div className="seg">
        <button className={seg === "active" ? "on" : ""} onClick={() => setSeg("active")}>Active <span className="n">{active.length}</span></button>
        <button className={seg === "replies" ? "on" : ""} onClick={() => setSeg("replies")}>Replies <span className="n">{replies.length}</span></button>
        <button className={seg === "closed" ? "on" : ""} onClick={() => setSeg("closed")}>Closed <span className="n">{closed.length}</span></button>
      </div>

      {seg === "active" ? (
        active.length === 0 ? <Empty label="No active applications yet. Save and apply to roles in Jobs." /> : (
          <>
            {needs.length > 0 && <Group label="Needs action" n={needs.length}>{needs.map((a) => <AppCard key={a.id} a={a} />)}</Group>}
            {quiet.length > 0 && <Group label="Gone quiet" n={quiet.length}>{quiet.map((a) => <AppCard key={a.id} a={a} />)}</Group>}
            {inflight.length > 0 && <Group label="In flight" n={inflight.length}>{inflight.map((a) => <AppCard key={a.id} a={a} />)}</Group>}
          </>
        )
      ) : (
        (() => {
          const shown = seg === "replies" ? replies : closed;
          return shown.length ? <div className="pad" style={{ paddingTop: 12, paddingBottom: 24 }}>{shown.map((a) => <AppCard key={a.id} a={a} />)}</div>
            : <Empty label={seg === "replies" ? "No replies yet — keep applying." : "Nothing closed out."} />;
        })()
      )}
    </div>
  );
}

function Group({ label, n, children }: { label: string; n: number; children: ReactNode }) {
  return (
    <>
      <div className="grouplabel"><span className="eyebrow">{label}</span><i /><b>{n}</b></div>
      <div className="pad">{children}</div>
    </>
  );
}

function AppCard({ a }: { a: ApplicationRow }) {
  const d = daysSince(a.date_applied ?? a.date_saved);
  const label = a.status === "offer" ? "offer" : a.status === "oa" ? "OA due" : a.status === "interview" ? "interview"
    : a.status === "rejected" ? "closed" : a.status === "applied" ? (d != null && d >= 10 ? "no reply" : "applied") : "saved";
  const warn = ["oa", "interview"].includes(a.status);
  return (
    <button type="button" className="appcard" style={{ ["--c" as string]: `var(${STATUS_C[a.status]})` }} onClick={() => a.job_link && openExternal(a.job_link)}>
      <CompanyLogo company={a.company_name ?? "?"} />
      <span className="tx"><b>{a.company_name ?? "—"}</b><span>{a.role_title}</span></span>
      <span className={"age" + (warn ? " warn" : "")}><b>{a.status === "offer" ? "Offer" : d != null ? `${d}d` : "—"}</b>{label}</span>
    </button>
  );
}

// ── Toolkit ─────────────────────────────────────────────────────────────────
function Toolkit({ avatar, onSheet }: TabProps) {
  const [perf, setPerf] = useState<ResumeVersionPerf[]>([]);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  useEffect(() => {
    getResumeVersionPerformance().then(setPerf).catch(console.error);
    listResumeVersions().then(setResumes).catch(console.error);
  }, []);

  const rows: ResumeVersionPerf[] = perf.length ? perf : resumes.map((r) => ({ id: r.id, name: r.name, total: 0, reachedOa: 0, reachedInterview: 0, offers: 0 }));
  const best = rows.reduce<ResumeVersionPerf | null>((b, p) => (p.total > 0 && (!b || p.reachedOa / p.total > (b.reachedOa || 0) / (b.total || 1)) ? p : b), null);

  return (
    <div className="m-scroll">
      <header className="apphead"><div className="row">
        <div><h2>Toolkit</h2><div className="sub">What you reuse across applications</div></div>
        <button className="avatar" onClick={onSheet}>{avatar}</button>
      </div></header>

      <div className="sechead" style={{ marginTop: 6 }}><h3>Résumés</h3></div>
      <div className="pad">
        <div className="resumecard">
          {rows.length === 0 ? <p className="mnote">No résumés yet — add one in Résumé Center on desktop.</p> : rows.map((p, i) => {
            const rate = p.total > 0 ? Math.round((p.reachedOa / p.total) * 100) : 0;
            const c = i === 0 ? "--good" : i === 1 ? "--accent" : "--muted-2";
            return (
              <div className="rver" key={p.id}>
                <span className="dot" style={{ ["--c" as string]: `var(${c})` }} />
                <span className="tx"><b>{p.name}{best && best.id === p.id && p.total > 0 ? <span className="best">Best</span> : null}</b><span>{p.total} app{p.total === 1 ? "" : "s"}</span></span>
                <span className="rate">{rate}%<small>reply</small></span>
              </div>
            );
          })}
          <p className="mnote" style={{ paddingBottom: 0 }}>Résumé Lab &amp; editing are best on the desktop app.</p>
        </div>
      </div>

      <div className="sechead"><h3>Building blocks</h3></div>
      <div className="pad" style={{ paddingBottom: 24 }}>
        <div className="tool"><span className="ic b">{I.bullets}</span><span className="tx"><b>Bullets</b><span>Reusable lines from your projects</span></span><span className="tag">desktop</span></div>
        <div className="tool"><span className="ic c">{I.briefcase}</span><span className="tx"><b>Experiences</b><span>Jobs, projects and coursework</span></span><span className="tag">desktop</span></div>
        <div className="tool"><span className="ic d">{I.answers}</span><span className="tx"><b>Saved answers</b><span>"Why this company", work authorization</span></span><span className="tag">desktop</span></div>
      </div>
    </div>
  );
}

// ── Coach ───────────────────────────────────────────────────────────────────
function Coach({ avatar, onSheet }: TabProps) {
  const [rates, setRates] = useState<FunnelRates | null>(null);
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [perf, setPerf] = useState<ResumeVersionPerf[]>([]);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getFunnelRates().then(setRates).catch(console.error);
    getStatusCounts().then(setCounts).catch(console.error);
    getResumeVersionPerformance().then(setPerf).catch(console.error);
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    const next: ChatMessage[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setBusy(true);
    try {
      const a = await askChat(q, msgs);
      setMsgs([...next, { role: "assistant", content: a }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: e instanceof Error ? e.message : String(e) }]);
    } finally { setBusy(false); }
  }

  const applied = counts ? counts.total - counts.interested : 0;
  const twoPerf = perf.filter((p) => p.total > 0).slice(0, 2);
  const bullets: string[] = [];
  if (rates && applied > 0) bullets.push(`Interview rate is ${rates.interviewRate}% across ${applied} submitted application${applied === 1 ? "" : "s"}.`);
  if (counts && counts.interested > 0) bullets.push(`${counts.interested} saved role${counts.interested === 1 ? "" : "s"} haven't been applied to yet.`);
  if (twoPerf.length === 2) {
    const [x, y] = twoPerf;
    const rx = x.total ? x.reachedOa / x.total : 0, ry = y.total ? y.reachedOa / y.total : 0;
    const better = rx >= ry ? x : y;
    bullets.push(`Résumé "${better.name}" is converting best — lean on it for similar roles.`);
  }
  if (bullets.length === 0) bullets.push("Apply to a few roles and your funnel stats will show up here.");
  const headline = applied === 0 ? "Let's get your first applications out." : rates && rates.interviewRate >= 15
    ? "Your applications convert well — the lever now is volume." : "Steady progress — keep the funnel full and tighten your résumé.";

  return (
    <>
      <div className="m-scroll">
        <header className="apphead"><div className="row">
          <div><h2>Coach</h2><div className="sub">Reads your funnel, not the internet</div></div>
          <button className="avatar" onClick={onSheet}>{avatar}</button>
        </div></header>

        <div className="pad">
          <div className="coachcard">
            <span className="eyebrow">This week</span>
            <h3>{headline}</h3>
            <ul>{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
        </div>

        {msgs.length === 0 ? (
          <>
            <div className="sechead"><h3>Quick help</h3></div>
            <div className="pad" style={{ paddingBottom: 20 }}>
              <div className="prompts">
                <button className="prompt" onClick={() => send("Draft a short, friendly follow-up email for an application that's gone quiet for two weeks.")}>
                  <span className="ic b">{I.pen}</span><span className="tx"><b>Draft a follow-up</b><span>For an application that's gone quiet</span></span>
                </button>
                <button className="prompt" onClick={() => send("Based on my funnel, what should I focus on this week to get more interviews?")}>
                  <span className="ic a">{I.book}</span><span className="tx"><b>Plan my week</b><span>What to focus on to get interviews</span></span>
                </button>
                <button className="prompt" onClick={() => send("Help me write a concise referral request message to someone at a company I applied to.")}>
                  <span className="ic d">{I.people}</span><span className="tx"><b>Write a referral ask</b><span>A concise, warm outreach message</span></span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="pad chat">
            {msgs.map((m, i) => <div key={i} className={"bubble " + m.role}>{m.content}</div>)}
            {busy && <div className="bubble assistant">Thinking…</div>}
            <div ref={endRef} />
          </div>
        )}
        <div style={{ height: 12 }} />
      </div>

      <div className="askbar">
        <input className="fld" placeholder="Ask about your search…" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <button className="send" onClick={() => send()} disabled={busy || !input.trim()}>{I.send}</button>
      </div>
    </>
  );
}

// ── Avatar sheet ────────────────────────────────────────────────────────────
function AvatarSheet({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const name = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || profile?.email || "Your profile";
  const sub = profile?.grad_year ? `Class of ${profile.grad_year}` : profile?.target_date ? "Job search in progress" : "Finish setting up your profile";
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="msheet">
        <div className="grabber" />
        <div className="mprofile">
          <span className="av">{initials(name)}</span>
          <span className="tx"><b>{name}</b><span>{sub}</span></span>
        </div>
        <p className="mnote">Profile, settings, and feed sources are best edited in the desktop app — this phone view is for browsing, tracking, and quick coaching.</p>
        <button className="mrow danger" onClick={() => { cloudSignOut().catch(console.error); onClose(); }}>
          <span className="ic">{I.signout}</span>
          <span className="tx"><b>Sign out</b><span>{profile?.email ?? ""}</span></span>
        </button>
      </div>
    </>
  );
}
