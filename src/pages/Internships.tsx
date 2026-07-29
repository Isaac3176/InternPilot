import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createApplication, listApplications } from "../db/applications";
import { getProfile } from "../db/profile";
import { getFeed, markFeedSeen } from "../listings/service";
import type { RankedListing } from "../listings/types";

const MAX_SHOWN = 200;
const JOB_TYPES = ["All", "Internship", "Co-op", "Full-time"] as const;
type JobType = (typeof JOB_TYPES)[number];

function jobTypeOf(title: string): Exclude<JobType, "All"> {
  const t = title.toLowerCase();
  if (/co-?op/.test(t)) return "Co-op";
  if (/intern/.test(t)) return "Internship";
  if (/new ?grad|university grad|early career|full[- ]?time/.test(t)) return "Full-time";
  return "Internship";
}

function postedAgo(datePosted?: number): string {
  if (!datePosted) return "";
  const hours = (Date.now() - datePosted * 1000) / 3_600_000;
  if (hours < 1) return "Posted just now";
  if (hours < 24) return `Posted ${Math.floor(hours)}h ago`;
  if (hours < 48) return "Posted yesterday";
  return `Posted ${Math.floor(hours / 24)} days ago`;
}

export default function Internships() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<RankedListing[]>([]);
  const [addedUrls, setAddedUrls] = useState<Map<string, number>>(new Map());
  const [preferredResumeId, setPreferredResumeId] = useState<number | null>(null);
  const [myRoles, setMyRoles] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [jobType, setJobType] = useState<JobType>("All");
  const [location, setLocation] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [matchesMyRoles, setMatchesMyRoles] = useState(false);
  const [sort, setSort] = useState<"relevance" | "recent">("relevance");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);

  async function refreshAddedMap() {
    const apps = await listApplications();
    const map = new Map<string, number>();
    for (const a of apps) if (a.job_link) map.set(a.job_link, a.id);
    setAddedUrls(map);
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [feed, profile] = await Promise.all([getFeed(), getProfile()]);
      setListings(feed.listings);
      setTotal(feed.listings.length);
      setPreferredResumeId(profile?.preferred_resume_id ?? null);
      setMyRoles((profile?.target_roles ?? "").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean));
      await refreshAddedMap();
      markFeedSeen(feed.listings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    let rows = listings.filter((l) => {
      if (onlyNew && !l.isNew) return false;
      if (jobType !== "All" && jobTypeOf(l.title) !== jobType) return false;
      if (loc && !l.locations.join(" ").toLowerCase().includes(loc)) return false;
      if (term && !l.company.toLowerCase().includes(term) && !l.title.toLowerCase().includes(term)) return false;
      if (matchesMyRoles && myRoles.length && !myRoles.some((r) => l.title.toLowerCase().includes(r))) return false;
      return true;
    });
    if (sort === "recent") {
      rows = [...rows].sort((a, b) => (b.datePosted ?? 0) - (a.datePosted ?? 0));
    }
    return rows.slice(0, MAX_SHOWN);
  }, [listings, search, jobType, location, onlyNew, matchesMyRoles, myRoles, sort]);

  const selected = filtered.find((l) => l.id === selectedId) ?? filtered[0] ?? null;

  async function addToTracker(l: RankedListing): Promise<number | null> {
    if (addedUrls.has(l.url)) return addedUrls.get(l.url)!;
    const id = await createApplication({
      company_name: l.company,
      role_title: l.title,
      job_link: l.url,
      location: l.locations.join(", "),
      status: "interested",
      resume_version_id: preferredResumeId,
    });
    await refreshAddedMap();
    return id;
  }

  async function apply(l: RankedListing) {
    const id = await addToTracker(l);
    await openUrl(l.url);
    if (id) navigate(`/apply?app=${id}`);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Internships</h1>
          <p>Fresh postings tailored to your profile.</p>
        </div>
        <button type="button" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      <div className="toolbar jobs-toolbar">
        <input placeholder="Search company or role…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Job type" value={jobType} onChange={(e) => setJobType(e.target.value as JobType)}>
          {JOB_TYPES.map((t) => <option key={t} value={t}>{t === "All" ? "All types" : t}</option>)}
        </select>
        <input className="loc-input" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "relevance" | "recent")}>
          <option value="relevance">Best match</option>
          <option value="recent">Most recent</option>
        </select>
        <label className="check-row"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /><span>New</span></label>
        <label className="check-row"><input type="checkbox" checked={matchesMyRoles} onChange={(e) => setMatchesMyRoles(e.target.checked)} /><span>My roles</span></label>
      </div>

      <div className="jobs-count">Showing {filtered.length} of {total} jobs</div>
      {error && <p className="hint text-red">{error}</p>}

      {filtered.length === 0 ? (
        <div className="empty">{listings.length === 0 ? "No listings loaded — click Refresh." : "No listings match your filters."}</div>
      ) : (
        <div className="jobs-layout">
          <div className="jobs-list">
            {filtered.map((l) => (
              <button type="button" key={l.id} className={"job-card" + (selected?.id === l.id ? " active" : "")} onClick={() => setSelectedId(l.id)}>
                <div className="job-card-top">
                  <strong>{l.company}</strong>
                  {l.isNew && <span className="badge oa">NEW</span>}
                </div>
                <div className="job-card-title">{l.title}</div>
                <div className="job-card-tags">
                  <span className="tag">{jobTypeOf(l.title)}</span>
                  {l.locations[0] && <span className="tag">{l.locations[0]}</span>}
                  {!l.sponsorshipOk && <span className="tag miss">No sponsorship</span>}
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="job-detail card">
              <div className="row-between">
                <div>
                  <h2 className="mb-0">{selected.title}</h2>
                  <div className="muted mt-xs">{selected.company}</div>
                </div>
                <span className="badge interview">{jobTypeOf(selected.title)}</span>
              </div>

              <div className="job-meta">
                <div><span className="muted">Location</span><div>{selected.locations.join(", ") || "—"}</div></div>
                <div><span className="muted">Posted</span><div>{postedAgo(selected.datePosted) || "—"}</div></div>
                {selected.season && <div><span className="muted">Season</span><div>{selected.season}</div></div>}
                <div><span className="muted">Sponsorship</span><div>{selected.sponsorship ?? "Not specified"}</div></div>
              </div>

              <h3 className="result-h3">Profile match</h3>
              <div className="perf-rate">
                <div className="bar-track"><div className="bar-fill accent" style={{ width: `${Math.min(100, selected.score)}%` }} /></div>
                <span>{Math.min(100, selected.score)}</span>
              </div>
              <p className="hint">Keyword match against your target roles, skills, and locations. Full job description opens on the company site.</p>

              <div className="actions mt-md">
                <button type="button" onClick={() => apply(selected)}>Apply</button>
                <button type="button" className="secondary" onClick={() => addToTracker(selected)} disabled={addedUrls.has(selected.url)}>
                  {addedUrls.has(selected.url) ? "Added" : "Save"}
                </button>
                <button type="button" className="secondary" onClick={() => openUrl(selected.url)}>Open posting</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
