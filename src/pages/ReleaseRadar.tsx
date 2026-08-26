import { useEffect, useState } from "react";
import { openExternal } from "../lib/open";
import { useNavigate } from "react-router-dom";
import { getReleaseRadar, type RadarEntry, type RadarState } from "../release/radar";
import { confidenceLabel } from "../release/history";
import { getPrefs } from "../ranking/prefs";
import { PRIORITY_LABEL } from "../ranking/companies";
import { createApplication } from "../db/applications";
import { listContacts } from "../db/contacts";
import { listReferrals } from "../db/referrals";
import { listAllEmployment, type ContactEmployment } from "../db/contactHistory";
import { getProfile } from "../db/profile";
import { buildMission, PHASE_LABEL, getMissionState, setMissionState, type Mission } from "../release/missions";
import { getLiveOpenings, detectLiveOpenings, getCachedLiveOpenings, type LiveOpening } from "../release/live";
import { reportError } from "../lib/report";
import PeopleFinder from "../components/PeopleFinder";
import CompanyLogo from "../components/CompanyLogo";
import type { ContactRow, Profile, ReferralRow } from "../db/types";

const STATE_LABEL: Record<RadarState, string> = {
  open: "Confirmed open", signal: "Early signal", forecast: "Forecasted", none: "No data yet",
};

