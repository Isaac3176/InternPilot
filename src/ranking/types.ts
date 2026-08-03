import type { RankedListing } from "../listings/types";
import type { EligibilityLevel } from "../listings/eligibility";
import type { CompanyPriority, TargetCompany } from "./companies";

/** Notification / placement tier derived from the priority score + company tier. */
export type RankTier = "instant" | "standard" | "digest" | "silent" | "muted";

/** One line of the "why this is ranked highly" explanation. */
export interface ScoreReason {
  label: string;
  delta: number;
}

/** A listing after hard filters + transparent scoring. */
export interface RankedOpportunity extends RankedListing {
  priority: number; // 0-100
  tier: RankTier;
  reasons: ScoreReason[];
  companyPriority: CompanyPriority | null;
  target: TargetCompany | null;
  hasReferral: boolean;
  eligibilityLevel: EligibilityLevel;
  eligibilityLabel: string;
  ageHours: number | null; // from posted date
  discoveredHours: number | null; // from first-seen date
  freshnessLabel: string;
  hidden: boolean; // failed hard filters / muted
  hiddenReason?: string;
  alreadyApplied: boolean;
  estMinutes: number;
}
