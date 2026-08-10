import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
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

const NAV = [
  { to: "/", label: "Fast Apply", icon: "⚡", end: true },
  { to: "/focus", label: "Focus Session", icon: "⏱", end: false },
  { to: "/dashboard", label: "Dashboard", icon: "▣", end: false },
  { to: "/applications", label: "Applications", icon: "▤", end: false },
  { to: "/internships", label: "Internships", icon: "◆", end: false },
  { to: "/watchlist", label: "Watchlist", icon: "★", end: false },
  { to: "/radar", label: "Release Radar", icon: "◉", end: false },
  { to: "/resumes", label: "Resume Center", icon: "▦", end: false },
  { to: "/resume-lab", label: "Résumé Lab", icon: "⚗", end: false },
  { to: "/bullets", label: "Bullet Library", icon: "✎", end: false },
  { to: "/networking", label: "Networking", icon: "⚇", end: false },
  { to: "/prep", label: "Interview Prep", icon: "◎", end: false },
  { to: "/experiences", label: "Experiences", icon: "❝", end: false },
  { to: "/apply", label: "Apply Assist", icon: "➤", end: false },
  { to: "/answers", label: "Answer Vault", icon: "✍", end: false },
  { to: "/emails", label: "Email Inbox", icon: "✉", end: false },
  { to: "/chat", label: "AI Chat", icon: "✦", end: false },
  { to: "/profile", label: "Profile", icon: "◍", end: false },
  { to: "/settings", label: "Settings", icon: "⚙", end: false },
];

export default function App() {
  const [navOpen, setNavOpen] = useState(false);
  const isPhone = useIsPhone();
  useEffect(() => {
    if (startupRan) return;
    startupRan = true;
    // Bridge, notifications, and the LAN mobile server are desktop-only (Tauri).
    // In a browser / the deployed web build, skip them entirely.
    if (!isTauri()) return;
    checkNewListingsAndNotify();
    pushProfileToBridge();
    pushAnswersToBridge();
    startBridgeListener();
    startMobileBridge();
    pushSnapshotToBridge();
    // Keep the phone's snapshot fresh while the app is open.
    const iv = window.setInterval(pushSnapshotToBridge, 15000);
    const onRec = () => pushSnapshotToBridge();
    window.addEventListener("internpilot:application-recorded", onRec);
    return () => { window.clearInterval(iv); window.removeEventListener("internpilot:application-recorded", onRec); };
  }, []);

  // On a phone in the web/PWA build, render the purpose-built mobile shell
  // instead of the desktop sidebar layout. The desktop app (Tauri) always
  // uses the full layout, even in a narrow window.
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
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setNavOpen(false)}>
              <span className="ico">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">Beta</div>
      </aside>
      <main className="main">
        <Suspense fallback={<p className="hint" style={{ padding: "8px 2px" }}>Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
