import { listApplications } from "../db/applications";
import { listInterviews } from "../db/interviews";
import { listReferrals } from "../db/referrals";
import { getProfile } from "../db/profile";
import { listResumeVersions } from "../db/resumes";
import { getFeed } from "../listings/service";
import { INTERVIEW_TYPE_LABELS, type ReferralStatus } from "../db/types";

export type ActionKind =
  | "apply" | "followup" | "oa" | "interview" | "referral" | "thankyou" | "outcome" | "profile";

export interface NextAction {
  key: string;
  kind: ActionKind;
  title: string;
  detail: string;
  score: number;
  href: string;
}

const TERMINAL: ReferralStatus[] = ["declined", "no_response", "expired", "applied_through_referral"];

function today0(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysSince(dateStr: string, ref: Date): number {
  return Math.floor((ref.getTime() - new Date(dateStr).getTime()) / 86_400_000);
}
function daysUntil(dateStr: string, ref: Date): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - ref.getTime()) / 86_400_000);
}

/**
 * Compute a prioritized list of the highest-value next actions from the user's
 * data: upcoming interviews/OAs, follow-ups, referral steps, thank-yous, fresh
 * high-match postings, and profile gaps. Deterministic; feed part is best-effort.
 */
export async function getNextActions(limit = 8): Promise<NextAction[]> {
  const ref = today0();
  const actions: NextAction[] = [];

  const [apps, interviews, referrals, profile, resumes] = await Promise.all([
    listApplications(),
    listInterviews(),
    listReferrals(),
    getProfile(),
    listResumeVersions(),
  ]);

  // Applications: stale follow-ups + OAs in progress
  for (const a of apps) {
    if (a.status === "applied" && a.date_applied) {
      const days = daysSince(a.date_applied, ref);
      if (days >= 10) {
        actions.push({
          key: `followup-${a.id}`, kind: "followup",
          title: `Follow up with ${a.company_name ?? "a company"}`,
          detail: `${a.role_title} — applied ${days} days ago, no response yet.`,
          score: Math.min(74, 50 + (days - 10)), href: "/applications",
        });
      }
    }
    if (a.status === "oa") {
      actions.push({
        key: `oa-app-${a.id}`, kind: "oa",
        title: `Complete the OA for ${a.company_name ?? "a company"}`,
        detail: `${a.role_title} — online assessment received. Generate a prep plan.`,
        score: 86, href: "/prep",
      });
    }
  }

  // Interviews / OA events: upcoming prep + recent follow-up
  for (const iv of interviews) {
    if (!iv.date) continue;
    const inDays = daysUntil(iv.date, ref);
    const label = INTERVIEW_TYPE_LABELS[iv.type];
    if (inDays >= 0 && inDays <= 7) {
      const notReady = iv.prep_status !== "ready";
      actions.push({
        key: `iv-${iv.id}`, kind: iv.type === "oa" ? "oa" : "interview",
        title: `Prep for ${label} at ${iv.company_name ?? "a company"}`,
        detail: `${iv.role_title ?? ""}${iv.role_title ? " — " : ""}${inDays === 0 ? "today" : `in ${inDays} day(s)`}.${notReady ? " Prep not marked ready." : ""}`,
        score: 96 - inDays * 4 + (notReady ? 6 : 0), href: "/prep",
      });
    } else if (inDays < 0 && inDays >= -4) {
      actions.push({
        key: `iv-out-${iv.id}`, kind: "outcome",
        title: `Send a thank-you / log outcome — ${iv.company_name ?? "a company"}`,
        detail: `${label} was ${-inDays} day(s) ago.`,
        score: 78, href: "/prep",
      });
    }
  }

  // Referrals: overdue follow-up, agreed-but-unconfirmed, thank-you owed
  for (const r of referrals) {
    if (r.next_follow_up && !TERMINAL.includes(r.status) && new Date(r.next_follow_up) < ref) {
      actions.push({
        key: `ref-follow-${r.id}`, kind: "referral",
        title: `Follow up with ${r.contact_name ?? "your contact"}`,
        detail: `${r.company_name ?? "referral"} — follow-up was due ${r.next_follow_up}.`,
        score: 80, href: "/networking",
      });
    }
    if (r.status === "referral_agreed" && !r.confirmation_note?.trim()) {
      actions.push({
        key: `ref-confirm-${r.id}`, kind: "referral",
        title: `Confirm the referral from ${r.contact_name ?? "your contact"}`,
        detail: `${r.company_name ?? ""} — marked agreed but not confirmed submitted.`,
        score: 71, href: "/networking",
      });
    }
    if (r.status === "referral_confirmed" && r.thank_you_sent === 0) {
      actions.push({
        key: `ref-thanks-${r.id}`, kind: "thankyou",
        title: `Thank ${r.contact_name ?? "your contact"} for the referral`,
        detail: `${r.company_name ?? ""} — referral confirmed, no thank-you logged.`,
        score: 66, href: "/networking",
      });
    }
  }

  // Profile / résumé gaps
  if (!profile?.target_roles?.trim()) {
    actions.push({ key: "gap-roles", kind: "profile", title: "Set your target roles", detail: "Tailors the feed and matching to you.", score: 44, href: "/profile" });
  }
  if (resumes.length === 0) {
    actions.push({ key: "gap-resume", kind: "profile", title: "Add a résumé", detail: "Unlocks résumé matching and autofill.", score: 46, href: "/resumes" });
  } else if (!profile?.preferred_resume_id) {
    actions.push({ key: "gap-pref", kind: "profile", title: "Pick a preferred résumé", detail: "Used for match scoring and autofill.", score: 32, href: "/profile" });
  }

  // Fresh, high-match postings to apply (best-effort — the feed is large)
  try {
    const tracked = new Set(apps.map((a) => a.job_link).filter(Boolean));
    const { listings } = await getFeed();
    const fresh = listings
      .filter((l) => l.matchesRoles && l.isNew && l.score >= 60 && !tracked.has(l.url))
      .slice(0, 3);
    for (const l of fresh) {
      actions.push({
        key: `apply-${l.id}`, kind: "apply",
        title: `Apply to ${l.company} — ${l.title}`,
        detail: `New posting · ${l.score}% match. Fresh listings fill first.`,
        score: 52 + Math.round(l.score * 0.3), href: "/internships",
      });
    }
  } catch {
    /* feed unavailable — skip listing actions */
  }

  return actions.sort((a, b) => b.score - a.score).slice(0, limit);
}
