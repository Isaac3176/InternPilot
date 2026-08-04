import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useNavigate } from "react-router-dom";
import { getReleaseRadar, type RadarEntry, type RadarState } from "../release/radar";
import { confidenceLabel } from "../release/history";
import { getPrefs } from "../ranking/prefs";
import { PRIORITY_LABEL } from "../ranking/companies";
import CompanyLogo from "../components/CompanyLogo";

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
  const targetSeason = getPrefs().targetSeason;

  useEffect(() => {
    getReleaseRadar()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

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

      <Section title="Already open" hint="A target-season role is posted right now.">
        {open.length === 0 ? <Empty text="Nothing from your watchlist is open yet." /> :
          open.map((e) => <RadarCard key={e.company} e={e} onApply={(url) => openUrl(url).catch(console.error)} navigate={navigate} />)}
      </Section>

      <Section title="Opening soon" hint="Inside or approaching the historical window, or already showing early signals.">
        {soon.length === 0 ? <Empty text="No companies are in their opening window right now." /> :
          soon.map((e) => <RadarCard key={e.company} e={e} onApply={(url) => openUrl(url).catch(console.error)} navigate={navigate} />)}
      </Section>

      <Section title="On the radar" hint="Forecasted further out, or awaiting first-cycle data.">
        {watching.map((e) => <RadarCard key={e.company} e={e} onApply={(url) => openUrl(url).catch(console.error)} navigate={navigate} />)}
      </Section>
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

function RadarCard({ e, onApply, navigate }: { e: RadarEntry; onApply: (url: string) => void; navigate: (p: string) => void }) {
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
            <b>{fmt(f.windowStart)} – {fmt(f.windowEnd)}</b>
            <span>typical {fmt(f.typical)} · {confidenceLabel(f.confidence)} ({f.confidence}%)</span>
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

        <div className="radar-actions">
          {e.state === "open" && e.openListingUrl ? (
            <>
              <button type="button" className="btn small primary" onClick={() => onApply(e.openListingUrl!)}>Open posting</button>
              <button type="button" className="btn small" onClick={() => navigate("/")}>Go to Fast Apply</button>
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
