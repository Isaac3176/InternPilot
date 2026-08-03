import type { Profile } from "../db/types";
import type { RankedListing } from "../listings/types";
import { assessEligibility } from "../listings/eligibility";
import { roleScore, matchesTargetRoles, isGenericSwe, ENG_SIGNAL, NON_ROLE } from "../listings/service";
import { matchCompany, PRIORITY_WEIGHT } from "./companies";
import { getMutedPatterns } from "./feedback";
import type { RankingPrefs } from "./prefs";
import type { RankedOpportunity, RankTier, ScoreReason } from "./types";

// Known staffing / recruiting agencies — their postings are muted.
const STAFFING =
  /insight global|teksystems|robert half|randstad|aerotek|apex systems|kforce|cybercoders|motion recruitment|\bdice\b|collabera|judge group|beacon hill|system one|actalent|mindlance|akkodis|experis|talentburst|russell tobin|nam info|diverse lynx|compunnel|iidm|softworld/i;

const CLEARANCE = /security clearance|clearance (is )?required|ts\/sci|top secret|secret clearance|public trust|polygraph|\bitar\b/i;
const CITIZEN = /u\.?s\.? citizen(ship)?|must be a citizen|citizens? only|citizenship (is )?required/i;
const UNPAID = /unpaid|no pay|without pay|volunteer/i;

// Rough time-to-apply estimate by ATS/source.
const APPLY_MINUTES: Record<string, number> = {
  greenhouse: 9, lever: 8, ashby: 10, smartrecruiters: 11, workday: 16, icims: 15,
};

export interface RankContext {
  profile: Profile | null;
  prefs: RankingPrefs;
  contactCompanies: Set<string>; // normalized company names with a saved contact
  trackedUrls: Set<string>; // job_links already in applications
  now: number; // Date.now() ms
}

function normName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hoursSince(unixSeconds: number | undefined, nowMs: number): number | null {
  if (!unixSeconds) return null;
  return (nowMs - unixSeconds * 1000) / 3_600_000;
}

function relLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "Posted 2h ago" / "Discovered 4m ago" — prefers discovery for instant tiers. */
function freshnessLabel(ageH: number | null, discH: number | null, preferDiscovered: boolean): string {
  if (preferDiscovered && discH != null && (ageH == null || discH < ageH - 1)) return `Discovered ${relLabel(discH)}`;
  if (ageH != null) return `Posted ${relLabel(ageH)}`;
  if (discH != null) return `Discovered ${relLabel(discH)}`;
  return "New";
}

function estMinutes(source: string): number {
  const s = source.toLowerCase();
  for (const key of Object.keys(APPLY_MINUTES)) if (s.includes(key)) return APPLY_MINUTES[key];
  return 12;
}

function needsSponsorship(p: Profile | null): boolean {
  return !!p && (p.requires_sponsorship === "Yes" ||
    ["f1_opt", "f1_cpt", "h1b", "tn", "need_sponsorship", "other"].includes(p.work_auth ?? ""));
}

interface HardResult { hidden: boolean; reason?: string }

/** Deterministic exclusions applied before any scoring. */
function passesHardFilters(l: RankedListing, ctx: RankContext, eligLevel: string): HardResult {
  const { prefs } = ctx;
  const title = l.title.toLowerCase();
  const hay = `${l.title} ${l.company} ${l.sponsorship ?? ""} ${l.salary ?? ""}`;

  if (NON_ROLE.test(l.title)) return { hidden: true, reason: "Not a real role (course / talent pool)" };
  if (STAFFING.test(l.company) || STAFFING.test(l.title)) return { hidden: true, reason: "Staffing / recruiting agency" };
  if (UNPAID.test(hay)) return { hidden: true, reason: "Unpaid position" };
  if (CLEARANCE.test(hay) && ctx.profile?.security_clearance !== "Yes") return { hidden: true, reason: "Requires security clearance" };
  if (CITIZEN.test(hay) && ctx.profile?.work_auth !== "us_citizen") return { hidden: true, reason: "U.S. citizenship required" };
  if (eligLevel === "ineligible") return { hidden: true, reason: "Not eligible (work authorization)" };

  // Blocked role titles.
  for (const b of prefs.blockedRoles) {
    if (b && title.includes(b.toLowerCase())) return { hidden: true, reason: `Blocked role: ${b}` };
  }
  // User-muted patterns.
  for (const p of getMutedPatterns()) {
    if (p && title.includes(p)) return { hidden: true, reason: "Muted by you" };
  }
  // Explicit class-year mismatch (only when the title states one).
  const cls = l.title.match(/class of (20\d\d)|graduat\w*\s+(?:in\s+)?(20\d\d)/i);
  const year = cls ? Number(cls[1] || cls[2]) : 0;
  if (year && year !== prefs.graduationYear) return { hidden: true, reason: `Class of ${year} (you're ${prefs.graduationYear})` };

  return { hidden: false };
}

