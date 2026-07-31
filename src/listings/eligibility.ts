import type { Profile } from "../db/types";
import type { Listing } from "./types";

export type EligibilityLevel = "eligible" | "review" | "ineligible" | "unknown";

export interface Eligibility {
  level: EligibilityLevel;
  label: string;
  reasons: string[];
}

const SPONSORSHIP_AUTHS = new Set<string>(["f1_opt", "f1_cpt", "h1b", "tn", "need_sponsorship", "other"]);

function needsSponsorship(p: Profile): boolean {
  return p.requires_sponsorship === "Yes" || SPONSORSHIP_AUTHS.has(p.work_auth ?? "");
}
function isCitizen(p: Profile): boolean {
  return p.work_auth === "us_citizen";
}
function isCitizenOrPR(p: Profile): boolean {
  return p.work_auth === "us_citizen" || p.work_auth === "permanent_resident";
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
  if (!profile?.work_auth) {
    return { level: "unknown", label: "Set work authorization", reasons: ["Add your work authorization in Profile to check eligibility."] };
  }

  const hay = `${listing.sponsorship ?? ""} ${jd ?? ""}`.toLowerCase();
  const citizenReq = /citizens?[- ]only|u\.?s\.? citizen(ship)?\s*(is\s*)?(required|only)|must be a (u\.?s\.? )?citizen|citizenship (is )?required/.test(hay);
  const clearanceReq = /security clearance|secret clearance|ts\/sci|public trust|active clearance|clearance (is )?required/.test(hay);
  const usPersonReq = /u\.?s\.? person|export[- ]control|\bitar\b/.test(hay);
  const noSponsor = /does not (offer|provide) sponsor|no (visa )?sponsorship|not (able|willing|be able) to sponsor|unable to sponsor|without sponsorship|will not sponsor/.test(hay);
  const optCptOk = /\bopt\b|\bcpt\b|f-?1 (student|visa)|(consider|accept)[^.]{0,25}(opt|cpt)/.test(hay);

  if (clearanceReq && !hasClearance(profile)) {
    return { level: "ineligible", label: "Likely ineligible", reasons: ["Requires a security clearance you haven't recorded."] };
  }

  if (citizenReq || usPersonReq) {
    if (isCitizen(profile)) {
      return { level: "eligible", label: "Likely eligible", reasons: ["U.S. citizenship required — you qualify."] };
    }
    return { level: "ineligible", label: "Likely ineligible", reasons: [citizenReq ? "U.S. citizenship is required." : "U.S. person / export-control restricted."] };
  }

  if (isCitizenOrPR(profile) || !needsSponsorship(profile)) {
    return { level: "eligible", label: "Likely eligible", reasons: ["No work-authorization barriers for you."] };
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
