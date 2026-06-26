import { NavLink, Outlet } from "react-router-dom";
import "./App.css";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▣", end: true },
  { to: "/applications", label: "Applications", icon: "▤", end: false },
  { to: "/resumes", label: "Resume Center", icon: "▦", end: false },
  { to: "/bullets", label: "Bullet Library", icon: "✎", end: false },
  { to: "/prep", label: "Interview Prep", icon: "◎", end: false },
  { to: "/experiences", label: "Experiences", icon: "❝", end: false },
  { to: "/chat", label: "AI Chat", icon: "✦", end: false },
  { to: "/settings", label: "Settings", icon: "⚙", end: false },
];

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">IP</span>
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
        <div className="sidebar-footer">MVP · Phase 1 · Local-only</div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
