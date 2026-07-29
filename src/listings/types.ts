export interface Listing {
  id: string;
  company: string;
  title: string;
  url: string;
  locations: string[];
  sponsorship?: string;
  datePosted?: number; // unix seconds
  season?: string;
}

export interface RankedListing extends Listing {
  /** Normalized 0-100 profile match. */
  score: number;
  isNew: boolean;
  /** True when the listing's title matches one of the user's target roles. */
  matchesRoles: boolean;
  /** False when the listing's sponsorship stance conflicts with the user's work auth. */
  sponsorshipOk: boolean;
}