function fmt(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ReleaseRadar() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<RadarEntry[] | null>(null);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [employment, setEmployment] = useState<ContactEmployment[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [peopleTarget, setPeopleTarget] = useState<{ company: string; contacts: ContactRow[] } | null>(null);
  const targetSeason = getPrefs().targetSeason;

  useEffect(() => {
    getReleaseRadar()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    refreshNetwork();
  }, []);

  function refreshNetwork() {
    Promise.all([listContacts(), listReferrals(), listAllEmployment(), getProfile()])
      .then(([c, r, e, p]) => { setContacts(c); setReferrals(r); setEmployment(e); setProfile(p); })
      .catch((e) => reportError("radar: load network", e));
  }

  function companyContactsFor(company: string): ContactRow[] {
    const lc = company.toLowerCase();
    const histIds = new Set(employment.filter((e) => e.company.toLowerCase() === lc).map((e) => e.contact_id));
    return contacts.filter((c) => (c.company_name ?? "").toLowerCase() === lc || histIds.has(c.id));
  }
  function missionFor(e: RadarEntry): Mission {
    const rr = referrals.filter((r) => (r.company_name ?? "").toLowerCase() === e.company.toLowerCase());
    return buildMission(e, companyContactsFor(e.company), rr, profile);
  }
  function employmentMap(): Map<number, ContactEmployment[]> {
    const m = new Map<number, ContactEmployment[]>();
    for (const e of employment) { const a = m.get(e.contact_id) ?? []; a.push(e); m.set(e.contact_id, a); }
    return m;
  }

  if (error) {
    return (
      <div className="radar">
        <div className="page-header"><div><h1>Release Radar</h1></div></div>
        <p className="hint text-red">Couldn't load forecasts: {error}</p>
      </div>
    );
  }
  if (!entries) {
    return (
      <div className="radar">
        <div className="page-header"><div><h1>Release Radar</h1><p>Estimating opening windows…</p></div></div>
        <p className="hint">Reading last cycle's opening dates…</p>
      </div>
    );
  }

  async function applyOpen(e: RadarEntry) {
    const ol = e.openListing;
    if (!ol) return;
    try {
      await createApplication({
        company_name: e.company, role_title: ol.title, job_link: ol.url,
        location: ol.location, status: "applied", date_applied: new Date().toISOString().slice(0, 10),
        source: "radar", company_priority: e.priority,
      });
    } catch (err) { console.error(err); }
    openExternal(ol.url).catch(console.error);
  }

  const open = entries.filter((e) => e.state === "open");
  const soon = entries.filter((e) => e.state !== "open" && (e.state === "signal" || (e.forecast && (e.probabilityNext7 > 0 || (e.daysUntilWindow != null && e.daysUntilWindow <= 45)))));
  const watching = entries.filter((e) => !open.includes(e) && !soon.includes(e));

  return (
    <div className="radar">
      <div className="page-header">
        <div>
          <h1>Release Radar</h1>
          <p>Likely opening windows for your watchlist, from last cycle's dates. Estimates — not live listings.</p>
        </div>
      </div>

      <p className="radar-disclaimer">
        InternPilot can't know the exact release date. It estimates the most likely window from several past cycles,
        flags public early signals, and helps you get ready before {targetSeason} roles open.
      </p>

      <LiveOpenings />

      <Section title="Already open" hint="A target-season role is posted right now.">
        {open.length === 0 ? <Empty text="Nothing from your watchlist is open yet." /> :
          open.map((e) => <RadarCard key={e.company} e={e} onApply={applyOpen} navigate={navigate} mission={missionFor(e)} onFindPeople={() => setPeopleTarget({ company: e.company, contacts: companyContactsFor(e.company) })} />)}
      </Section>

      <Section title="Opening soon" hint="Inside or approaching the historical window, or already showing early signals.">
        {soon.length === 0 ? <Empty text="No companies are in their opening window right now." /> :
          soon.map((e) => <RadarCard key={e.company} e={e} onApply={applyOpen} navigate={navigate} mission={missionFor(e)} onFindPeople={() => setPeopleTarget({ company: e.company, contacts: companyContactsFor(e.company) })} />)}
      </Section>

      <Section title="On the radar" hint="Forecasted further out, or awaiting first-cycle data.">
        {watching.map((e) => <RadarCard key={e.company} e={e} onApply={applyOpen} navigate={navigate} mission={missionFor(e)} onFindPeople={() => setPeopleTarget({ company: e.company, contacts: companyContactsFor(e.company) })} />)}
      </Section>

      {peopleTarget && (
        <PeopleFinder
          company={peopleTarget.company}
          title="Software Engineer Intern"
          profile={profile}
          contacts={peopleTarget.contacts}
          referrals={referrals.filter((r) => (r.company_name ?? "").toLowerCase() === peopleTarget.company.toLowerCase())}
          employment={employmentMap()}
          onSaved={refreshNetwork}
          onClose={() => setPeopleTarget(null)}
        />
      )}
    </div>
  );
}

function agoLabel(sec: number | null): string {
  if (!sec) return "";
  const hrs = Math.floor((Date.now() / 1000 - sec) / 3600);
  if (hrs < 1) return "just posted";
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
function polledLabel(ms: number | null): string {
  if (!ms) return "";
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

/**
 * Ground truth: real internship postings read live from watchlist companies' ATS
 * boards (see release/live.ts). A hit here beats every forecast — the role is open
 * today, with a direct apply link.
 */
function LiveOpenings() {
  const [items, setItems] = useState<LiveOpening[] | null>(null);
  const [polling, setPolling] = useState(false);
  const [polledAt, setPolledAt] = useState<number | null>(null);

  useEffect(() => {
    const cached = getCachedLiveOpenings();
    if (cached) { setItems(cached.openings); setPolledAt(cached.polledAt); }
    getLiveOpenings()
      .then((o) => { setItems(o); setPolledAt(getCachedLiveOpenings()?.polledAt ?? Date.now()); })
      .catch(() => setItems((prev) => prev ?? []));
  }, []);

  async function refresh() {
    setPolling(true);
    try { setItems(await detectLiveOpenings()); setPolledAt(Date.now()); }
    catch { /* keep prior */ }
    finally { setPolling(false); }
  }

  async function applyLive(o: LiveOpening) {
    try {
      await createApplication({
        company_name: o.company, role_title: o.title, job_link: o.url,
        location: o.location, status: "applied", date_applied: new Date().toISOString().slice(0, 10),
        source: "live-ats", company_priority: o.priority,
        posting_posted_at: o.postedAt ? new Date(o.postedAt * 1000).toISOString() : null,
      });
    } catch (err) { console.error(err); }
    openExternal(o.url).catch(console.error);
  }

  const newCount = items?.filter((o) => o.isNew).length ?? 0;

  return (
    <div className="radar-section radar-live">
      <div className="radar-sec-head">
        <h2>Live now {items && items.length > 0 && <span className="live-dot" aria-hidden />}</h2>
        <span>
          Real postings, filtered to your target — <b>{getPrefs().targetSeason}</b> internships at your level{newCount > 0 ? ` · ${newCount} new` : ""}
          {polledAt ? ` · checked ${polledLabel(polledAt)}` : ""}
        </span>
        <button type="button" className="btn small" onClick={refresh} disabled={polling} style={{ marginLeft: "auto" }}>
          {polling ? "Checking…" : "Check now"}
        </button>
      </div>
      {items === null ? (
        <p className="hint">Checking company career pages…</p>
      ) : items.length === 0 ? (
        <Empty text="No live internship postings on your watchlist's boards right now. This reads Greenhouse/Lever/Ashby directly — add more target companies to widen coverage." />
      ) : (
        <div className="live-list">
          {items.slice(0, 12).map((o) => (
            <div className={`live-item ${o.priority}`} key={o.url}>
              <CompanyLogo company={o.company} />
              <div className="live-tx">
                <div className="live-co">
                  <b>{o.company}</b>
                  {o.isNew && <span className="live-new">NEW</span>}
                  {o.postedAt && <span className="live-age">{agoLabel(o.postedAt)}</span>}
                </div>
                <span className="live-title">{o.title}</span>
                {o.location && <span className="live-loc">{o.location}</span>}
              </div>
              <button type="button" className="btn small primary" onClick={() => applyLive(o)}>Apply ↗</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MissionBlock({ company, mission, onFindPeople }: { company: string; mission: Mission; onFindPeople: () => void }) {
  const [done, setDone] = useState<Record<string, boolean>>(() => getMissionState(company));
  const toggle = (id: string) => setDone((p) => { const n = { ...p, [id]: !p[id] }; setMissionState(company, n); return n; });
  return (
    <div className="mission">
      <p className="mission-head">{mission.headline}</p>
      {mission.best ? (
        <div className="mission-best">
          <span className="eyebrow">Best contact</span>
          <div className="mission-bp"><b>{mission.best.path}</b><span className="mission-score">{mission.best.scored.score}</span></div>
          {mission.referralStatusLabel && <span className="mission-ref">Referral: {mission.referralStatusLabel}</span>}
        </div>
      ) : (
        <p className="mission-none">No warm contact here yet — use Find people to start ({mission.savedCount} saved).</p>
      )}
      <div className="mission-tasks">
        {mission.tasks.map((t) => (
          <label key={t.id} className={"mission-task" + (done[t.id] ? " on" : "")}>
            <input type="checkbox" checked={!!done[t.id]} onChange={() => toggle(t.id)} /><span>{t.label}</span>
          </label>
        ))}
      </div>
      <button type="button" className="btn small" onClick={onFindPeople}>Find people</button>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="radar-section">
      <div className="radar-sec-head"><h2>{title}</h2><span>{hint}</span></div>
      <div className="radar-list">{children}</div>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="muted-note" style={{ padding: "6px 2px" }}>{text}</p>;
}

const PREP_ITEMS = [
  "Finalize the target résumé",
  "Identify alumni / employee contacts",
  "Review last cycle's application questions",
  "Prepare a referral message",
  "Verify work authorization & portfolio links",
  "Set notifications to instant",
];

function RadarCard({ e, onApply, navigate, mission, onFindPeople }: { e: RadarEntry; onApply: (e: RadarEntry) => void; navigate: (p: string) => void; mission: Mission; onFindPeople: () => void }) {
  const f = e.forecast;
  return (
    <article className={`radar-card state-${e.state}`}>
      <CompanyLogo company={e.company} />
      <div className="radar-main">
        <div className="radar-head">
          <div className="radar-co">
            {e.company}
            {e.priority !== "normal" && <span className={`prio ${e.priority}`}>{PRIORITY_LABEL[e.priority]}</span>}
            <span className={`rstate ${e.state}`}>{STATE_LABEL[e.state]}</span>
          </div>
          {e.state !== "open" && f && (
            <div className="radar-prob"><b>{Math.round(e.probabilityNext7 * 100)}%</b><span>next 7 days</span></div>
          )}
        </div>

        {f ? (
          <div className="radar-window">
            {e.state !== "open" && (
              <div className="radar-reachout">
                <span className="eyebrow">Reach out by</span>
                <b>{fmt(f.outreachBy)}</b>
                {e.daysUntilOutreach != null && <em>{e.daysUntilOutreach > 0 ? `~${e.daysUntilOutreach} days` : "now — don't wait"}</em>}
              </div>
            )}
            <b>{fmt(f.windowStart)} – {fmt(f.windowEnd)}</b>
            <span>likely opening · typical {fmt(f.typical)} · {confidenceLabel(f.confidence)} ({f.confidence}%)</span>
            {e.state !== "open" && <span className="mon">Monitoring: {e.monitoring}</span>}
          </div>
        ) : (
          <div className="radar-window"><span>No historical window yet — InternPilot will learn this company's timing as it observes this cycle.</span></div>
        )}

        <details className="radar-why">
          <summary>Why</summary>
          <ul>{e.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </details>

        {e.state !== "open" && (
          <details className="radar-prep">
            <summary>Pre-release checklist</summary>
            <PrepChecklist companyKey={e.company} />
          </details>
        )}

        {mission.phase !== "watch" && (
          <details className="radar-mission" open={mission.phase === "apply"}>
            <summary>Networking mission · {PHASE_LABEL[mission.phase]}</summary>
            <MissionBlock company={e.company} mission={mission} onFindPeople={onFindPeople} />
          </details>
        )}

        <div className="radar-actions">
          {e.state === "open" && e.openListing ? (
            <>
              <button type="button" className="btn small primary" onClick={() => onApply(e)}>Apply &amp; record</button>
              <button type="button" className="btn small" onClick={() => navigate(`/packet?job=${encodeURIComponent(e.openListing!.id)}`)}>Prepare</button>
            </>
          ) : (
            <>
              <button type="button" className="btn small" onClick={() => navigate("/networking")}>Line up a referral</button>
              <button type="button" className="btn small" onClick={() => navigate("/resumes")}>Prep résumé</button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function PrepChecklist({ companyKey }: { companyKey: string }) {
  const key = `internpilot.release.prep.${companyKey.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const [done, setDone] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { return new Set(); }
  });
  function toggle(i: number) {
    const next = new Set(done);
    if (next.has(i)) next.delete(i); else next.add(i);
    setDone(next);
    localStorage.setItem(key, JSON.stringify([...next]));
  }
  return (
    <ul className="prep-check">
      {PREP_ITEMS.map((item, i) => (
        <li key={i}>
          <label>
            <input type="checkbox" checked={done.has(i)} onChange={() => toggle(i)} />
            <span className={done.has(i) ? "checked" : ""}>{item}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
