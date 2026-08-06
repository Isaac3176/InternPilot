/**
 * Mobile bridge: push a compact snapshot of the user's search to the local
 * bridge server (which serves it to the phone over Wi-Fi), and apply the actions
 * the phone sends back (queue a role, move a stage) to the real SQLite data.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getBridgeToken, APP_RECORDED_EVENT } from "../bridge";
import { getProfile } from "../db/profile";
import { createApplication, listApplications, setApplicationStatus } from "../db/applications";
import { listInterviews } from "../db/interviews";
import { getStatusCounts, getWeeklyApplications } from "../db/metrics";
import { getNextActions } from "../actions/engine";
import { getOpportunityQueue } from "../ranking/queue";
import type { ApplicationRow, Status } from "../db/types";

function daysSince(d: string | null): number {
  if (!d) return 999;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}
function daysUntil(d: string): number {
  return Math.round((new Date(d).getTime() - Date.now()) / 86_400_000);
}

function trackerCard(a: ApplicationRow) {
  const age = daysSince(a.date_applied ?? a.date_saved);
  const note = a.status === "oa" ? "OA due" : a.status === "interview" ? "interview"
    : a.status === "offer" ? "decide" : a.status === "applied" ? (age >= 10 ? "no reply" : "applied") : a.status;
  return {
    id: a.id, company: a.company_name ?? "—", title: a.role_title, status: a.status,
    ageLabel: `${age}d`, note, warn: a.status === "oa" || a.status === "interview" || (a.status === "applied" && age >= 10),
  };
}

async function buildSnapshot() {
  const [counts, weekly, apps, interviews, profile, nba, queue] = await Promise.all([
    getStatusCounts(), getWeeklyApplications(7), listApplications(), listInterviews(),
    getProfile(), getNextActions(4), getOpportunityQueue().catch(() => null),
  ]);

  // Tracker grouped by urgency.
  const active = apps.filter((a) => a.status !== "rejected");
  const needsAction = active.filter((a) => a.status === "oa" || a.status === "interview").map(trackerCard);
  const quiet = active.filter((a) => a.status === "applied" && daysSince(a.date_applied ?? a.date_saved) >= 10).map(trackerCard);
  const usedIds = new Set([...needsAction, ...quiet].map((c) => c.id));
  const inFlight = active.filter((a) => !usedIds.has(a.id)).slice(0, 12).map(trackerCard);

  // Closing soon: interviews/OAs within a week.
  const due = interviews
    .filter((iv) => iv.date && daysUntil(iv.date) >= 0 && daysUntil(iv.date) <= 7)
    .map((iv) => ({ title: `${iv.company_name ?? "A company"} — ${iv.type}`, detail: iv.role_title ?? "", days: Math.max(0, daysUntil(iv.date!)) }))
    .sort((a, b) => a.days - b.days).slice(0, 3);

  const discover = (queue?.today.length ? queue.today : queue?.items ?? []).slice(0, 12).map((o) => ({
    id: o.id, company: o.company, title: o.title, url: o.url, score: o.priority,
    locations: o.locations, salary: o.salary ?? null, season: o.season ?? null,
    posted: o.freshnessLabel, sponsorshipOk: o.sponsorshipOk,
  }));

  return {
    initials: [profile?.first_name, profile?.last_name].filter(Boolean).map((s) => s![0]?.toUpperCase()).join("") || "IP",
    pipeline: counts,
    weekly,
    nba: nba.map((a) => ({ title: a.title, detail: a.detail, kind: a.kind })),
    due,
    discover,
    tracker: {
      needsAction, quiet, inFlight,
      counts: { all: apps.length, oa: counts.oa, interview: counts.interview, applied: counts.applied, offer: counts.offer },
    },
  };
}

export async function pushSnapshotToBridge(): Promise<void> {
  try {
    const snap = await buildSnapshot();
    await invoke("bridge_set_snapshot", { token: getBridgeToken(), snapshot: JSON.stringify(snap) });
  } catch (e) {
    console.error("snapshot push failed", e);
  }
}

let listening = false;
/** Listen for phone actions and apply them to the DB, then refresh the snapshot. */
export async function startMobileBridge(): Promise<void> {
  if (listening) return;
  listening = true;
  await listen<Record<string, unknown>>("bridge://mobile-action", async (event) => {
    const a = event.payload ?? {};
    try {
      if (a.type === "queue") {
        const url = (a.url as string) || null;
        const existing = await listApplications();
        if (!url || !existing.some((x) => x.job_link === url)) {
          await createApplication({
            company_name: (a.company as string) ?? "", role_title: (a.title as string) || "Application",
            job_link: url, status: "interested",
          });
        }
      } else if (a.type === "status" && typeof a.appId === "number") {
        await setApplicationStatus(a.appId, a.status as Status);
      }
      window.dispatchEvent(new CustomEvent(APP_RECORDED_EVENT));
    } catch (e) {
      console.error("mobile action failed", e);
    }
    pushSnapshotToBridge();
  });
}

/** Get the phone URL + token for the connect card. */
export async function getPhoneAccess(): Promise<{ url: string; token: string }> {
  const token = getBridgeToken();
  try {
    const info = JSON.parse(await invoke<string>("bridge_info"));
    return { url: `http://${info.ip}:${info.port}/#t=${token}`, token };
  } catch {
    return { url: "", token };
  }
}
