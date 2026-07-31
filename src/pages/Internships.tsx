import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createApplication, listApplications } from "../db/applications";
import { listContacts } from "../db/contacts";
import { getProfile } from "../db/profile";
import { getFeed } from "../listings/service";
import { fetchJobDescription } from "../listings/description";
import { jdSkillMatch } from "../listings/match";
import { getResumeVersion } from "../db/resumes";
import type { RankedListing } from "../listings/types";
import type { ApplicationRow, ContactRow, Status } from "../db/types";
import FilterPill from "../components/FilterPill";
import ReadinessGauge from "../components/ReadinessGauge";

const MAX_SHOWN = 200;
const JOB_TYPES = ["Internship", "Co-op", "Full-time"] as const;
type JobType = (typeof JOB_TYPES)[number];

const STAGES = ["Saved", "Applied", "Assessment", "Interview", "Offer"];
const STATUS_STAGE: Record<Status, number> = {
  interested: 0, applied: 1, oa: 2, interview: 3, offer: 4, rejected: 1,
};
const LOGO_COLORS = ["#1A1A1A", "#4B4FD6", "#2E9E3E", "#D6455E", "#E0761A", "#33383D", "#0E8F63", "#8A5300"];

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
function logoColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}
function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}
function bandColor(v: number): string {
  return v >= 80 ? "var(--beacon)" : v >= 65 ? "var(--accent)" : "var(--warn)";
}

