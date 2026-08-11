import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { NAV, type NavCounts, type NavItem } from "./nav";
import "./Sidebar.css";

const COLLAPSE_KEY = "ip.sidebar.collapsed";
const AUTO_COLLAPSE_AT = 1040; // px

interface Props {
  counts?: NavCounts;
  user?: { initials: string; name: string; note?: string };
  onStartFocus?: () => void;
  onSignOut?: () => void;
}

export default function Sidebar({
  counts = {},
  user = { initials: "··", name: "You", note: "Beta" },
  onStartFocus,
  onSignOut,
}: Props) {
  const { pathname } = useLocation();

  /* ---------- collapse: manual choice wins, window width is the fallback ---------- */
  const [manual, setManual] = useState<boolean | null>(() => {
    const v = localStorage.getItem(COLLAPSE_KEY);
    return v === null ? null : v === "1";
  });
  const [narrowWindow, setNarrowWindow] = useState(() => window.innerWidth < AUTO_COLLAPSE_AT);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${AUTO_COLLAPSE_AT - 1}px)`);
    const on = (e: MediaQueryListEvent) => setNarrowWindow(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const collapsed = narrowWindow ? true : manual ?? false;

  function toggleCollapse() {
    const next = !collapsed;
    setManual(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  }

  /* ---------- which section is open (matches the parent OR any of its children) ---------- */
  const activeId = useMemo(() => {
    const hit = (to: string) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/"));
    let best: NavItem | undefined;
    let bestLen = -1;
    for (const item of NAV) {
      for (const to of [item.to, ...(item.children?.map((c) => c.to) ?? [])]) {
        if (hit(to) && to.length > bestLen) { best = item; bestLen = to.length; }
      }
    }
    return best?.id;
  }, [pathname]);

  // A section the user opened without navigating into it yet.
  const [peeked, setPeeked] = useState<string | null>(null);
  useEffect(() => setPeeked(null), [activeId]);

  const [acctOpen, setAcctOpen] = useState(false);
  useEffect(() => setAcctOpen(false), [pathname]);

  /* ---------- roving keyboard focus ---------- */
  const listRef = useRef<HTMLDivElement>(null);
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-navfocus]") ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowDown" ? i + 1 : i - 1;
    items[(next + items.length) % items.length]?.focus();
  }

  return (
    <aside className={"ip-sidebar" + (collapsed ? " is-collapsed" : "")}>
      <div className="ip-brand">
        <svg className="ip-mark" viewBox="0 0 32 32" fill="none" aria-hidden>
          <path d="M4.6 25.4 16 14l11.4 11.4" stroke="#4E93F5" strokeOpacity=".45" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.4 9.6 16 4l5.6 5.6" stroke="#4E93F5" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="ip-brand-tx">
          <b>InternPilot AI</b>
          <span>Summer 2027</span>
        </span>
      </div>

      {/* A mode, not a destination — hence the border and the tint. */}
      <button type="button" className="ip-focus" onClick={onStartFocus} title={collapsed ? "Start a focus session" : undefined}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" />
        </svg>
        <b>Focus session</b>
        <em>25m</em>
      </button>

      <nav className="ip-nav" ref={listRef} onKeyDown={onKeyDown} aria-label="Main">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;
          const open = isActive || peeked === item.id;
          const badge = item.badge ? counts[item.badge] : undefined;
          const alert = item.alertBadge ? counts[item.alertBadge] : undefined;

          return (
            <div key={item.id} className="ip-section">
              <NavLink
                to={item.to}
                end={item.to === "/"}
                data-navfocus
                className={"ip-item" + (open ? " is-open" : "")}
                title={collapsed ? item.label : undefined}
                onClick={() => { if (!collapsed && item.children && !isActive) setPeeked(item.id); }}
              >
                <Icon aria-hidden />
                <span className="ip-label">{item.label}</span>
                {alert ? <em className="ip-badge is-alert">{alert}</em> : null}
                {!alert && badge ? <em className="ip-badge">{badge}</em> : null}
                {item.children ? (
                  <svg className="ip-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                ) : null}
              </NavLink>

              {item.children && open && !collapsed ? (
                <div className="ip-sub">
                  {item.children.map((child) => {
                    const n = child.badge ? counts[child.badge] : undefined;
                    return (
                      <NavLink key={child.to} to={child.to} end={child.end} data-navfocus className="ip-subitem">
                        <span className="ip-dot" aria-hidden />
                        <span className="ip-label">{child.label}</span>
                        {n ? <span className="ip-n">{n}</span> : null}
                      </NavLink>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="ip-foot">
        {acctOpen && (
          <>
            <div className="ip-acct-scrim" onClick={() => setAcctOpen(false)} />
            <div className="ip-acct" role="menu">
              <NavLink to="/profile" role="menuitem"><span className="ip-glyph">◍</span>Profile</NavLink>
              <NavLink to="/settings" role="menuitem"><span className="ip-glyph">⚙</span>Settings</NavLink>
              {onSignOut && <><div className="sep" /><button type="button" className="danger" role="menuitem" onClick={() => { setAcctOpen(false); onSignOut(); }}><span className="ip-glyph">⏻</span>Sign out</button></>}
            </div>
          </>
        )}
        <button type="button" className="ip-me" onClick={() => setAcctOpen((o) => !o)} aria-haspopup="menu" aria-expanded={acctOpen}>
          <span className="ip-av">{user.initials}</span>
          <span className="ip-who">
            <b>{user.name}</b>
            {user.note ? <span>{user.note}</span> : null}
          </span>
          <svg className="ip-up" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
          </svg>
        </button>

        {!narrowWindow && (
          <button type="button" className="ip-collapse" onClick={toggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
            </svg>
            <span className="ip-label">Collapse</span>
          </button>
        )}
      </div>
    </aside>
  );
}
