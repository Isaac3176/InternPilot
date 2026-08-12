import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openExternal } from "../lib/open";
import { createApplication, listApplications } from "../db/applications";
import { listContacts } from "../db/contacts";
import { listReferrals } from "../db/referrals";
import { listAllEmployment, type ContactEmployment } from "../db/contactHistory";
import { extractTeam } from "../networking/connections";
import { bestConnection } from "../networking/graph";
import { matchCompany, trackFor, TRACK_LABEL, PRIORITY_LABEL, type TargetCompany } from "../ranking/companies";
import { getProfile } from "../db/profile";
import { getFeed } from "../listings/service";
import { fetchJobDescription } from "../listings/description";
import { jdSkillMatch } from "../listings/match";
import { assessEligibility } from "../listings/eligibility";
import { getResumeVersion } from "../db/resumes";
import type { RankedListing } from "../listings/types";
import type { ApplicationRow, ContactRow, Profile, ReferralRow, Status } from "../db/types";
import FilterPill from "../components/FilterPill";
import ReadinessGauge from "../components/ReadinessGauge";
import CompanyLogo from "../components/CompanyLogo";
import PeopleFinder from "../components/PeopleFinder";

const MAX_SHOWN = 200;
const JOB_TYPES = ["Internship", "Co-op", "Full-time"] as const;
type JobType = (typeof JOB_TYPES)[number];

const STAGES = ["Saved", "Applied", "Assessment", "Interview", "Offer"];
const STATUS_STAGE: Record<Status, number> = {
  interested: 0, applied: 1, oa: 2, interview: 3, offer: 4, rejected: 1,
};

function jobTypeOf(title: string): JobType {
  const t = title.toLowerCase();
  if (/co-?op/.test(t)) return "Co-op";
  if (/intern/.test(t)) return "Internship";
  if (/new ?grad|university grad|early career|full[- ]?time/.test(t)) return "Full-time";
  return "Internship";
}
function postedAgo(datePosted?: number): string {
  if (!datePosted) return "";
  const hours = (Date.now() - datePosted * 1000) / 3_600_000;
  if (hours < 1) return "Just posted";
  if (hours < 24) return `Posted ${Math.floor(hours)}h ago`;
  if (hours < 48) return "Posted yesterday";
  return `Posted ${Math.floor(hours / 24)} days ago`;
}
function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}
function bandColor(v: number): string {
  return v >= 80 ? "var(--beacon)" : v >= 65 ? "var(--accent)" : "var(--warn)";
}
// A score is an estimate when the posting never gave us its required skills.
function isEstimate(l: RankedListing): boolean {
  return !l.skills || l.skills.length === 0;
}
function shortLocations(locs: string[]): string {
  if (locs.length <= 3) return locs.join(", ") || "—";
  return `${locs.slice(0, 3).join(", ")} +${locs.length - 3} more`;
}

// ── "About the role" helpers ──────────────────────────────────────────────
/** First real sentence of a description, for the pull quote. Empty if too short. */
function leadSentence(text: string): string {
  const clean = text.replace(/^\s*[•\-*]\s*/, "").replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.{40,220}?[.!?])(\s|$)/);
  const s = (m ? m[1] : clean.slice(0, 160)).trim();
  return s.length >= 30 ? s : "";
}
const RESP_HEAD = /responsib|what you'?ll do|what you will do|in this role|day[- ]?to[- ]?day|you will\b/i;
const STOP_HEAD = /requirement|qualification|what we'?re looking for|about you|minimum|preferred|benefit|perk|compensation|equal opportunity|eeo/i;
/** Pull the "responsibilities / what you'll do" bullets out of a JD, if present. */
function parseDuties(text: string): string[] {
  const out: string[] = [];
  let on = false;
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const isBullet = /^[•\-*]/.test(line);
    const isHead = !isBullet && line.length <= 64 && !/[.!?]$/.test(line);
    if (!on) { if (isHead && RESP_HEAD.test(line)) on = true; continue; }
    if (isHead && STOP_HEAD.test(line)) break;
    if (isBullet) {
      const b = line.replace(/^[•\-*]\s*/, "").trim();
      if (b.length >= 10 && b.length <= 240) out.push(b);
    }
    if (out.length >= 5) break;
  }
  return out;
}

