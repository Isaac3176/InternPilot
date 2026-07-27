import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createApplication, listApplications } from "../db/applications";
import { getProfile } from "../db/profile";
import { getFeed, markFeedSeen } from "../listings/service";
import type { RankedListing } from "../listings/types";

const MAX_SHOWN = 150;

export default function Internships() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<RankedListing[]>([]);
  const [addedUrls, setAddedUrls] = useState<Map<string, number>>(new Map());
  const [preferredResumeId, setPreferredResumeId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newCount, setNewCount] = useState(0);

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
      setNewCount(feed.newCount);
      setPreferredResumeId(profile?.preferred_resume_id ?? null);
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
    return listings
      .filter((l) => (onlyNew ? l.isNew : true))
      .filter((l) => !term || l.company.toLowerCase().includes(term) || l.title.toLowerCase().includes(term))
      .slice(0, MAX_SHOWN);
  }, [listings, search, onlyNew]);

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
          <p>
            Fresh postings tailored to your profile.
            {newCount > 0 && <span className="badge oa ml-xs">{newCount} new</span>}
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="toolbar">
        <input placeholder="Search company or role…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="check-row">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
          <span>New only</span>
        </label>
      </div>

      {error && <p className="hint text-red">{error}</p>}

      {!loading && filtered.length === 0 ? (
        <div className="empty">
          {listings.length === 0 ? "No listings loaded yet — click Refresh." : "No listings match your filters."}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Role</th>
              <th>Location</th>
              <th style={{ width: 210 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => {
              const added = addedUrls.has(l.url);
              return (
                <tr key={l.id}>
                  <td>
                    {l.company}
                    {l.isNew && <span className="badge oa ml-xs">NEW</span>}
                    {!l.sponsorshipOk && <span className="badge rejected ml-xs">No sponsorship</span>}
                  </td>
                  <td>{l.title}</td>
                  <td className="muted">{l.locations.join(", ") || "—"}</td>
                  <td>
                    <div className="actions">
                      <button type="button" className="secondary small" onClick={() => addToTracker(l)} disabled={added}>
                        {added ? "Added" : "Add"}
                      </button>
                      <button type="button" className="small" onClick={() => apply(l)}>Apply</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
