import { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { LoadingState } from "./components/PageState";
import { isTauri } from "./lib/env";
import { cloudMode } from "./cloud/supabase";
import { cloudSignOut } from "./cloud/auth";
import { getProfile } from "./db/profile";
import { listResumeBullets } from "./db/resumes";
import { useIsPhone } from "./mobile/ui/useIsPhone";
import Sidebar from "./components/sidebar/Sidebar";
import type { NavCounts } from "./components/sidebar/nav";
import "./App.css";

const MobileApp = lazy(() => import("./mobile/ui/MobileApp"));

// Run one-time startup tasks per app launch.
let startupRan = false;

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isPhone = useIsPhone();
  const [counts, setCounts] = useState<NavCounts>({});
  const [user, setUser] = useState({ initials: "··", name: "You", note: cloudMode() ? "Cloud · synced" : "Local · Beta" });

  useEffect(() => {
    if (startupRan) return;
    startupRan = true;
    // Bridge, notifications, and the LAN mobile server are desktop-only (Tauri).
    if (!isTauri()) return;
    let cancelled = false;
    let interval: number | undefined;
    let pushSnapshot: (() => Promise<void>) | undefined;
    const onRec = () => { pushSnapshot?.().catch(console.error); };

    void (async () => {
      const [
        { checkNewListingsAndNotify },
        { checkRadarAndNotify },
        { checkLiveAndNotify },
        { pushProfileToBridge, pushAnswersToBridge, startBridgeListener },
        { pushSnapshotToBridge, startMobileBridge },
      ] = await Promise.all([
        import("./listings/notify"),
        import("./release/alerts"),
        import("./release/live"),
        import("./bridge"),
        import("./mobile/sync"),
      ]);
      if (cancelled) return;
      pushSnapshot = pushSnapshotToBridge;
      checkNewListingsAndNotify();
      checkRadarAndNotify();
      checkLiveAndNotify();
      pushProfileToBridge();
      pushAnswersToBridge();
      startBridgeListener();
      startMobileBridge();
      pushSnapshotToBridge();
      interval = window.setInterval(pushSnapshotToBridge, 15000);
      window.addEventListener("internpilot:application-recorded", onRec);
    })().catch(console.error);

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      window.removeEventListener("internpilot:application-recorded", onRec);
    };
  }, []);

  // Sidebar badges + the "me" footer. Each source resolves independently and
  // merges, so a slow/failed one never blocks the others. Skipped on the phone
  // build (the mobile shell fetches its own data).
  useEffect(() => {
    if (isPhone && !isTauri()) return;
    const merge = (patch: NavCounts) => setCounts((prev) => ({ ...prev, ...patch }));
    import("./db/metrics")
      .then(({ getStatusCounts }) => getStatusCounts())
      .then((c) => merge({ needsAction: c.oa + c.interview, savedJobs: c.interested }))
      .catch(() => {});
    import("./ranking/queue")
      .then(({ getOpportunityQueue }) => getOpportunityQueue())
      .then((q) => merge({ queued: q.counts.today, newToday: q.items.filter((o) => o.isNew).length }))
      .catch(() => {});
    import("./db/emails")
      .then(({ countEmails }) => countEmails())
      .then((n) => merge({ replies: n }))
      .catch(() => {});
    listResumeBullets()
      .then((bs) => merge({ flaggedBullets: bs.filter((b) => !b.improved_text || !b.improved_text.trim()).length }))
      .catch(() => {});
    getProfile().then((p) => {
      if (!p) return;
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "You";
      const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "··";
      setUser({ name, initials, note: cloudMode() ? "Cloud · synced" : "Local · Beta" });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPhone && !isTauri()) {
    return (
      <Suspense fallback={<p className="hint" style={{ padding: "8px 2px" }}>Loading...</p>}>
        <MobileApp />
      </Suspense>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        counts={counts}
        user={user}
        onStartFocus={() => navigate("/focus")}
        onSignOut={cloudMode() ? () => { cloudSignOut().catch(console.error); } : undefined}
      />
      <main className="main">
        <ErrorBoundary level="page" key={pathname}>
          <Suspense fallback={<LoadingState title="Loading page" detail="Getting this workspace ready." />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