const svgSm = { width: 11, height: 11, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const IC_CHECK = <svg {...svgSm}><path d="M20 6 9 17l-5-5" /></svg>;
const IC_DASH = <svg {...svgSm}><path d="M5 12h14" /></svg>;
const IC_CHEV = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>;
const IC_INFO = <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 8.5v5" /><path d="M12 16.5h.01" /><circle cx="12" cy="12" r="9" /></svg>;
const IC_EXT = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>;
const IC_DOC = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /></svg>;
const IC_CLOCK = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>;

const TIER_STEPS = [
  { id: "read", label: "Read the JD — pull its 4-6 strongest signals" },
  { id: "resume", label: "Pick the track résumé & reorder bullets (don't invent tech)" },
  { id: "autofill", label: "Autofill the form & review every field" },
  { id: "submit", label: "Submit — be an early, strong application" },
  { id: "outreach", label: "After: one recruiter or engineer (only if outreach fits)" },
  { id: "prep", label: "Start interview prep today — don't wait for the OA" },
];
function TierPlaybook({ company, onFindPeople, onApply }: { company: string; onFindPeople: () => void; onApply: () => void }) {
  const key = `internpilot.tierA.${company.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const [done, setDone] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { return {}; } });
  const toggle = (id: string) => setDone((p) => { const n = { ...p, [id]: !p[id] }; try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  return (
    <>
      <div className="tierA-steps">
        {TIER_STEPS.map((s) => (
          <label key={s.id} className={"tierA-step" + (done[s.id] ? " on" : "")}>
            <input type="checkbox" checked={!!done[s.id]} onChange={() => toggle(s.id)} /><span>{s.label}</span>
          </label>
        ))}
      </div>
      <div className="tierA-acts">
        <button type="button" className="secondary small" onClick={onFindPeople}>Find people</button>
        <button type="button" className="small" onClick={onApply}>⚡ Apply</button>
      </div>
    </>
  );
}

export default function Internships() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<RankedListing[]>([]);
  const [appByUrl, setAppByUrl] = useState<Map<string, ApplicationRow>>(new Map());
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [employment, setEmployment] = useState<ContactEmployment[]>([]);
  const [preferredResumeId, setPreferredResumeId] = useState<number | null>(null);
  const [mySkills, setMySkills] = useState<string[]>([]);
  const [resumeHay, setResumeHay] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasRoles, setHasRoles] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<JobType[]>([]);
  const [location, setLocation] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [matchesMyRoles, setMatchesMyRoles] = useState(false);
  const [hideIneligible, setHideIneligible] = useState(false);
  const [sort, setSort] = useState<"relevance" | "recent">("relevance");
  const [listView, setListView] = useState<"browse" | "saved" | "queue">("browse");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [openingsDismissed, setOpeningsDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [descByUrl, setDescByUrl] = useState<Map<string, string>>(new Map());
  const [descLoading, setDescLoading] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  async function refreshApps() {
    const apps = await listApplications();
    const map = new Map<string, ApplicationRow>();
    for (const a of apps) if (a.job_link) map.set(a.job_link, a);
    setAppByUrl(map);
  }
  async function refreshNetwork() {
    const [cts, refs, emp] = await Promise.all([listContacts(), listReferrals(), listAllEmployment()]);
    setContacts(cts); setReferrals(refs); setEmployment(emp);
  }

  async function load(force = false) {
    setLoading(true);
    setError("");
    try {
      const [feed, profile, cts, refs, emp] = await Promise.all([getFeed(force), getProfile(), listContacts(), listReferrals(), listAllEmployment()]);
      setReferrals(refs);
      setEmployment(emp);
      setListings(feed.listings);
      setTotal(feed.listings.length);
      // Honor a hand-off from Fast Apply's "Prepare" so we open that exact role.
      const pending = localStorage.getItem("internpilot.pendingSelect");
      if (pending) {
        localStorage.removeItem("internpilot.pendingSelect");
        if (feed.listings.some((l) => l.id === pending)) setSelectedId(pending);
      }
      setContacts(cts);
      setProfile(profile);
      const preferredId = profile?.preferred_resume_id ?? null;
      setPreferredResumeId(preferredId);
      setMySkills((profile?.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean));
      const resumeContent = preferredId ? (await getResumeVersion(preferredId))?.content ?? "" : "";
      setResumeHay(`${resumeContent} ${profile?.skills ?? ""}`.toLowerCase());
      const roles = (profile?.target_roles ?? "").split(",").map((r) => r.trim()).filter(Boolean);
      setHasRoles(roles.length > 0);
      if (roles.length > 0) setMatchesMyRoles(true);
      await refreshApps();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    let rows = listings.filter((l) => {
      if (onlyNew && !l.isNew) return false;
      if (selectedTypes.length && !selectedTypes.includes(jobTypeOf(l.title))) return false;
      if (loc && !l.locations.join(" ").toLowerCase().includes(loc)) return false;
      if (term && !l.company.toLowerCase().includes(term) && !l.title.toLowerCase().includes(term)) return false;
      if (matchesMyRoles && !l.matchesRoles) return false;
      if (hideIneligible && assessEligibility(profile, l).level === "ineligible") return false;
      return true;
    });
    if (sort === "recent") rows = [...rows].sort((a, b) => (b.datePosted ?? 0) - (a.datePosted ?? 0));
    return rows.slice(0, MAX_SHOWN);
  }, [listings, search, selectedTypes, location, onlyNew, matchesMyRoles, hideIneligible, profile, sort]);

  // Browse / Saved / Queue views over the filtered feed.
  const savedList = useMemo(() => filtered.filter((l) => appByUrl.has(l.url)), [filtered, appByUrl]);
  const queueList = useMemo(() => filtered.filter((l) => !appByUrl.has(l.url) && l.score >= 70).sort((a, b) => b.score - a.score), [filtered, appByUrl]);
  const shown = listView === "saved" ? savedList : listView === "queue" ? queueList : filtered;

  const selected = filtered.find((l) => l.id === selectedId) ?? filtered[0] ?? null;
  const selectedUrl = selected?.url ?? null;

  // Fetch the job description for the selected posting (cached per URL).
  useEffect(() => {
    setDescExpanded(false); // collapse the long-description clamp when switching postings
    if (!selectedUrl || descByUrl.has(selectedUrl)) return;
    let cancelled = false;
    setDescLoading(true);
    fetchJobDescription(selectedUrl)
      .then((txt) => { if (!cancelled) setDescByUrl((m) => new Map(m).set(selectedUrl, txt)); })
      .catch((e) => console.error("description fetch failed", e))
      .finally(() => { if (!cancelled) setDescLoading(false); });
    return () => { cancelled = true; };
  }, [selectedUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleType(t: JobType) {
    setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }
  function clearAll() {
    setSearch(""); setSelectedTypes([]); setLocation(""); setOnlyNew(false); setMatchesMyRoles(false); setHideIneligible(false);
  }
  const moreCount = (onlyNew ? 1 : 0) + (hasRoles && matchesMyRoles ? 1 : 0) + (hideIneligible ? 1 : 0);
  const anyActive = !!(search.trim() || selectedTypes.length || location.trim() || onlyNew || matchesMyRoles || hideIneligible);

  async function addToTracker(l: RankedListing): Promise<number | null> {
    const existing = appByUrl.get(l.url);
    if (existing) return existing.id;
    const id = await createApplication({
      company_name: l.company, role_title: l.title, job_link: l.url,
      location: l.locations.join(", "), status: "interested", resume_version_id: preferredResumeId,
    });
    await refreshApps();
    return id;
  }
  async function apply(l: RankedListing) {
    try {
      const id = await addToTracker(l);
      // Opening the posting is best-effort — don't let it block adding + navigating.
      openExternal(l.url).catch((e) => console.error("open posting failed", e));
      if (id) navigate(`/apply?app=${id}`);
      else setError("Couldn't add this application. Try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const selApp = selected ? appByUrl.get(selected.url) : undefined;
  const selStage = selApp ? STATUS_STAGE[selApp.status] : -1;
  const employmentByContact = useMemo(() => {
    const m = new Map<number, ContactEmployment[]>();
    for (const e of employment) { const a = m.get(e.contact_id) ?? []; a.push(e); m.set(e.contact_id, a); }
    return m;
  }, [employment]);
  const companyLc = selected?.company.toLowerCase() ?? "";
  const histContactIds = useMemo(() => new Set(employment.filter((e) => e.company.toLowerCase() === companyLc).map((e) => e.contact_id)), [employment, companyLc]);
  // Warm contacts here = current company matches OR they've worked here before (history).
  const selContacts = selected ? contacts.filter((c) => (c.company_name ?? "").toLowerCase() === companyLc || histContactIds.has(c.id)) : [];
  const selTarget = selected ? matchCompany(selected.company) : null;

  // Tier-A openings: brand-new postings from your instant/high watchlist companies, not yet applied.
  const targetOpenings = useMemo(() => {
    const out: { l: RankedListing; tc: TargetCompany }[] = [];
    const seen = new Set<string>();
    for (const l of listings) {
      if (!l.isNew || appByUrl.has(l.url) || seen.has(l.id)) continue;
      const tc = matchCompany(l.company);
      if (!tc || (tc.priority !== "instant" && tc.priority !== "high")) continue;
      seen.add(l.id);
      out.push({ l, tc });
      if (out.length >= 6) break;
    }
    return out;
  }, [listings, appByUrl]);
  const matchedSkills = selected ? mySkills.filter((s) => selected.title.toLowerCase().includes(s.toLowerCase())) : [];

  // Skill match: prefer the fetched JD; else use source-extracted skills; else title-based score.
  const selDesc = selectedUrl ? descByUrl.get(selectedUrl) : undefined;
  const jdMatch = selDesc && resumeHay.trim() ? jdSkillMatch(selDesc, resumeHay) : null;
  const srcMatch = !jdMatch && selected?.skills?.length && resumeHay.trim()
    ? (() => {
        const matched = selected.skills!.filter((s) => resumeHay.includes(s.toLowerCase()));
        const missing = selected.skills!.filter((s) => !resumeHay.includes(s.toLowerCase()));
        return { matched, missing, score: Math.round((matched.length / selected.skills!.length) * 100) };
      })()
    : null;
  const effMatch = jdMatch ?? srcMatch;
  const gaugeValue = effMatch && effMatch.matched.length + effMatch.missing.length > 0 ? effMatch.score : selected?.score ?? 0;
  const selElig = selected ? assessEligibility(profile, selected, selDesc) : null;
  const selReferrals = selected ? referrals.filter((r) => (r.company_name ?? "").toLowerCase() === selected.company.toLowerCase()) : [];
  const selTeam = selected ? extractTeam(selected.title, selDesc) : { areas: [], keywords: [] };
  const bestPath = bestConnection(selContacts, selTeam, profile);

  return (
    <>
      <div className="filter-bar">
        <div className="filter-search">
          <span className="search-ico">🔎</span>
          <input placeholder="Search company or role…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <FilterPill label="Job Type" count={selectedTypes.length}>
          <div className="popover-title">Job Type</div>
          <div className="popover-sub">Filter by job type</div>
          {selectedTypes.length > 0 && (
            <div className="popover-chips">
              {selectedTypes.map((t) => (
                <span className="tag-chip" key={t}>{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => toggleType(t)}>×</button></span>
              ))}
            </div>
          )}
          {JOB_TYPES.map((t) => (
            <label className="opt-check" key={t}>
              <input type="checkbox" checked={selectedTypes.includes(t)} onChange={() => toggleType(t)} />{t}
            </label>
          ))}
        </FilterPill>
        <FilterPill label="Location" count={location.trim() ? 1 : 0} width={280}>
          <div className="popover-title">Location</div>
          <div className="popover-sub">Filter by city, state, or "remote"</div>
          <input placeholder="e.g. New York, Remote" value={location} onChange={(e) => setLocation(e.target.value)} />
        </FilterPill>
        <FilterPill label="More filters" count={moreCount} width={260}>
          <div className="popover-title">More filters</div>
          <div className="popover-sub">Refine your results</div>
          <label className="opt-check"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />New postings only</label>
          {hasRoles && <label className="opt-check"><input type="checkbox" checked={matchesMyRoles} onChange={(e) => setMatchesMyRoles(e.target.checked)} />Matches my roles</label>}
          <label className="opt-check"><input type="checkbox" checked={hideIneligible} onChange={(e) => setHideIneligible(e.target.checked)} />Hide likely ineligible</label>
        </FilterPill>
        {anyActive && <button type="button" className="pop-clear" onClick={clearAll}>Clear all</button>}
        <button type="button" className="secondary" onClick={() => load(true)} disabled={loading} style={{ marginLeft: "auto" }}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {error && <p className="hint text-red">{error}</p>}

      {targetOpenings.length > 0 && !openingsDismissed && (
        <div className="target-openings">
          <div className="to-head">
            <b>🎯 Your targets just opened</b>
            <span>{targetOpenings.length} watchlist {targetOpenings.length === 1 ? "company" : "companies"} posted a new role — apply fast</span>
            <button type="button" className="to-x" onClick={() => setOpeningsDismissed(true)} aria-label="Dismiss">✕</button>
          </div>
          <div className="to-list">
            {targetOpenings.map(({ l, tc }) => (
              <button type="button" className="to-item" key={l.id} onClick={() => { setListView("browse"); setSelectedId(l.id); }}>
                <CompanyLogo company={l.company} />
                <span className="to-tx">
                  <b>{l.company}<span className={`to-tier ${tc.priority}`}>{PRIORITY_LABEL[tc.priority]}</span></b>
                  <span>{l.title}</span>
                </span>
                <span className="to-track">Use {TRACK_LABEL[trackFor(l.company)]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="workspace">
        <aside className="results">
          <div className="results-head">
            <div className="count">Showing <b>{shown.length}</b> of <b>{total}</b> internships</div>
            <div className="seg">
              <button type="button" className={sort === "relevance" ? "on" : ""} onClick={() => setSort("relevance")}>Best fit</button>
              <button type="button" className={sort === "recent" ? "on" : ""} onClick={() => setSort("recent")}>Newest</button>
            </div>
          </div>
          <div className="list-views">
            <button type="button" className={listView === "browse" ? "on" : ""} onClick={() => setListView("browse")}>Browse</button>
            <button type="button" className={listView === "saved" ? "on" : ""} onClick={() => setListView("saved")}>Saved{savedList.length ? <span className="vn">{savedList.length}</span> : null}</button>
            <button type="button" className={listView === "queue" ? "on" : ""} onClick={() => setListView("queue")}>Queue{queueList.length ? <span className="vn">{queueList.length}</span> : null}</button>
          </div>
          <div className="list">
            {shown.length === 0 ? (
              <div className="empty">
                {listView === "saved" ? "No saved roles yet — click Save on a posting to keep it here."
                  : listView === "queue" ? "Your apply queue is clear — strong matches you haven't applied to show up here."
                  : listings.length === 0 ? "No listings — click Refresh." : "No listings match your filters."}
                {listView === "browse" && listings.length > 0 && anyActive && (
                  <div className="mt-sm"><button type="button" className="secondary small" onClick={clearAll}>Clear filters</button></div>
                )}
              </div>
            ) : shown.map((l) => (
              <button type="button" key={l.id} className={"job" + (selected?.id === l.id ? " on" : "")} onClick={() => setSelectedId(l.id)}>
                <div className="job-top">
                  <CompanyLogo company={l.company} />
                  <div className="job-org">
                    <div className="nm">{l.company}</div>
                    <div className="lbl">{jobTypeOf(l.title)}{l.isNew ? " · New" : ""}</div>
                  </div>
                  {appByUrl.has(l.url) && <span className="bookmark saved">★</span>}
                </div>
                <h3>{l.title}</h3>
                <div className="facts">
                  {l.salary && <span className="fact pay">{l.salary}</span>}
                  {l.locations[0] && <span className="fact">{l.locations[0]}</span>}
                  {l.remote && <span className="fact">Remote</span>}
                  {!l.sponsorshipOk && <span className="fact neg">No sponsorship</span>}
                </div>
                <div className="job-foot">
                  <span className="closes">{postedAgo(l.datePosted).toUpperCase()}</span>
                  <span className={"matchpip" + (isEstimate(l) ? " est" : "")} title={isEstimate(l) ? "Estimated — this posting didn't list its requirements" : undefined}>
                    <i style={{ ["--c" as string]: isEstimate(l) ? "var(--slate-2)" : bandColor(l.score) }} />{isEstimate(l) ? "~" : ""}{l.score}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="detail">
          {selected && (
            <>
              <div className="detail-head">
                <div className="tabs"><button type="button" className="on">Overview</button></div>
                <div className="actions">
                  <button type="button" className="secondary" onClick={() => addToTracker(selected)} disabled={appByUrl.has(selected.url)}>{appByUrl.has(selected.url) ? "Saved" : "Save"}</button>
                  <button type="button" className="secondary" onClick={() => navigate(`/packet?job=${encodeURIComponent(selected.id)}`)}>Prepare</button>
                  <button type="button" onClick={() => apply(selected)}>⚡ Apply with autofill</button>
                </div>
              </div>
              <div className="detail-body">
                <div className="pillrow">
                  <span className="pill">{selected.season ?? "Internship"}</span>
                  {selected.isNew && <span className="pill live">Recently posted</span>}
                </div>
                <h1>{selected.title}</h1>
                <div className="sub">{selected.company} · {postedAgo(selected.datePosted)}</div>

                <div className="orgcard">
                  <CompanyLogo company={selected.company} />
                  <div>
                    <div className="nm">{selected.company}</div>
                    <div className="meta">{jobTypeOf(selected.title)}{selected.locations[0] ? ` · ${selected.locations[0]}` : ""}</div>
                  </div>
                  <button type="button" className="secondary" onClick={() => openExternal(selected.url)}>Open posting</button>
                </div>

                <div className="rail">
                  <div className="rail-top">
                    <span className="lbl">Your status</span>
                    <em>{selApp ? STAGES[selStage] ?? "Tracked" : "Not started"}</em>
                  </div>
                  <div className="stages">
                    {STAGES.map((s, k) => (
                      <div key={s} className={"stage " + (k < selStage ? "done" : k === selStage ? "now" : "")}>
                        <i /><span>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid">
                  <div className="cell"><span className="lbl">Location</span><b>{shortLocations(selected.locations)}</b>{selected.remote ? <span className="cell-note">Remote available</span> : null}</div>
                  <div className="cell"><span className="lbl">Compensation</span><b className={selected.salary ? "" : "unknown"}>{selected.salary ?? "Not listed"}</b></div>
                  <div className="cell"><span className="lbl">Season</span><b>{selected.season ?? "—"}</b>{selected.season ? <span className="cell-note">{selected.seasonInferred ? "Inferred — verify" : "Confirmed"}</span> : null}</div>
                  <div className="cell"><span className="lbl">Visa sponsorship</span><b className={selected.sponsorshipOk ? "" : "neg"}>{selected.sponsorship ?? "Not stated"}</b><span className="cell-note">Estimate — confirm in JD</span></div>
                  <div className="cell"><span className="lbl">Posted</span><b>{postedAgo(selected.datePosted) || "—"}</b></div>
                  <div className="cell"><span className="lbl">Source</span><b>{selected.source}</b></div>
                </div>

                {selElig && selElig.level !== "unknown" && (
                  <div className={`elig elig-${selElig.level}`}>
                    <div className="elig-head">
                      <span className="elig-badge">{selElig.label}</span>
                      <span className="lbl">Eligibility · estimate</span>
                    </div>
                    <ul className="elig-reasons">
                      {selElig.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
                {selElig?.level === "unknown" && (
                  <p className="muted-note mb-md">{selElig.reasons[0]} <button type="button" className="pop-clear" onClick={() => navigate("/profile")}>Set it</button></p>
                )}

                {descLoading ? (
                  <><h2>About the role</h2><p className="hint">Loading description from the posting…</p></>
                ) : (() => {
                  const desc = selDesc;
                  const long = !!desc && desc.length > 600; // only long JDs get the clamp + read-more
                  const lead = desc ? leadSentence(desc) : "";
                  const duties = desc ? parseDuties(desc) : [];
                  const req = effMatch && effMatch.matched.length + effMatch.missing.length > 0 ? effMatch : null;
                  const age = selected.datePosted ? postedAgo(selected.datePosted).replace(/^Posted /, "") : "";
                  const signals: { ok: boolean; b: string; s: string }[] = [];
                  if (selected.season || selected.locations[0]) signals.push({ ok: true, b: `${selected.season ?? jobTypeOf(selected.title)}${selected.locations[0] ? `, ${selected.locations[0]}` : ""}`, s: "From the feed listing — matches your filters" });
                  if (age) signals.push({ ok: true, b: `Posted ${age}`, s: "One of the fresher listings in your feed" });
                  signals.push({ ok: false, b: "Requirements unknown", s: `Readiness (${selected.score}) is estimated from the title alone — treat it as a guess, not a score` });
                  if (!selected.salary || !selected.sponsorshipOk) signals.push({ ok: false, b: "Compensation / sponsorship not stated", s: "Check the posting before you spend an hour on the form" });
                  return (
                    <div className="rolebody">
                      {desc ? (
                        <>
                          {lead && <blockquote className="rb-pull"><p>{lead}</p><span className="eyebrow src">Pulled from the posting</span></blockquote>}
                          <div className="rb-shead"><h3>About the role</h3><span className="rule" /></div>
                          <div className={"rb-copy" + (long && !descExpanded ? " clamped" : "")}>
                            {desc.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
                          </div>
                          {long && !descExpanded && <button type="button" className="rb-more" onClick={() => setDescExpanded(true)}>Read the full description {IC_CHEV}</button>}
                          {duties.length >= 3 && (
                            <>
                              <div className="rb-shead"><h3>What you'll do</h3><span className="rule" /></div>
                              <ul className="rb-duties">{duties.map((d, i) => <li key={i}><span className="n">{i + 1}</span><span className="tx">{d}</span></li>)}</ul>
                            </>
                          )}
                          {req && (
                            <>
                              <div className="rb-shead">
                                <h3>Requirements</h3><span className="rule" />
                                <span className="rb-count good">{req.matched.length} of {req.matched.length + req.missing.length} met</span>
                                <button type="button" className="act" onClick={() => navigate("/resumes")}>Edit résumé</button>
                              </div>
                              <ul className="rb-reqs">
                                {req.matched.slice(0, 8).map((s) => (
                                  <li key={`h-${s}`}><span className="mk hit">{IC_CHECK}</span><span className="tx"><b>{s}</b><span>Found on your résumé</span></span></li>
                                ))}
                                {req.missing.slice(0, 8).map((s) => (
                                  <li key={`g-${s}`} className="gap"><span className="mk gap">{IC_DASH}</span><span className="tx"><b>{s}</b></span><button type="button" className="add" onClick={() => navigate("/bullets")}>Add</button></li>
                                ))}
                              </ul>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="rb-shead"><h3>About the role</h3><span className="rule" /></div>
                          <div className="rb-thin">
                            <span className="ic">{IC_INFO}</span>
                            <div className="bd">
                              <b>The feed didn't carry a description</b>
                              <p>{selected.source} gave us the role, company, and location. What the posting says about requirements lives on {selected.company}'s site — here are two ways to get it.</p>
                              <div className="acts">
                                <button type="button" className="rb-btn warnp" onClick={() => openExternal(selected.url)}>Open the posting {IC_EXT}</button>
                                <button type="button" className="rb-btn warns" onClick={() => navigate("/chat")}>Have AI Chat summarise it</button>
                              </div>
                            </div>
                          </div>
                          <div className="rb-shead"><h3>What we can tell you</h3><span className="rule" /><span className="rb-count">{signals.length} signals</span></div>
                          <ul className="rb-known">
                            {signals.map((sig, i) => (
                              <li key={i} className={sig.ok ? "" : "gap"}><span className={"mk " + (sig.ok ? "hit" : "gap")}>{sig.ok ? IC_CHECK : IC_DASH}</span><span className="tx"><b>{sig.b}</b><span>{sig.s}</span></span></li>
                            ))}
                          </ul>
                        </>
                      )}
                      <div className="rb-prov">
                        <span className="r">{IC_DOC}Source <b>{selected.source}</b></span>
                        {age ? <span className="r">{IC_CLOCK}Posted <b>{age}</b></span> : null}
                        <span className="spacer" />
                        <button type="button" className="rep" onClick={() => openExternal(selected.url)}>Something look wrong?</button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </section>

        <aside className="rightrail">
          {selected && (
            <>
              {selTarget && (selTarget.priority === "instant" || selTarget.priority === "high") && (
                <div className="panel tierA">
                  <div className="panel-head"><span className="lbl">Tier-A playbook</span><span className={`to-tier ${selTarget.priority}`}>{PRIORITY_LABEL[selTarget.priority]}</span></div>
                  <p className="tierA-track">Lead with your <b>{TRACK_LABEL[trackFor(selected.company)]}</b> résumé — don't rebuild it.</p>
                  <TierPlaybook company={selected.company} onFindPeople={() => setPeopleOpen(true)} onApply={() => apply(selected)} />
                </div>
              )}

              <div className="panel">
                <div className="panel-head"><span className="lbl">Readiness</span></div>
                <ReadinessGauge value={gaugeValue} />
                <p className="gauge-note">
                  {effMatch
                    ? `${effMatch.matched.length} of ${effMatch.matched.length + effMatch.missing.length} listed skills found on your résumé`
                    : "Match on your target roles, skills, and locations"}
                </p>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <span className="lbl">Skills</span>
                  <button type="button" onClick={() => navigate("/resumes")}>Edit résumé</button>
                </div>
                {effMatch ? (
                  <>
                    <div className="sub-label">On your résumé ({effMatch.matched.length})</div>
                    <div className="skills">
                      {effMatch.matched.length > 0
                        ? effMatch.matched.slice(0, 14).map((m) => <span className="skill" key={m}>✓ {m}</span>)
                        : <span className="muted-note">None of the listed skills matched yet.</span>}
                    </div>
                    {effMatch.missing.length > 0 && (
                      <>
                        <div className="sub-label">Missing ({effMatch.missing.length})</div>
                        <div className="skills">
                          {effMatch.missing.slice(0, 14).map((m) => <span className="skill miss" key={m}>− {m}</span>)}
                        </div>
                      </>
                    )}
                  </>
                ) : matchedSkills.length > 0 ? (
                  <>
                    <div className="sub-label">On your résumé ({matchedSkills.length})</div>
                    <div className="skills">
                      {matchedSkills.map((m) => <span className="skill" key={m}>✓ {m}</span>)}
                    </div>
                  </>
                ) : (
                  <p className="muted-note">Loading the job description to match your résumé skills…</p>
                )}
              </div>

              <div className="panel">
                <div className="panel-head">
                  <span className="lbl">Contacts at {selected.company}</span>
                  <button type="button" onClick={() => navigate("/networking")}>Manage</button>
                </div>
                {bestPath && (
                  <div className="rail-bestpath">
                    <span className="eyebrow">Best path</span>
                    <div className="rbp"><b>{bestPath.path}</b><span className="rbp-score">{bestPath.scored.score}</span></div>
                  </div>
                )}
                {selContacts.length > 0 ? selContacts.slice(0, 4).map((c) => (
                  <div className="person" key={c.id}>
                    <span className="av">{initials(c.name)}</span>
                    <span className="who"><b>{c.name}</b><span>{c.title ?? "—"}</span></span>
                    <button type="button" className="secondary small" onClick={() => navigate("/networking")}>Ask</button>
                  </div>
                )) : (
                  <p className="muted-note">No saved contacts here yet — let InternPilot find who's worth reaching out to.</p>
                )}
                <button type="button" className="find-people" onClick={() => setPeopleOpen(true)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><circle cx="18" cy="8.5" r="2.4" /><path d="M18 13a4 4 0 013.8 2.8" /></svg>
                  Find people to contact
                </button>
              </div>

              {selected.datePosted && (
                <div className="panel deadline">
                  <span className="lbl">Age of posting</span>
                  <div className="big">{postedAgo(selected.datePosted).replace("Posted ", "").replace(" ago", "")}</div>
                  <p>Older listings fill first — apply sooner rather than later.</p>
                </div>
              )}

              <div className="foot">InternPilot · Internship feed</div>
            </>
          )}
        </aside>
      </div>

      {peopleOpen && selected && (
        <PeopleFinder
          company={selected.company}
          title={selected.title}
          jd={selDesc}
          profile={profile}
          contacts={selContacts}
          applicationId={selApp?.id ?? null}
          referrals={selReferrals}
          employment={employmentByContact}
          onSaved={refreshNetwork}
          onClose={() => setPeopleOpen(false)}
        />
      )}
    </>
  );
}
