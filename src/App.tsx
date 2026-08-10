import { Suspense, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { checkNewListingsAndNotify } from "./listings/notify";
import { pushProfileToBridge, pushAnswersToBridge, startBridgeListener } from "./bridge";
import { pushSnapshotToBridge, startMobileBridge } from "./mobile/sync";
import { isTauri } from "./lib/env";
import { cloudMode } from "./cloud/supabase";
import { getProfile } from "./db/profile";
import { getStatusCounts } from "./db/metrics";
import { AscentMark } from "./components/Logo";
import CommandPalette, { type Command } from "./components/CommandPalette";
import { useIsPhone } from "./mobile/ui/useIsPhone";
import MobileApp from "./mobile/ui/MobileApp";
import "./App.css";

// Run one-time startup tasks per app launch.
let startupRan = false;

const ICON = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z" /></svg>,
  jobs: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>,
  tracker: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>,
  toolkit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /></svg>,
  coach: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"><path d="M21 12a8 8 0 01-11.4 7.2L4 20.5l1.3-5.4A8 8 0 1121 12z" /></svg>,
  focus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>,
};

interface Primary { to: string; label: string; icon: ReactNode; badge?: "tracker" }
const PRIMARY: Primary[] = [
  { to: "/dashboard", label: "Home", icon: ICON.home },
  { to: "/internships", label: "Jobs", icon: ICON.jobs },
  { to: "/applications", label: "Tracker", icon: ICON.tracker, badge: "tracker" },
  { to: "/resumes", label: "Toolkit", icon: ICON.toolkit },
  { to: "/chat", label: "Coach", icon: ICON.coach },
];

// Everything else stays reachable — under "More" and in the ⌘K palette.
const MORE: { to: string; label: string; glyph: string }[] = [
  { to: "/", label: "Fast Apply", glyph: "⚡" },
  { to: "/watchlist", label: "Watchlist", glyph: "★" },
  { to: "/radar", label: "Release Radar", glyph: "◉" },
  { to: "/resume-lab", label: "Résumé Lab", glyph: "⚗" },
  { to: "/bullets", label: "Bullet Library", glyph: "✎" },
  { to: "/experiences", label: "Experiences", glyph: "❝" },
  { to: "/answers", label: "Answer Vault", glyph: "✍" },
  { to: "/apply", label: "Apply Assist", glyph: "➤" },
  { to: "/prep", label: "Interview Prep", glyph: "◎" },
  { to: "/networking", label: "Networking", glyph: "⚇" },
  { to: "/emails", label: "Email Inbox", glyph: "✉" },
  { to: "/profile", label: "Profile", glyph: "◍" },
  { to: "/settings", label: "Settings", glyph: "⚙" },
];

const COMMANDS: Command[] = [
  ...PRIMARY.map((p) => ({ label: p.label, to: p.to, group: "Destination" })),
  { label: "Focus Session", to: "/focus", group: "Mode" },
  ...MORE.map((m) => ({ label: m.label, to: m.to, group: "Tools" })),
];

export default function App() {
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const [moreOpen, setMoreOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [trackerBadge, setTrackerBadge] = useState(0);
  const [me, setMe] = useState<{ name: string; sub: string; initials: string }>({ name: "You", sub: cloudMode() ? "Cloud" : "Local", initials: "··" });

  useEffect(() => {
    if (startupRan) return;
    startupRan = true;
    if (!isTauri()) return;
    checkNewListingsAndNotify();
    pushProfileToBridge();
    pushAnswersToBridge();
    startBridgeListener();
    startMobileBridge();
    pushSnapshotToBridge();
    const iv = window.setInterval(pushSnapshotToBridge, 15000);
    const onRec = () => pushSnapshotToBridge();
    window.addEventListener("internpilot:application-recorded", onRec);
    return () => { window.clearInterval(iv); window.removeEventListener("internpilot:application-recorded", onRec); };
  }, []);

  // ⌘K / Ctrl-K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Light shell data: the tracker badge and the "me" footer.
  useEffect(() => {
    getStatusCounts().then((c) => setTrackerBadge(c.oa + c.interview)).catch(() => {});
    getProfile().then((p) => {
      if (!p) return;
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "You";
      const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "··";
      setMe({ name, sub: cloudMode() ? "Cloud · synced" : "Local · Beta", initials });
    }).catch(() => {});
  }, []);

  if (isPhone && !isTauri()) return <MobileApp />;

  return (
    <div className="app-shell dsk">
      <aside className="dsk-rail">
        <div className="dsk-brand">
          <AscentMark size={28} className="dsk-mark" />
          <div><b>InternPilot</b><span>{cloudMode() ? "Cloud" : "Local"}</span></div>
        </div>

        <button type="button" className="dsk-focus" onClick={() => navigate("/focus")}>
          {ICON.focus}<b>Focus session</b><span>25m</span>
        </button>

        <nav className="dsk-nav">
          {PRIMARY.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => "dsk-nav-item" + (isActive ? " active" : "")}>
              {item.icon}<span className="dsk-label">{item.label}</span>
              {item.badge === "tracker" && trackerBadge > 0 && <em className="dsk-badge hot">{trackerBadge}</em>}
            </NavLink>
          ))}

          <button type="button" className={"dsk-more-btn" + (moreOpen ? " open" : "")} onClick={() => setMoreOpen((o) => !o)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
            <span className="dsk-label">More tools</span>
            <svg className="dsk-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {moreOpen && (
            <div className="dsk-more-list">
              {MORE.map((m) => (
                <NavLink key={m.to} to={m.to} end={m.to === "/"} className={({ isActive }) => "dsk-more-item" + (isActive ? " active" : "")}>
                  <span className="dsk-glyph">{m.glyph}</span><span className="dsk-label">{m.label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        <div className="dsk-foot">
          <NavLink to="/profile" className="dsk-me">
            <span className="dsk-av">{me.initials}</span>
            <span className="dsk-who"><b>{me.name}</b><span>{me.sub}</span></span>
          </NavLink>
        </div>
      </aside>

      <div className="dsk-main">
        <header className="dsk-top">
          <button type="button" className="dsk-cmdk" onClick={() => setCmdOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            Search roles, companies, applications
            <kbd>⌘K</kbd>
          </button>
          <span className="dsk-spacer" />
          <span className="dsk-sync"><i />{cloudMode() ? "Synced" : "Local"}</span>
        </header>

        <main className="main">
          <Suspense fallback={<p className="hint" style={{ padding: "8px 2px" }}>Loading…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} commands={COMMANDS} />
    </div>
  );
}
