import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOpeningSoon } from "../release/alerts";
import type { RadarEntry } from "../release/radar";

/** "Opening this week" banner — watchlist companies entering their likely window. */
export default function OpeningSoonBanner() {
  const navigate = useNavigate();
  const [soon, setSoon] = useState<RadarEntry[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { getOpeningSoon().then(setSoon).catch(() => {}); }, []);
  if (dismissed || soon.length === 0) return null;

  return (
    <div className="opening-soon">
      <div className="os-head">
        <b>📡 Time to reach out</b>
        <span>{soon.length} target {soon.length === 1 ? "company is" : "companies are"} near their opening — start networking before they post</span>
        <button type="button" className="os-x" onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
      </div>
      <div className="os-list">
        {soon.slice(0, 6).map((e) => (
          <button type="button" className="os-item" key={e.company} onClick={() => navigate("/radar")} title={e.reasons[0]}>
            <b>{e.company}</b>
            <span>{e.daysUntilWindow != null && e.daysUntilWindow > 0 ? `opens ~${e.daysUntilWindow}d` : "now"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
