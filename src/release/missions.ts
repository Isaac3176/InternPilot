/**
 * Release Radar networking missions. A predicted opening window is only useful
 * if you act on it against real people — so a mission pairs the forecast with
 * your strongest contacts, a referral status, and phase-appropriate dated tasks
 * that change as the window approaches (identify → outreach → finalize → apply).
 */
import { bestConnection, type BestPath } from "../networking/graph";
import { extractTeam } from "../networking/connections";
import { REFERRAL_STATUS_LABELS, type ContactRow, type Profile, type ReferralRow, type ReferralStatus } from "../db/types";
import type { RadarEntry } from "./radar";

export type MissionPhase = "identify" | "outreach" | "finalize" | "apply" | "watch";
export const PHASE_LABEL: Record<MissionPhase, string> = {
  identify: "Identify contacts", outreach: "Start outreach", finalize: "Follow up & finalize", apply: "Apply now", watch: "Watching",
};

export interface MissionTask { id: string; label: string }
export interface Mission {
  phase: MissionPhase;
  headline: string;
  daysUntil: number | null;
  best: BestPath | null;
  savedCount: number;
  referralStatus: ReferralStatus | null;
  referralStatusLabel: string | null;
  tasks: MissionTask[];
}

function phaseFor(entry: RadarEntry): MissionPhase {
  if (entry.state === "open") return "apply";
  if (entry.state === "signal") return "finalize";
  const d = entry.daysUntilWindow;
  if (d == null) return "watch";
  if (d <= 0) return "finalize";     // inside the window
  if (d <= 7) return "finalize";
  if (d <= 14) return "outreach";
  if (d <= 30) return "identify";
  return "watch";
}

const TASKS: Record<MissionPhase, MissionTask[]> = {
  identify: [
    { id: "id-alumni", label: "Find 3-5 alumni / warm contacts at the company" },
    { id: "id-eng", label: "Identify 2 engineers on a relevant team" },
    { id: "id-rec", label: "Find the university / early-career recruiter" },
  ],
  outreach: [
    { id: "out-connect", label: "Send connection requests to your strongest 3" },
    { id: "out-ask", label: "Ask about their experience & the intern-cycle timeline" },
  ],
  finalize: [
    { id: "fin-follow", label: "Follow up with anyone who hasn't replied" },
    { id: "fin-resume", label: "Finalize the résumé you'll use here" },
    { id: "fin-referral", label: "Line up who could refer you the day it opens" },
  ],
  apply: [
    { id: "ap-send", label: "Send the job ID to your strongest contact" },
    { id: "ap-referral", label: "Request a referral if appropriate" },
    { id: "ap-apply", label: "Apply within 24 hours" },
  ],
  watch: [
    { id: "w-watch", label: "On your watchlist — the mission starts ~30 days before the window" },
  ],
};

const STATUS_RANK: ReferralStatus[] = [
  "referral_confirmed", "referral_submitted", "referral_agreed", "contact_responded",
  "outreach_sent", "outreach_planned", "potential_contact",
];

export function buildMission(entry: RadarEntry, companyContacts: ContactRow[], referrals: ReferralRow[], profile: Profile | null): Mission {
  const phase = phaseFor(entry);
  const best = bestConnection(companyContacts, extractTeam("Software Engineer Intern"), profile);
  let referralStatus: ReferralStatus | null = null;
  for (const s of STATUS_RANK) if (referrals.some((r) => r.status === s)) { referralStatus = s; break; }
  const d = entry.daysUntilWindow;
  const headline =
    phase === "apply" ? "Open now — surface your best contact and apply."
    : phase === "finalize" ? `${d != null && d > 0 ? `~${d} days out` : "In the window"} — follow up and finalize.`
    : phase === "outreach" ? `~${d} days out — start outreach now, before the rush.`
    : phase === "identify" ? `~${d} days out — line up who you know before it opens.`
    : "Watching — the mission starts ~30 days before the window.";
  return {
    phase, headline, daysUntil: d, best, savedCount: companyContacts.length,
    referralStatus, referralStatusLabel: referralStatus ? REFERRAL_STATUS_LABELS[referralStatus] : null,
    tasks: TASKS[phase],
  };
}

// ── per-company mission checklist state ──────────────────────────────────────
const MK = (company: string) => `internpilot.mission.${company.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
export function getMissionState(company: string): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(MK(company)) ?? "{}"); } catch { return {}; }
}
export function setMissionState(company: string, state: Record<string, boolean>): void {
  try { localStorage.setItem(MK(company), JSON.stringify(state)); } catch { /* ignore */ }
}
