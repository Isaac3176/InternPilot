import { Suspense, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { checkNewListingsAndNotify } from "./listings/notify";
import { pushProfileToBridge, pushAnswersToBridge, startBridgeListener } from "./bridge";
import { pushSnapshotToBridge, startMobileBridge } from "./mobile/sync";
import { isTauri } from "./lib/env";
import { cloudMode } from "./cloud/supabase";
import { cloudSignOut } from "./cloud/auth";
import { getProfile } from "./db/profile";
import { getStatusCounts } from "./db/metrics";
import { useIsPhone } from "./mobile/ui/useIsPhone";
import MobileApp from "./mobile/ui/MobileApp";
import Sidebar from "./components/sidebar/Sidebar";
import type { NavCounts } from "./components/sidebar/nav";
import "./App.css";

// Run one-time startup tasks per app launch.
let startupRan = false;

export default function App() {
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const [counts, setCounts] = useState<NavCounts>({});
  const [user, setUser] = useState({ initials: "··", name: "You", note: cloudMode() ? "Cloud · synced" : "Local · Beta" });

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

  // Light shell data: sidebar badges + the "me" footer.
  useEffect(() => {
    getStatusCounts().then((c) => setCounts({ needsAction: c.oa + c.interview, savedJobs: c.interested })).catch(() => {});
    getProfile().then((p) => {
      if (!p) return;
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "You";
      const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "··";
      setUser({ name, initials, note: cloudMode() ? "Cloud · synced" : "Local · Beta" });
    }).catch(() => {});
  }, []);

  if (isPhone && !isTauri()) return <MobileApp />;

  return (
    <div className="app-shell">
      <Sidebar
        counts={counts}
        user={user}
        onStartFocus={() => navigate("/focus")}
        onSignOut={cloudMode() ? () => { cloudSignOut().catch(console.error); } : undefined}
      />
      <main className="main">
        <Suspense fallback={<p className="hint" style={{ padding: "8px 2px" }}>Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
