import { getFeed } from "../listings/service";
import { getProfile } from "../db/profile";
import { listContacts } from "../db/contacts";
import { listApplications } from "../db/applications";
import { listResumeVersions } from "../db/resumes";
import type { ResumeVersion } from "../db/types";
import { ensureSeeded } from "./companies";
import { getPrefs } from "./prefs";
import { getDismissed } from "./feedback";
import { scoreOpportunity, type RankContext } from "./score";
import type { RankedOpportunity } from "./types";

function normName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Recommend the résumé version whose focus best matches the role family. */
export function recommendResume(o: RankedOpportunity, resumes: ResumeVersion[]): ResumeVersion | null {
  if (!resumes.length) return null;
  const hay = `${o.title} ${(o.skills ?? []).join(" ")}`.toLowerCase();
  const family = /security|infosec|appsec/.test(hay) ? "security"
    : /machine learning|\bml\b|\bai\b|data (scien|engineer)/.test(hay) ? "ml"
    : /back[\s-]?end|platform|infrastructure|cloud|devops|\bsre\b/.test(hay) ? "backend"
    : /front[\s-]?end|\bui\b|react/.test(hay) ? "frontend"
    : "general";
  const match = resumes.find((r) => `${r.name} ${r.target_role ?? ""}`.toLowerCase().includes(family));
  return match ?? resumes[0];
}

export interface OpportunityQueue {
  items: RankedOpportunity[]; // all visible, sorted by priority
  today: RankedOpportunity[]; // instant + standard tiers — "apply now"
  instant: RankedOpportunity[];
  digest: RankedOpportunity[]; // morning/evening digest tier
  resumes: ResumeVersion[];
  counts: { total: number; today: number; instant: number; digest: number; muted: number };
}

/**
 * The prioritized opportunity queue: every enabled source's listings run
 * through hard filters + transparent scoring, minus dismissed/applied ones,
 * sorted by priority. This is what the Fast Apply home renders.
 */
export async function getOpportunityQueue(force = false): Promise<OpportunityQueue> {
  ensureSeeded();
  const [{ listings }, profile, contacts, apps, resumes] = await Promise.all([
    getFeed(force),
    getProfile(),
    listContacts(),
    listApplications(),
    listResumeVersions(),
  ]);

  const ctx: RankContext = {
    profile,
    prefs: getPrefs(),
    contactCompanies: new Set(contacts.map((c) => normName(c.company_name ?? "")).filter(Boolean)),
    trackedUrls: new Set(apps.map((a) => a.job_link).filter((x): x is string => !!x)),
    now: Date.now(),
  };

  const dismissed = getDismissed();
  const scored = listings
    .map((l) => scoreOpportunity(l, ctx))
    .filter((o) => !dismissed.has(o.id));

  const visible = scored.filter((o) => !o.hidden && !o.alreadyApplied);
  visible.sort((a, b) =>
    b.priority - a.priority ||
    (b.datePosted ?? b.firstSeen ?? 0) - (a.datePosted ?? a.firstSeen ?? 0));

  const instant = visible.filter((o) => o.tier === "instant");
  const today = visible.filter((o) => o.tier === "instant" || o.tier === "standard");
  const digest = visible.filter((o) => o.tier === "digest");

  return {
    items: visible,
    today,
    instant,
    digest,
    resumes,
    counts: {
      total: visible.length,
      today: today.length,
      instant: instant.length,
      digest: digest.length,
      muted: scored.filter((o) => o.hidden).length,
    },
  };
}
