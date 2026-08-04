import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getFeed } from "../listings/service";
import { createApplication } from "../db/applications";
import { buildPacket, getChecklist, setChecklistItem, PACKET_CHECKLIST, type ApplicationPacket } from "../apply/packet";
import type { Status } from "../db/types";
import CompanyLogo from "../components/CompanyLogo";

function eligClass(level: string): string {
  return level === "eligible" ? "ok" : level === "ineligible" ? "bad" : "warn";
}

export default function Packet() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const jobId = params.get("job") ?? "";
  const [packet, setPacket] = useState<ApplicationPacket | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [status, setStatus] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      const { listings } = await getFeed();
      const listing = listings.find((l) => l.id === jobId);
      if (!listing) { setState("missing"); return; }
      setChecked(getChecklist(jobId));
      setPacket(await buildPacket(listing));
      setState("ready");
    })().catch((e) => { console.error(e); setState("missing"); });
  }, [jobId]);

  function toggle(i: number) {
    const done = !checked.has(i);
    setChecklistItem(jobId, i, done);
    setChecked((prev) => {
      const next = new Set(prev);
      if (done) next.add(i); else next.delete(i);
      return next;
    });
  }

  async function track(status: Status) {
    if (!packet) return;
    const l = packet.listing;
    await createApplication({
      company_name: l.company, role_title: l.title, job_link: l.url,
      location: l.locations[0] ?? null, status,
      date_applied: status === "applied" ? new Date().toISOString().slice(0, 10) : null,
    });
  }
  async function applyNow() {
    try {
      await track("applied");
      if (packet) openUrl(packet.listing.url).catch(console.error);
      setStatus("Recorded as applied and opened the posting. Finish the form in your browser.");
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
  }
  async function saveForLater() {
    try { await track("interested"); setStatus("Saved to your applications."); }
    catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
  }

  if (state === "loading") {
    return <div className="packet"><div className="page-header"><div><h1>Application packet</h1><p>Assembling everything you need…</p></div></div><p className="hint">Fetching the description, checking eligibility, matching your résumé…</p></div>;
  }
  if (state === "missing" || !packet) {
    return (
      <div className="packet">
        <div className="page-header"><div><h1>Application packet</h1></div></div>
        <div className="empty"><b>This role isn't in the current feed</b><p>It may have been filled or aged out. Try the queue or Discover.</p>
          <button type="button" className="btn small" onClick={() => navigate("/")}>Back to Fast Apply</button></div>
      </div>
    );
  }

  const l = packet.listing;
  const m = packet.match;

  return (
    <div className="packet">
      <div className="page-header">
        <div className="pk-title">
          <CompanyLogo company={l.company} />
          <div>
            <h1>{l.title}</h1>
            <p>{l.company} · {l.locations[0] ?? "—"}{l.season ? ` · ${l.season}` : ""}</p>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" className="btn primary" onClick={applyNow}>Apply now</button>
          <button type="button" className="btn" onClick={saveForLater}>Save for later</button>
        </div>
      </div>

      {status && <p className="pk-status">{status}</p>}

      <div className="pk-grid">
        <div className="pk-col">
          {/* Eligibility */}
          <section className="pk-card">
            <h2>Eligibility</h2>
            <span className={`pk-elig ${eligClass(packet.eligibility.level)}`}>{packet.eligibility.label}</span>
            <ul className="pk-reasons">{packet.eligibility.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </section>

          {/* Résumé + match */}
          <section className="pk-card">
            <h2>Recommended résumé</h2>
            {packet.resume ? (
              <>
                <div className="pk-resume"><b>{packet.resume.name}</b>{packet.resume.target_role && <span> · {packet.resume.target_role}</span>}</div>
                {m && (
                  <div className="pk-match">
                    <div className="pk-matchbar"><span style={{ width: `${m.score}%` }} /></div>
                    <span className="pk-matchpct">{m.score}% keyword match</span>
                  </div>
                )}
                {m && m.missing.length > 0 && (
                  <div className="pk-missing">
                    <span className="lbl">Missing from your résumé</span>
                    <div className="chips">{m.missing.slice(0, 12).map((k) => <span key={k} className="chip">{k}</span>)}</div>
                  </div>
                )}
                <button type="button" className="btn small" onClick={() => navigate("/resumes")}>Open résumé center</button>
              </>
            ) : (
              <p className="hint">No résumé versions yet. <button type="button" className="linklike" onClick={() => navigate("/resumes")}>Add one</button> to unlock matching.</p>
            )}
          </section>

          {/* Referrals */}
          <section className="pk-card">
            <h2>Referral contacts</h2>
            {packet.contacts.length === 0 ? (
              <p className="hint">No saved contacts at {l.company}. <button type="button" className="linklike" onClick={() => navigate("/networking")}>Add one</button> — referrals roughly double reply rates.</p>
            ) : (
              <ul className="pk-contacts">
                {packet.contacts.map((c) => (
                  <li key={c.id}><b>{c.name}</b>{c.title ? <span> · {c.title}</span> : null}
                    <button type="button" className="btn small" onClick={() => navigate("/networking")}>Reach out</button></li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="pk-col">
          {/* Checklist */}
          <section className="pk-card">
            <h2>Checklist</h2>
            <ul className="pk-check">
              {PACKET_CHECKLIST.map((item, i) => (
                <li key={i}><label><input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} /><span className={checked.has(i) ? "done" : ""}>{item}</span></label></li>
              ))}
            </ul>
            <a className="pk-link" href={l.url} onClick={(e) => { e.preventDefault(); openUrl(l.url).catch(console.error); }}>Open original posting ↗</a>
          </section>

          {/* JD snapshot */}
          <section className="pk-card">
            <h2>Job description</h2>
            {packet.jdOk ? (
              <div className="pk-jd">{packet.jd}</div>
            ) : (
              <p className="hint">Couldn't load the description automatically. Open the posting to read the full details.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