/** Score one listing into a fully-explained ranked opportunity. */
export function scoreOpportunity(l: RankedListing, ctx: RankContext): RankedOpportunity {
  const { prefs, now } = ctx;
  const target = matchCompany(l.company);
  const elig = assessEligibility(ctx.profile, l);
  const ageHours = hoursSince(l.datePosted, now);
  const discoveredHours = hoursSince(l.firstSeen, now);
  const effAge = ageHours ?? discoveredHours ?? 9999;
  const alreadyApplied = ctx.trackedUrls.has(l.url);
  const hasReferral = ctx.contactCompanies.has(normName(l.company));

  const reasons: ScoreReason[] = [];
  const add = (label: string, delta: number) => { if (delta !== 0) reasons.push({ label, delta }); };

  const hard = passesHardFilters(l, ctx, elig.level);
  // Muted when hidden by a filter, or simply too old.
  const tooOld = effAge > prefs.freshnessDays * 24;
  const hidden = hard.hidden || tooOld;
  const hiddenReason = hard.reason ?? (tooOld ? `Older than ${prefs.freshnessDays} days` : undefined);

  // ---- positive signals ----
  const companyPts = target ? PRIORITY_WEIGHT[target.priority] : 0;
  if (companyPts) add(`Target company: ${target!.name} (${target!.priority})`, companyPts);

  let rMatch = roleScore(l.title, prefs.targetRoles);
  if (rMatch < 0.8 && isGenericSwe(prefs.targetRoles) && ENG_SIGNAL.test(l.title)) rMatch = Math.max(rMatch, 0.8);
  const rolePts = Math.round(rMatch * 25);
  if (rolePts) add(rMatch >= 0.8 ? "Strong role match" : "Partial role match", rolePts);

  let freshPts = 0;
  if (effAge < 6) freshPts = 20;
  else if (effAge < 24) freshPts = 16;
  else if (effAge < 72) freshPts = 12;
  else if (effAge < 168) freshPts = 6;
  if (freshPts) add(effAge < 24 ? "Posted within a day" : "Recently posted", freshPts);

  const eligPts = elig.level === "eligible" ? 10 : elig.level === "review" ? 5 : elig.level === "unknown" ? 3 : 0;
  if (eligPts) add(`Eligibility: ${elig.label}`, eligPts);

  const locs = (ctx.profile?.locations ?? "").toLowerCase().split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const listingLocs = l.locations.join(" ").toLowerCase();
  const locPts = locs.length && locs.some((x) => listingLocs.includes(x)) ? 5 : 0;
  if (locPts) add("Preferred location", locPts);

  const refPts = hasReferral ? 5 : 0;
  if (refPts) add("Referral contact available", refPts);

  const qualPts = l.salary ? 5 : rMatch >= 0.8 ? 3 : 0;
  if (qualPts) add(l.salary ? "Compensation listed" : "Core role family", qualPts);

  // ---- penalties ----
  if (effAge > 168 && effAge <= prefs.freshnessDays * 24) add("Older than 7 days", -10);
  if (l.seasonInferred) add("Season only inferred", -5);
  if (elig.level === "review" && needsSponsorship(ctx.profile)) add("Sponsorship unclear", -5);
  if (STAFFING.test(l.company)) add("Staffing agency", -30);
  if (!matchesTargetRoles(l.title, prefs.targetRoles)) add("Unrelated role family", -40);

  const raw = reasons.reduce((s, r) => s + r.delta, 0);
  const priority = Math.max(0, Math.min(100, raw));

  const preferDiscovered = target?.priority === "instant";
  const tier = computeTier(priority, target?.priority ?? null, prefs, hidden);

  return {
    ...l,
    priority,
    tier,
    reasons: reasons.sort((a, b) => b.delta - a.delta),
    companyPriority: target?.priority ?? null,
    target,
    hasReferral,
    eligibilityLevel: elig.level,
    eligibilityLabel: elig.label,
    ageHours,
    discoveredHours,
    freshnessLabel: freshnessLabel(ageHours, discoveredHours, preferDiscovered),
    hidden,
    hiddenReason,
    alreadyApplied,
    estMinutes: estMinutes(l.source),
  };
}

/** Notification/placement tier from score + company priority + thresholds. */
export function computeTier(
  score: number,
  companyPriority: "instant" | "high" | "normal" | "muted" | null,
  prefs: RankingPrefs,
  hidden: boolean,
): RankTier {
  if (hidden) return "muted";
  if (companyPriority === "instant" && score >= prefs.instantMin) return "instant";
  if (score >= prefs.standardMin) return "standard";
  if (score >= prefs.digestMin) return "digest";
  return "silent";
}
