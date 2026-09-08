import type { Profile } from "../db/types";
import type { Listing } from "./types";

export type EligibilityLevel = "eligible" | "review" | "ineligible" | "unknown";

export interface Eligibility {
  level: EligibilityLevel;
  label: string;
  reasons: string[];
}

const SPONSORSHIP_AUTHS = new Set<string>(["f1_opt", "f1_cpt", "h1b", "tn", "need_sponsorship", "other"]);

/** Has the user answered any work-authorization question at all? */
function authKnown(p: Profile): boolean {
  return !!(p.work_auth || p.authorized_us || p.requires_sponsorship);
}
/** Can legally work in the US — their direct answer, or citizen/green-card status. */
function isAuthorized(p: Profile): boolean {
  return p.authorized_us === "Yes" || isCitizenOrPR(p);
}
function needsSponsorship(p: Profile): boolean {
  if (p.requires_sponsorship === "Yes") return true;
  if (p.requires_sponsorship === "No") return false; // trust the user's explicit answer
  return SPONSORSHIP_AUTHS.has(p.work_auth ?? "");
}
function isCitizen(p: Profile): boolean {
  return p.work_auth === "us_citizen";
}
function isCitizenOrPR(p: Profile): boolean {
  return p.work_auth === "us_citizen" || p.work_auth === "permanent_resident";
}
/** We can be sure they are NOT a U.S. citizen (a visa/PR status or needs sponsorship). */
function definitelyNotCitizen(p: Profile): boolean {
  return needsSponsorship(p) || p.work_auth === "permanent_resident" || SPONSORSHIP_AUTHS.has(p.work_auth ?? "");
}
function hasClearance(p: Profile): boolean {
  return p.security_clearance === "Yes";
}

/**
 * Estimate work-authorization eligibility for a posting from its sponsorship
 * signal + (optionally) its job description. Never a hard reject — returns a
 * level + human reasons the UI shows for the user to confirm.
 */
export function assessEligibility(profile: Profile | null, listing: Listing, jd?: string): Eligibility {
  if (!profile || !authKnown(profile)) {
    return { level: "unknown", label: "Set work authorization", reasons: ["Answer the work-authorization questions in Profile to check eligibility."] };
  }

  const hay = `${listing.sponsorship ?? ""} ${jd ?? ""}`.toLowerCase();
  const citizenReq = /citizens?[- ]only|u\.?s\.? citizen(ship)?\s*(is\s*)?(required|only)|must be a (u\.?s\.? )?citizen|citizenship (is )?required/.test(hay);
  const clearanceReq = /security clearance|secret clearance|ts\/sci|public trust|active clearance|clearance (is )?required/.test(hay);
  const usPersonReq = /u\.?s\.? person|export[- ]control|\bitar\b/.test(hay);
  const noSponsor = /does not (offer|provide) sponsor|no (visa )?sponsorship|not (able|willing|be able) to sponsor|unable to sponsor|without sponsorship|will not sponsor/.test(hay);
  const optCptOk = /\bopt\b|\bcpt\b|f-?1 (student|visa)|(consider|accept)[^.]{0,25}(opt|cpt)/.test(hay);

  // Security clearance — only a hard reject if the user said they don't have one.
  if (clearanceReq && !hasClearance(profile)) {
    if (profile.security_clearance === "No") {
      return { level: "ineligible", label: "Likely ineligible", reasons: ["Requires a security clearance and you indicated you don't have one."] };
    }
    return { level: "review", label: "Review — clearance required", reasons: ["Posting mentions a security clearance — verify whether you qualify."] };
  }

  // Citizenship / U.S.-person / export control.
  if (citizenReq || usPersonReq) {
    if (isCitizen(profile) || (usPersonReq && isCitizenOrPR(profile))) {
      return { level: "eligible", label: "Likely eligible", reasons: [citizenReq ? "U.S. citizenship required — you qualify." : "U.S.-person requirement — you qualify."] };
    }
    if (definitelyNotCitizen(profile)) {
      return { level: "ineligible", label: "Likely ineligible", reasons: [citizenReq ? "Requires U.S. citizenship, which your profile indicates you don't hold." : "U.S.-person / export-control restricted — your profile indicates you don't qualify."] };
    }
    // Authorized to work, but citizenship not specified — don't hard-reject, ask them to confirm.
    return { level: "review", label: "Review — may require citizenship", reasons: ["This posting may require U.S. citizenship. Set your work authorization in Profile to confirm."] };
  }

  // No citizenship/clearance barrier: authorized to work + no sponsorship needed → eligible.
  if (isAuthorized(profile) && !needsSponsorship(profile)) {
    return { level: "eligible", label: "Likely eligible", reasons: ["You're authorized to work in the U.S. with no sponsorship needed."] };
  }

  // From here: user needs sponsorship (F-1/OPT/CPT/H-1B, etc.)
  const reasons: string[] = [];
  if (optCptOk) reasons.push("Mentions OPT/CPT — internship-friendly for F-1.");

  if (noSponsor) {
    return {
      level: "review",
      label: "Review — states no sponsorship",
      reasons: [...reasons, "Employer says no visa sponsorship. An internship on CPT/OPT usually needs none — confirm they accept F-1 and don't require future sponsorship."],
    };
  }
  if (optCptOk) {
    return { level: "eligible", label: "Likely eligible", reasons };
  }
  return { level: "review", label: "Possibly eligible — verify", reasons: ["No explicit work-authorization requirement found. Verify the posting accepts F-1 / OPT / CPT."] };
}
