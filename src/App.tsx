import { Suspense, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { checkNewListingsAndNotify } from "./listings/notify";
import { pushProfileToBridge, startBridgeListener } from "./bridge";
import { AscentMark } from "./components/Logo";
import "./App.css";

// Run one-time startup tasks per app launch.
let startupRan = false;

const NAV = [
  { to: "/", label: "Fast Apply", icon: "⚡", end: true },
  { to: "/dashboard", label: "Dashboard", icon: "▣", end: false },
  { to: "/applications", label: "Applications", icon: "▤", end: false },
  { to: "/internships", label: "Internships", icon: "◆", end: false },
  { to: "/watchlist", label: "Watchlist", icon: "★", end: false },
  { to: "/radar", label: "Release Radar", icon: "◉", end: false },
  { to: "/resumes", label: "Resume Center", icon: "▦", end: false },
  { to: "/bullets", label: "Bullet Library", icon: "✎", end: false },
  { to: "/networking", label: "Networking", icon: "⚇", end: false },
  { to: "/prep", label: "Interview Prep", icon: "◎", end: false },
  { to: "/experiences", label: "Experiences", icon: "❝", end: false },
  { to: "/apply", label: "Apply Assist", icon: "➤", end: false },
  { to: "/emails", label: "Email Inbox", icon: "✉", end: false },
  { to: "/chat", label: "AI Chat", icon: "✦", end: false },
  { to: "/profile", label: "Profile", icon: "◍", end: false },
  { to: "/settings", label: "Settings", icon: "⚙", end: false },
];

export default function App() {
  useEffect(() => {
    if (startupRan) return;
    startupRan = true;
    checkNewListingsAndNotify();
    pushProfileToBridge();
    startBridgeListener();
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <AscentMark size={28} className="brand-mark" />
          <span>
            InternPilot AI
            <div className="sub">Career assistant</div>
          </span>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span className="ico">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">Local-only · Beta</div>
      </aside>
      <main className="main">
        <Suspense fallback={<p className="hint" style={{ padding: "8px 2px" }}>Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
