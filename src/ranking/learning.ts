/**
 * Adaptive learning: feedback on queue items gently tunes role-family and
 * company preferences over REPEATED signals — a single dismissal barely moves
 * the needle. The learned weights feed back into the priority score, and the
 * user can see and reset them (see Settings → Learned preferences).
 */
import type { RankedListing } from "../listings/types";
import type { ScoreReason } from "./types";

export type FeedbackKind =
  | "good" | "wrong_role" | "wrong_company" | "not_eligible"
  | "too_old" | "duplicate" | "not_interested" | "already_applied";

interface LearnState {
  roleWeights: Record<string, number>; // family token -> weight
  companyWeights: Record<string, number>; // normalized company -> weight
  events: number;
}

const KEY = "internpilot.ranking.learning";
const STEP = 0.5; // small nudge per event → needs repetition to matter
const CLAMP = 3; // max magnitude per token/company
const SCALE = 2; // weight → score points

// Role families we recognize in a title.
const FAMILY: [string, RegExp][] = [
  ["frontend", /front[\s-]?end|\bui\b|react|angular|\bvue\b/],
  ["backend", /back[\s-]?end|\bapi\b|server[\s-]?side/],
  ["fullstack", /full[\s-]?stack/],
  ["ml", /machine learning|\bml\b|\bai\b|deep learning/],
  ["data", /\bdata\b|analytics|\betl\b/],
  ["security", /security|infosec|appsec/],
  ["platform", /platform|infrastructure|\bsre\b|devops|reliability/],
  ["cloud", /cloud|\baws\b|azure|\bgcp\b|kubernetes/],
  ["mobile", /mobile|\bios\b|android/],
  ["embedded", /embedded|firmware/],
  ["hardware", /hardware|asic|fpga|electrical/],
  ["qa", /\bqa\b|\btest\b|quality assurance/],
];

function normName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function familyTokens(title: string): string[] {
  const t = (title || "").toLowerCase();
  return FAMILY.filter(([, re]) => re.test(t)).map(([k]) => k);
}
const clamp = (n: number) => Math.max(-CLAMP, Math.min(CLAMP, n));

export function getLearn(): LearnState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { roleWeights: {}, companyWeights: {}, events: 0, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { roleWeights: {}, companyWeights: {}, events: 0 };
}
function save(s: LearnState): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

function nudgeRole(state: LearnState, tokens: string[], dir: number): void {
  for (const tok of tokens) state.roleWeights[tok] = clamp((state.roleWeights[tok] ?? 0) + dir * STEP);
}
function nudgeCompany(state: LearnState, company: string, dir: number): void {
  const k = normName(company);
  if (k) state.companyWeights[k] = clamp((state.companyWeights[k] ?? 0) + dir * STEP);
}

/** Apply a feedback signal from one listing to the learned preferences. */
export function recordFeedback(listing: RankedListing, kind: FeedbackKind): void {
  const s = getLearn();
  const tokens = familyTokens(listing.title);
  switch (kind) {
    case "good":
      nudgeRole(s, tokens, +1); nudgeCompany(s, listing.company, +1); break;
    case "wrong_role":
    case "not_interested":
      nudgeRole(s, tokens, -1); break;
    case "wrong_company":
      nudgeCompany(s, listing.company, -1); break;
    // too_old / duplicate / not_eligible / already_applied are about the item,
    // not your taste — they hide it but don't move preferences.
    default:
      break;
  }
  s.events += 1;
  save(s);
}

/** Applied-signal helper: repeatedly applying to a family boosts it. */
export function recordApplySignal(listing: RankedListing): void {
  const s = getLearn();
  nudgeRole(s, familyTokens(listing.title), +1);
  nudgeCompany(s, listing.company, +1);
  s.events += 1;
  save(s);
}

/** Score delta + explanation from learned preferences, for one listing. */
export function learningAdjustment(listing: RankedListing): { delta: number; reasons: ScoreReason[] } {
  const s = getLearn();
  let delta = 0;
  for (const tok of familyTokens(listing.title)) delta += Math.round((s.roleWeights[tok] ?? 0) * SCALE);
  delta += Math.round((s.companyWeights[normName(listing.company)] ?? 0) * SCALE);
  delta = Math.max(-12, Math.min(12, delta));
  const reasons: ScoreReason[] = [];
  if (delta > 0) reasons.push({ label: "Matches roles you've favored", delta });
  else if (delta < 0) reasons.push({ label: "Similar to ones you passed on", delta });
  return { delta, reasons };
}

export interface LearnSummary {
  events: number;
  roles: { key: string; weight: number }[];
  companies: { key: string; weight: number }[];
}
export function learnSummary(): LearnSummary {
  const s = getLearn();
  const nonzero = (m: Record<string, number>) =>
    Object.entries(m).filter(([, w]) => Math.abs(w) >= 0.5)
      .map(([key, weight]) => ({ key, weight }))
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  return { events: s.events, roles: nonzero(s.roleWeights), companies: nonzero(s.companyWeights) };
}
export function resetLearning(): void {
  localStorage.removeItem(KEY);
}
