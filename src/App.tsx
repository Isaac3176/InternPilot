import { Suspense, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { checkNewListingsAndNotify } from "./listings/notify";
import { pushProfileToBridge, pushAnswersToBridge, startBridgeListener } from "./bridge";
import { pushSnapshotToBridge, startMobileBridge } from "./mobile/sync";
import { isTauri } from "./lib/env";
import { AscentMark } from "./components/Logo";
import { useIsPhone } from "./mobile/ui/useIsPhone";
import MobileApp from "./mobile/ui/MobileApp";
import "./App.css";

// Run one-time startup tasks per app launch.
let startupRan = false;

interface NavItem { to: string; label: string; icon: string; end?: boolean }
interface NavGroup { id: string; label: string; items: NavItem[] }

// Focus is a mode, pinned above the groups. Profile/Settings live in the footer.
const FOCUS: NavItem = { to: "/focus", label: "Focus Session", icon: "⏱" };
const GROUPS: NavGroup[] = [
  { id: "discover", label: "Discover", items: [
    { to: "/", label: "Fast Apply", icon: "⚡", end: true },
    { to: "/dashboard", label: "Dashboard", icon: "▣" },
    { to: "/internships", label: "Internships", icon: "◆" },
    { to: "/watchlist", label: "Watchlist", icon: "★" },
    { to: "/radar", label: "Release Radar", icon: "◉" },
  ] },
  { id: "track", label: "Track", items: [
    { to: "/applications", label: "Applications", icon: "▤" },
    { to: "/emails", label: "Email Inbox", icon: "✉" },
  ] },
  { id: "materials", label: "Materials", items: [
    { to: "/resumes", label: "Resume Center", icon: "▦" },
    { to: "/resume-lab", label: "Résumé Lab", icon: "⚗" },
    { to: "/bullets", label: "Bullet Library", icon: "✎" },
    { to: "/experiences", label: "Experiences", icon: "❝" },
    { to: "/answers", label: "Answer Vault", icon: "✍" },
  ] },
  { id: "prepare", label: "Prepare", items: [
    { to: "/prep", label: "Interview Prep", icon: "◎" },
    { to: "/networking", label: "Networking", icon: "⚇" },
    { to: "/chat", label: "AI Chat", icon: "✦" },
    { to: "/apply", label: "Apply Assist", icon: "➤" },
  ] },
];
const FOOTER: NavItem[] = [
  { to: "/profile", label: "Profile", icon: "◍" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

const GROUPS_KEY = "internpilot.nav.openGroups";
function loadOpenGroups(): Set<string> {
  try { const raw = localStorage.getItem(GROUPS_KEY); if (raw) return new Set(JSON.parse(raw) as string[]); } catch { /* ignore */ }
  return new Set();
}
function matchItem(pathname: string, to: string, end?: boolean): boolean {
  if (end || to === "/") return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}

export default function App() {
  const [navOpen, setNavOpen] = useState(false);
  const isPhone = useIsPhone();
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<Set<string>>(loadOpenGroups);

  useEffect(() => {
    if (startupRan) return;
    startupRan = true;
    // Bridge, notifications, and the LAN mobile server are desktop-only (Tauri).
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

  const activeGroup = useMemo(
    () => GROUPS.find((g) => g.items.some((i) => matchItem(location.pathname, i.to, i.end)))?.id ?? null,
    [location.pathname],
  );

  // Always reveal the section you're currently in (so you can see where you are),
  // then let the choice persist — you can still collapse it while you stay.
  useEffect(() => {
    if (activeGroup) setOpenGroups((prev) => (prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)));
  }, [activeGroup]);
  useEffect(() => {
    try { localStorage.setItem(GROUPS_KEY, JSON.stringify([...openGroups])); } catch { /* ignore */ }
  }, [openGroups]);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  if (isPhone && !isTauri()) return <MobileApp />;

  return (
    <div className="app-shell">
      {/* Mobile-only top bar with a menu toggle (sidebar is off-canvas on phones). */}
      <header className="mobile-topbar">
        <button type="button" className="menu-btn" aria-label="Menu" onClick={() => setNavOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <AscentMark size={22} className="brand-mark" />
        <b>InternPilot</b>
      </header>

      {navOpen && <div className="nav-overlay" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <div className="brand">
          <AscentMark size={28} className="brand-mark" />
          <span>
            InternPilot AI
            <div className="sub">Career assistant</div>
          </span>
        </div>

        <nav className="nav">
          <NavLink to={FOCUS.to} className="nav-focus" onClick={() => setNavOpen(false)}>
            <span className="ico">{FOCUS.icon}</span>{FOCUS.label}
          </NavLink>

          {GROUPS.map((g) => {
            const open = openGroups.has(g.id);
            return (
              <div className="nav-group" key={g.id}>
                <button type="button" className={`nav-group-h${open ? " open" : ""}`} onClick={() => toggleGroup(g.id)} aria-expanded={open}>
                  <span>{g.label}</span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {open && (
                  <div className="nav-group-items">
                    {g.items.map((item) => (
                      <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setNavOpen(false)}>
                        <span className="ico">{item.icon}</span>{item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {FOOTER.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-foot-item" onClick={() => setNavOpen(false)}>
              <span className="ico">{item.icon}</span>{item.label}
            </NavLink>
          ))}
          <span className="beta">Beta</span>
        </div>
      </aside>

      <main className="main">
        <Suspense fallback={<p className="hint" style={{ padding: "8px 2px" }}>Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