export default function Internships() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<RankedListing[]>([]);
  const [appByUrl, setAppByUrl] = useState<Map<string, ApplicationRow>>(new Map());
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [preferredResumeId, setPreferredResumeId] = useState<number | null>(null);
  const [mySkills, setMySkills] = useState<string[]>([]);
  const [resumeHay, setResumeHay] = useState("");
  const [hasRoles, setHasRoles] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<JobType[]>([]);
  const [location, setLocation] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [matchesMyRoles, setMatchesMyRoles] = useState(false);
  const [sort, setSort] = useState<"relevance" | "recent">("relevance");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [descByUrl, setDescByUrl] = useState<Map<string, string>>(new Map());
  const [descLoading, setDescLoading] = useState(false);

  async function refreshApps() {
    const apps = await listApplications();
    const map = new Map<string, ApplicationRow>();
    for (const a of apps) if (a.job_link) map.set(a.job_link, a);
    setAppByUrl(map);
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [feed, profile, cts] = await Promise.all([getFeed(), getProfile(), listContacts()]);
      setListings(feed.listings);
      setTotal(feed.listings.length);
      setContacts(cts);
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
      return true;
    });
    if (sort === "recent") rows = [...rows].sort((a, b) => (b.datePosted ?? 0) - (a.datePosted ?? 0));
    return rows.slice(0, MAX_SHOWN);
  }, [listings, search, selectedTypes, location, onlyNew, matchesMyRoles, sort]);

  const selected = filtered.find((l) => l.id === selectedId) ?? filtered[0] ?? null;
  const selectedUrl = selected?.url ?? null;

  // Fetch the job description for the selected posting (cached per URL).
  useEffect(() => {
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
    setSearch(""); setSelectedTypes([]); setLocation(""); setOnlyNew(false); setMatchesMyRoles(false);
  }
  const moreCount = (onlyNew ? 1 : 0) + (hasRoles && matchesMyRoles ? 1 : 0);
  const anyActive = !!(search.trim() || selectedTypes.length || location.trim() || onlyNew || matchesMyRoles);

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
    const id = await addToTracker(l);
    await openUrl(l.url);
    if (id) navigate(`/apply?app=${id}`);
  }

  const selApp = selected ? appByUrl.get(selected.url) : undefined;
  const selStage = selApp ? STATUS_STAGE[selApp.status] : -1;
  const selContacts = selected ? contacts.filter((c) => (c.company_name ?? "").toLowerCase() === selected.company.toLowerCase()) : [];
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
        </FilterPill>
        {anyActive && <button type="button" className="pop-clear" onClick={clearAll}>Clear all</button>}
        <button type="button" className="secondary" onClick={load} disabled={loading} style={{ marginLeft: "auto" }}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {error && <p className="hint text-red">{error}</p>}

      <div className="workspace">
        <aside className="results">
          <div className="results-head">
            <div className="count">Showing <b>{filtered.length}</b> of <b>{total}</b> internships</div>
            <div className="seg">
              <button type="button" className={sort === "relevance" ? "on" : ""} onClick={() => setSort("relevance")}>Best fit</button>
              <button type="button" className={sort === "recent" ? "on" : ""} onClick={() => setSort("recent")}>Newest</button>
            </div>
          </div>
          <div className="list">
            {filtered.length === 0 ? (
              <div className="empty">
                {listings.length === 0 ? "No listings — click Refresh." : "No listings match your filters."}
                {listings.length > 0 && anyActive && (
                  <div className="mt-sm"><button type="button" className="secondary small" onClick={clearAll}>Clear filters</button></div>
                )}
              </div>
            ) : filtered.map((l) => (
              <button type="button" key={l.id} className={"job" + (selected?.id === l.id ? " on" : "")} onClick={() => setSelectedId(l.id)}>
                <div className="job-top">
                  <div className="logo" style={{ background: logoColor(l.company) }}>{initials(l.company)}</div>
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
                  <span className="matchpip"><i style={{ ["--w" as string]: `${l.score}%`, ["--c" as string]: bandColor(l.score) }} />{l.score}</span>
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
                  <div className="logo" style={{ background: logoColor(selected.company) }}>{initials(selected.company)}</div>
                  <div>
                    <div className="nm">{selected.company}</div>
                    <div className="meta">{jobTypeOf(selected.title)}{selected.locations[0] ? ` · ${selected.locations[0]}` : ""}</div>
                  </div>
                  <button type="button" className="secondary" onClick={() => openUrl(selected.url)}>Open posting</button>
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
                  <div className="cell"><span className="lbl">Location</span><b>{selected.locations.join(", ") || "—"}</b>{selected.remote ? <span className="cell-note">Remote available</span> : null}</div>
                  <div className="cell"><span className="lbl">Compensation</span><b className={selected.salary ? "" : "unknown"}>{selected.salary ?? "Not listed"}</b></div>
                  <div className="cell"><span className="lbl">Season</span><b>{selected.season ?? "—"}</b>{selected.season ? <span className="cell-note">{selected.seasonInferred ? "Inferred — verify" : "Confirmed"}</span> : null}</div>
                  <div className="cell"><span className="lbl">Visa sponsorship</span><b className={selected.sponsorshipOk ? "" : "neg"}>{selected.sponsorship ?? "Not stated"}</b><span className="cell-note">Estimate — confirm in JD</span></div>
                  <div className="cell"><span className="lbl">Posted</span><b>{postedAgo(selected.datePosted) || "—"}</b></div>
                  <div className="cell"><span className="lbl">Source</span><b>{selected.source}</b></div>
                </div>

                <h2>About the role</h2>
                {descLoading ? (
                  <p className="hint">Loading description from the posting…</p>
                ) : descByUrl.get(selected.url) ? (
                  <div className="prose jd">{descByUrl.get(selected.url)}</div>
                ) : (
                  <div className="prose">
                    <p>We couldn't load the description automatically for this posting — open it on the company site to read the full details.</p>
                  </div>
                )}
                <button type="button" className="secondary" onClick={() => openUrl(selected.url)}>View full posting →</button>
              </div>
            </>
          )}
        </section>

        <aside className="rightrail">
          {selected && (
            <>
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
                {selContacts.length > 0 ? selContacts.slice(0, 4).map((c) => (
                  <div className="person" key={c.id}>
                    <span className="av">{initials(c.name)}</span>
                    <span className="who"><b>{c.name}</b><span>{c.title ?? "—"}</span></span>
                    <button type="button" className="secondary small" onClick={() => navigate("/networking")}>Ask</button>
                  </div>
                )) : (
                  <p className="muted-note">No contacts here yet. Add one in Networking to build a referral path.</p>
                )}
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
    </>
  );
}
